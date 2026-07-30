import {
  innerTextOf,
  parseAttrs,
  scanTags,
  scrubHtml,
  tokens,
  type TagMatch,
} from "./htmlScan.js";

/**
 * Pure SEO + accessibility audit of one standalone HTML document.
 *
 * Backs the "score my site / fix it with AI" flow: the report is what the
 * builder UI renders, and `buildFixInstruction()` turns the failures into the
 * revision prompt. It is offset/regex based on top of lib/htmlScan.ts because
 * the server has no DOM and no HTML parser dependency — adding one is not on
 * the table, so every check has to work off tag offsets and attribute strings.
 *
 * `auditHtml()` is a pure function of its input — no timestamp, no Date, no env
 * reads — so a report can be cached against a Version, diffed between versions
 * and compared with toEqual in tests.
 */

export type AuditCategory = "seo" | "accessibility";
export type AuditSeverity = "critical" | "warning" | "info";
export type CheckStatus = "pass" | "fail" | "na";

export interface AuditIssue {
  id: string;
  label: string;
  category: AuditCategory;
  severity: AuditSeverity;
  weight: number;
  /** Human explanation, including counts. */
  detail: string;
  /** Up to 3 offending snippets, each capped at 120 chars. */
  samples: string[];
  /** Imperative fragment fed to the model by buildFixInstruction(). */
  fix: string;
}

export interface AuditPassed {
  id: string;
  label: string;
  category: AuditCategory;
}

export interface AuditReport {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  seoScore: number;
  accessibilityScore: number;
  issues: AuditIssue[];
  passed: AuditPassed[];
  skipped: AuditPassed[];
  totalWeight: number;
  earnedWeight: number;
}

const MAX_SAMPLES = 3;
const MAX_SAMPLE_CHARS = 120;
const FIX_INSTRUCTION_MAX_CHARS = 1500;
const FIX_INSTRUCTION_MAX_ITEMS = 10;

/* ------------------------------------------------------------------ helpers */

/** Attribute read that survives a missing key — parseAttrs only holds what the tag wrote. */
const attr = (attrs: Record<string, string>, name: string): string =>
  attrs[name] ?? "";

/**
 * Presence test, kept separate from `attr()` because `alt=""` is a legitimate
 * pass for decorative images while a missing `alt` is a critical failure.
 */
const hasAttr = (attrs: Record<string, string>, name: string): boolean =>
  Object.prototype.hasOwnProperty.call(attrs, name);

const norm = (value: string): string => value.trim().toLowerCase();

/** Lower-cased with all whitespace removed — meta content is written `width=device-width, initial-scale=1`. */
const compact = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, "");

const count = (n: number, noun: string): string =>
  `${n} ${noun}${n === 1 ? "" : "s"}`;

const snippet = (text: string): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_SAMPLE_CHARS
    ? `${flat.slice(0, MAX_SAMPLE_CHARS - 1)}…`
    : flat;
};

/**
 * Offset of the close tag that matches `tag`, or the end of the document.
 *
 * Depth-counted so a `<label><label>…</label></label>` never truncates at the
 * inner close, which would make the outer label look like it wraps nothing and
 * report a labelled input as unlabelled.
 */
const matchingCloseIndex = (src: string, tag: TagMatch): number => {
  if (tag.selfClosing) return tag.end;
  // The scanner lower-cases names, but malformed markup can still yield one
  // with regex metacharacters; bail out instead of building a broken pattern.
  if (!/^[a-z][a-z0-9:_-]*$/.test(tag.name)) return src.length;

  const pattern = new RegExp(`<(/?)${tag.name}(?=[\\s/>])`, "gi");
  pattern.lastIndex = tag.end;

  let depth = 0;
  let match = pattern.exec(src);
  while (match !== null) {
    if (match[1] === "/") {
      if (depth === 0) return match.index;
      depth -= 1;
    } else {
      depth += 1;
    }
    match = pattern.exec(src);
  }
  return src.length;
};

/** Raw markup between a start tag and its matching close tag. */
const innerSourceOf = (src: string, tag: TagMatch): string =>
  src.slice(tag.end, matchingCloseIndex(src, tag));

type Element = { tag: TagMatch; attrs: Record<string, string> };

type Heading = { level: number; tag: TagMatch };

interface AuditDoc {
  /** Original input — samples are sliced from here so they read as authored. */
  raw: string;
  /** Scrubbed copy every check runs against. Offsets match `raw` exactly. */
  src: string;
  elements(name: string): Element[];
  all(): Element[];
  metas: Element[];
  titleTagCount: number;
  /** Collapsed, trimmed text of the first non-empty <title>. */
  titleText: string;
  descriptionTags: Element[];
  /** Non-empty `content` values of every <meta name="description">. */
  descriptions: string[];
  viewports: Element[];
  headings: Heading[];
  /** Every non-empty `for` value across the document's <label> tags. */
  labelForIds: Set<string>;
  /** Source ranges covered by each <label>, for the "input sits inside a label" test. */
  labelRanges: { from: number; to: number }[];
}

const HEADING_NAMES = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

const buildDoc = (html: string): AuditDoc => {
  const raw = typeof html === "string" ? html : "";
  // Scrub ONCE, up front. Everything downstream reads the scrubbed copy so an
  // <img> inside a <script> string or a commented-out <h1> never scores.
  const src = scrubHtml(raw);

  const cache = new Map<string, Element[]>();
  const collect = (key: string, name?: string): Element[] => {
    const cached = cache.get(key);
    if (cached) return cached;
    const found = scanTags(src, name).map((tag) => ({
      tag,
      attrs: parseAttrs(tag.attrSource),
    }));
    cache.set(key, found);
    return found;
  };

  const elements = (name: string): Element[] => collect(name, name);
  const all = (): Element[] => collect("*");

  const metas = elements("meta");
  const titleTags = scanTags(src, "title");
  const titleText =
    titleTags.map((tag) => innerTextOf(src, tag)).find((text) => text.trim() !== "")?.trim() ??
    "";

  const descriptionTags = metas.filter(
    (meta) => norm(attr(meta.attrs, "name")) === "description",
  );
  const descriptions = descriptionTags
    .map((meta) => attr(meta.attrs, "content").trim())
    .filter((content) => content !== "");

  const viewports = metas.filter(
    (meta) => norm(attr(meta.attrs, "name")) === "viewport",
  );

  const headings = HEADING_NAMES.flatMap((name, index) =>
    scanTags(src, name).map((tag) => ({ level: index + 1, tag })),
  ).sort((a, b) => a.tag.start - b.tag.start);

  const labels = elements("label");
  const labelForIds = new Set(
    labels
      .map((label) => attr(label.attrs, "for").trim())
      .filter((value) => value !== ""),
  );
  const labelRanges = labels.map((label) => ({
    from: label.tag.end,
    to: matchingCloseIndex(src, label.tag),
  }));

  return {
    raw,
    src,
    elements,
    all,
    metas,
    titleTagCount: titleTags.length,
    titleText,
    descriptionTags,
    descriptions,
    viewports,
    headings,
    labelForIds,
    labelRanges,
  };
};

const sampleOf = (doc: AuditDoc, tag: TagMatch): string =>
  snippet(doc.raw.slice(tag.start, tag.end));

const samplesOf = (doc: AuditDoc, elements: Element[]): string[] =>
  elements.slice(0, MAX_SAMPLES).map((element) => sampleOf(doc, element.tag));

const byPosition = (a: Element, b: Element): number => a.tag.start - b.tag.start;

const hasAriaName = (attrs: Record<string, string>): boolean =>
  attr(attrs, "aria-label").trim() !== "" ||
  attr(attrs, "aria-labelledby").trim() !== "" ||
  attr(attrs, "title").trim() !== "";

/** A nested `<img alt>` / `<svg aria-label>` names its interactive ancestor. */
const hasLabelledGraphic = (inner: string): boolean =>
  scanTags(inner, "img").some(
    (tag) => attr(parseAttrs(tag.attrSource), "alt").trim() !== "",
  ) ||
  scanTags(inner, "svg").some(
    (tag) => attr(parseAttrs(tag.attrSource), "aria-label").trim() !== "",
  );

/** Accessible-name test shared by the link and button checks. */
const hasAccessibleName = (doc: AuditDoc, element: Element): boolean =>
  innerTextOf(doc.src, element.tag).trim() !== "" ||
  hasAriaName(element.attrs) ||
  hasLabelledGraphic(innerSourceOf(doc.src, element.tag));

/** Viewport declarations that stop a low-vision user pinch-zooming. */
const zoomBlockers = (content: string): string[] => {
  const value = compact(content);
  const blockers: string[] = [];
  if (/user-scalable=(no|0)\b/.test(value)) blockers.push("user-scalable=no");
  // Parse the number rather than substring-matching "maximum-scale=1", or a
  // perfectly fine maximum-scale=10 would be reported as a zoom lock.
  const max = /maximum-scale=([0-9]*\.?[0-9]+)/.exec(value);
  if (max !== null) {
    const limit = Number.parseFloat(max[1]);
    if (!Number.isNaN(limit) && limit <= 1) {
      blockers.push(`maximum-scale=${max[1]}`);
    }
  }
  return blockers;
};

const ogKey = (attrs: Record<string, string>): string => {
  const property = norm(attr(attrs, "property"));
  // Open Graph specifies property=, but plenty of documents (and models) emit
  // name="og:title"; accepting both avoids a false failure on a page that
  // actually shares correctly.
  return property !== "" ? property : norm(attr(attrs, "name"));
};

const REQUIRED_OG_TAGS = ["og:title", "og:description", "og:image"] as const;

/** `type` values on <input> that behave as buttons, not as labelled fields. */
const BUTTON_INPUT_TYPES = new Set(["button", "submit", "reset"]);

/** `type` values on <input> that a <label> cannot meaningfully describe. */
const UNLABELLABLE_INPUT_TYPES = new Set([
  "hidden",
  "submit",
  "button",
  "reset",
  "image",
]);

/* ------------------------------------------------------------------- checks */

type CheckOutcome =
  | { status: "pass" }
  | { status: "na" }
  | { status: "fail"; detail: string; fix: string; samples?: string[] };

const PASS: CheckOutcome = { status: "pass" };
const NA: CheckOutcome = { status: "na" };

interface CheckDefinition {
  id: string;
  label: string;
  category: AuditCategory;
  severity: AuditSeverity;
  weight: number;
  run: (doc: AuditDoc) => CheckOutcome;
}

/**
 * The check table. Weights sum to exactly 100 (accessibility 51 + seo 49) and
 * audit.test.ts asserts that — the score is a percentage of *applicable*
 * weight, so a weight edit that breaks the sum silently rescales every report
 * that ever gets compared against another.
 */
const CHECKS: readonly CheckDefinition[] = [
  {
    id: "html-lang",
    label: "<html> declares a language",
    category: "accessibility",
    severity: "critical",
    weight: 8,
    run: (doc) => {
      const root = doc.elements("html")[0];
      if (!root) {
        return {
          status: "fail",
          detail: "The document has no <html> element to declare a language on.",
          fix: 'Wrap the document in <html lang="en">.',
        };
      }
      if (attr(root.attrs, "lang").trim() !== "") return PASS;
      return {
        status: "fail",
        detail: hasAttr(root.attrs, "lang")
          ? "The <html> element has an empty lang attribute, so assistive tech still has to guess the language."
          : "The <html> element has no lang attribute, so screen readers guess the language.",
        samples: [sampleOf(doc, root.tag)],
        fix: 'Add lang="en" to the <html> element.',
      };
    },
  },
  {
    id: "img-alt",
    label: "Images have alt text",
    category: "accessibility",
    severity: "critical",
    weight: 9,
    run: (doc) => {
      const images = doc.elements("img");
      if (images.length === 0) return NA;
      const offenders = images.filter((image) => !hasAttr(image.attrs, "alt"));
      if (offenders.length === 0) return PASS;
      return {
        status: "fail",
        detail: `${count(offenders.length, "<img> tag")} of ${images.length} have no alt attribute (alt="" is correct for purely decorative images).`,
        samples: samplesOf(doc, offenders),
        fix: `Add a descriptive alt attribute to every <img> (${offenders.length} missing); use alt="" only for decorative images.`,
      };
    },
  },
  {
    id: "link-text",
    label: "Links have discernible text",
    category: "accessibility",
    severity: "critical",
    weight: 7,
    run: (doc) => {
      // An <a> without href is a target/placeholder, not a link — it has no
      // accessible name requirement, so counting it would report false failures
      // on every anchor-only jump target.
      const links = doc.elements("a").filter((link) => hasAttr(link.attrs, "href"));
      if (links.length === 0) return NA;
      const offenders = links.filter((link) => !hasAccessibleName(doc, link));
      if (offenders.length === 0) return PASS;
      return {
        status: "fail",
        detail: `${count(offenders.length, "link")} of ${links.length} have no discernible text, aria-label, title or labelled icon.`,
        samples: samplesOf(doc, offenders),
        fix: `Give every link discernible text or an aria-label (${offenders.length} without either).`,
      };
    },
  },
  {
    id: "button-name",
    label: "Buttons have accessible names",
    category: "accessibility",
    severity: "critical",
    weight: 7,
    run: (doc) => {
      const buttons = doc.elements("button");
      const inputButtons = doc
        .elements("input")
        .filter((input) => BUTTON_INPUT_TYPES.has(norm(attr(input.attrs, "type"))));
      if (buttons.length + inputButtons.length === 0) return NA;

      const offenders = [
        ...buttons.filter((button) => !hasAccessibleName(doc, button)),
        // A button-ish <input> has no children: its `value` IS its label.
        ...inputButtons.filter(
          (input) =>
            attr(input.attrs, "value").trim() === "" &&
            attr(input.attrs, "aria-label").trim() === "",
        ),
      ].sort(byPosition);
      if (offenders.length === 0) return PASS;

      return {
        status: "fail",
        detail: `${count(offenders.length, "button")} of ${buttons.length + inputButtons.length} have no accessible name.`,
        samples: samplesOf(doc, offenders),
        fix: `Give every button an accessible name — visible text, value or aria-label (${offenders.length} without one).`,
      };
    },
  },
  {
    id: "input-label",
    label: "Form controls have labels",
    category: "accessibility",
    severity: "critical",
    weight: 7,
    run: (doc) => {
      const controls = [
        ...doc
          .elements("input")
          .filter(
            (input) =>
              !UNLABELLABLE_INPUT_TYPES.has(norm(attr(input.attrs, "type"))),
          ),
        ...doc.elements("select"),
        ...doc.elements("textarea"),
      ].sort(byPosition);
      if (controls.length === 0) return NA;

      const offenders = controls.filter((control) => {
        if (hasAriaName(control.attrs)) return false;
        const id = attr(control.attrs, "id").trim();
        if (id !== "" && doc.labelForIds.has(id)) return false;
        // Wrapped in a <label>: an offset containment test is the only
        // "is a descendant of" available without a DOM.
        return !doc.labelRanges.some(
          (range) => control.tag.start >= range.from && control.tag.start < range.to,
        );
      });
      if (offenders.length === 0) return PASS;

      return {
        status: "fail",
        detail: `${count(offenders.length, "form control")} of ${controls.length} have no label, aria-label or wrapping <label> (a placeholder is not a label).`,
        samples: samplesOf(doc, offenders),
        fix: `Label every form control with <label for="..."> or aria-label (${offenders.length} unlabelled); placeholder text does not count.`,
      };
    },
  },
  {
    id: "heading-order",
    label: "Heading levels don't skip",
    category: "accessibility",
    severity: "warning",
    weight: 4,
    run: (doc) => {
      const headings = doc.headings;
      if (headings.length < 2) return NA;

      // Only INCREASES matter. Going back up the tree (h3 then h1) starts a new
      // section and is perfectly valid; flagging it was the classic false
      // positive here.
      const jumps: Heading[] = [];
      const labels: string[] = [];
      for (let i = 1; i < headings.length; i += 1) {
        const previous = headings[i - 1];
        const current = headings[i];
        if (current.level - previous.level > 1) {
          jumps.push(current);
          labels.push(`h${previous.level} → h${current.level}`);
        }
      }
      if (jumps.length === 0) return PASS;

      return {
        status: "fail",
        detail: `${count(jumps.length, "heading level jump")} in document order: ${labels.slice(0, MAX_SAMPLES).join(", ")}.`,
        samples: jumps
          .slice(0, MAX_SAMPLES)
          .map((heading) => sampleOf(doc, heading.tag)),
        fix: `Fix the heading hierarchy so levels never skip (${labels.slice(0, 2).join(", ")}); change the tag only, not the text.`,
      };
    },
  },
  {
    id: "viewport-zoom",
    label: "Pinch-zoom is not disabled",
    category: "accessibility",
    severity: "warning",
    weight: 3,
    run: (doc) => {
      if (doc.viewports.length === 0) return NA;
      const blockers = Array.from(
        new Set(
          doc.viewports.flatMap((meta) => zoomBlockers(attr(meta.attrs, "content"))),
        ),
      );
      if (blockers.length === 0) return PASS;
      return {
        status: "fail",
        detail: `The viewport meta tag disables pinch-zoom (${blockers.join(", ")}).`,
        samples: samplesOf(doc, doc.viewports),
        fix: "Remove user-scalable=no and any maximum-scale from the viewport meta tag.",
      };
    },
  },
  {
    id: "duplicate-ids",
    label: "id values are unique",
    category: "accessibility",
    severity: "warning",
    weight: 3,
    run: (doc) => {
      const ids = doc
        .all()
        .map((element) => attr(element.attrs, "id").trim())
        .filter((id) => id !== "");
      if (ids.length < 2) return NA;

      const seen = new Map<string, number>();
      for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
      const duplicates = Array.from(seen.entries()).filter(([, n]) => n > 1);
      if (duplicates.length === 0) return PASS;

      const listed = duplicates
        .slice(0, MAX_SAMPLES)
        .map(([id, n]) => `"${id}" (×${n})`);
      return {
        status: "fail",
        detail: `${count(duplicates.length, "id value")} of ${ids.length} appear more than once: ${listed.join(", ")}.`,
        samples: duplicates
          .slice(0, MAX_SAMPLES)
          .map(([id, n]) => snippet(`id="${id}" used ${n} times`)),
        fix: `Rename duplicated ids so every id is unique (${count(duplicates.length, "value")} repeated) and update any for/href references.`,
      };
    },
  },
  {
    id: "main-landmark",
    label: "Page has a main landmark",
    category: "accessibility",
    severity: "info",
    weight: 3,
    run: (doc) => {
      if (doc.elements("main").length > 0) return PASS;
      if (doc.all().some((element) => norm(attr(element.attrs, "role")) === "main")) {
        return PASS;
      }
      return {
        status: "fail",
        detail: 'The page has no <main> element and no role="main" landmark, so skip-to-content never lands anywhere.',
        fix: "Wrap the primary page content in a <main> element without changing the markup inside it.",
      };
    },
  },
  {
    id: "title-present",
    label: "Page has a <title>",
    category: "seo",
    severity: "critical",
    weight: 9,
    run: (doc) => {
      if (doc.titleText !== "") return PASS;
      return {
        status: "fail",
        detail:
          doc.titleTagCount === 0
            ? "The document has no <title> element, so search results and browser tabs fall back to the URL."
            : "The <title> element is empty.",
        fix: "Add a <title> in <head> that describes the page in 15-60 characters.",
      };
    },
  },
  {
    id: "meta-description-present",
    label: "Meta description present",
    category: "seo",
    severity: "critical",
    weight: 7,
    run: (doc) => {
      if (doc.descriptions.length > 0) return PASS;
      return {
        status: "fail",
        detail:
          doc.descriptionTags.length === 0
            ? 'There is no <meta name="description"> tag.'
            : `${count(doc.descriptionTags.length, '<meta name="description"> tag')} present, all with empty content.`,
        samples: samplesOf(doc, doc.descriptionTags),
        fix: 'Add <meta name="description" content="..."> with a 50-160 character summary of the page.',
      };
    },
  },
  {
    id: "meta-charset",
    label: "Character encoding declared",
    category: "seo",
    severity: "critical",
    weight: 6,
    run: (doc) => {
      const declared = doc.metas.some(
        (meta) => attr(meta.attrs, "charset").trim() !== "",
      );
      const legacy = doc.metas.some(
        (meta) =>
          norm(attr(meta.attrs, "http-equiv")) === "content-type" &&
          compact(attr(meta.attrs, "content")).includes("charset="),
      );
      if (declared || legacy) return PASS;
      return {
        status: "fail",
        detail: `No character encoding is declared (${count(doc.metas.length, "<meta> tag")} found, none with charset).`,
        fix: 'Add <meta charset="utf-8"> as the first tag in <head>.',
      };
    },
  },
  {
    id: "meta-viewport",
    label: "Responsive viewport meta tag",
    category: "seo",
    severity: "critical",
    weight: 6,
    run: (doc) => {
      if (
        doc.viewports.some((meta) =>
          compact(attr(meta.attrs, "content")).includes("width=device-width"),
        )
      ) {
        return PASS;
      }
      return {
        status: "fail",
        detail:
          doc.viewports.length === 0
            ? 'There is no <meta name="viewport"> tag, so mobile browsers render the page at desktop width.'
            : `${count(doc.viewports.length, "viewport meta tag")} present, none declaring width=device-width.`,
        samples: samplesOf(doc, doc.viewports),
        fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to <head>.',
      };
    },
  },
  {
    id: "single-h1",
    label: "Exactly one <h1>",
    category: "seo",
    severity: "warning",
    weight: 6,
    run: (doc) => {
      const h1s = doc.elements("h1");
      if (h1s.length === 1) return PASS;
      return {
        status: "fail",
        detail:
          h1s.length === 0
            ? "The page has no <h1>, so nothing declares its main topic."
            : `The page has ${count(h1s.length, "<h1>")}; exactly one is expected.`,
        samples: samplesOf(doc, h1s),
        fix:
          h1s.length === 0
            ? "Promote the main page heading to a single <h1>, keeping its text and classes."
            : `Keep exactly one <h1> and demote the other ${h1s.length - 1} to <h2>, keeping their text and classes.`,
      };
    },
  },
  {
    id: "title-length",
    label: "Title is 15-60 characters",
    category: "seo",
    severity: "warning",
    weight: 4,
    run: (doc) => {
      // Missing/empty titles are title-present's failure; scoring them twice
      // would double-penalise one mistake.
      if (doc.titleText === "") return NA;
      const length = doc.titleText.length;
      if (length >= 15 && length <= 60) return PASS;
      const tooShort = length < 15;
      return {
        status: "fail",
        detail: `The <title> is too ${tooShort ? "short" : "long"} at ${count(length, "character")}; aim for 15-60.`,
        samples: [snippet(doc.titleText)],
        fix: tooShort
          ? `Lengthen the <title> to 15-60 characters (currently ${length}).`
          : `Shorten the <title> to 60 characters or fewer (currently ${length}).`,
      };
    },
  },
  {
    id: "og-tags",
    label: "Open Graph tags for sharing",
    category: "seo",
    severity: "info",
    weight: 4,
    run: (doc) => {
      const missing = REQUIRED_OG_TAGS.filter(
        (key) =>
          !doc.metas.some(
            (meta) =>
              ogKey(meta.attrs) === key && attr(meta.attrs, "content").trim() !== "",
          ),
      );
      if (missing.length === 0) return PASS;
      return {
        status: "fail",
        detail: `${count(missing.length, "Open Graph tag")} missing: ${missing.join(", ")}.`,
        fix: `Add the missing Open Graph meta tags in <head>: ${missing.join(", ")}.`,
      };
    },
  },
  {
    id: "meta-description-length",
    label: "Description is 50-160 characters",
    category: "seo",
    severity: "warning",
    weight: 3,
    run: (doc) => {
      const description = doc.descriptions[0];
      // Absent description is meta-description-present's failure, not this one.
      if (description === undefined) return NA;
      const length = description.length;
      if (length >= 50 && length <= 160) return PASS;
      const tooShort = length < 50;
      return {
        status: "fail",
        detail: `The meta description is too ${tooShort ? "short" : "long"} at ${count(length, "character")}; aim for 50-160.`,
        samples: [snippet(description)],
        fix: tooShort
          ? `Lengthen the meta description to 50-160 characters (currently ${length}).`
          : `Shorten the meta description to 160 characters or fewer (currently ${length}).`,
      };
    },
  },
  {
    id: "favicon",
    label: "Favicon declared",
    category: "seo",
    severity: "info",
    weight: 2,
    run: (doc) => {
      const declared = doc.elements("link").some((link) => {
        const rels = tokens(attr(link.attrs, "rel"));
        return (
          (rels.includes("icon") || rels.includes("apple-touch-icon")) &&
          attr(link.attrs, "href").trim() !== ""
        );
      });
      if (declared) return PASS;
      return {
        status: "fail",
        detail: `No favicon is declared (${count(doc.elements("link").length, "<link> tag")} found, none with rel="icon").`,
        fix: 'Add <link rel="icon" href="/favicon.ico"> to <head>.',
      };
    },
  },
  {
    id: "link-noopener",
    label: 'target="_blank" links set rel=noopener',
    category: "seo",
    severity: "info",
    weight: 2,
    run: (doc) => {
      const blankLinks = doc
        .elements("a")
        .filter((link) => norm(attr(link.attrs, "target")) === "_blank");
      if (blankLinks.length === 0) return NA;
      const offenders = blankLinks.filter((link) => {
        const rels = tokens(attr(link.attrs, "rel"));
        return !rels.includes("noopener") && !rels.includes("noreferrer");
      });
      if (offenders.length === 0) return PASS;
      return {
        status: "fail",
        detail: `${count(offenders.length, 'target="_blank" link')} of ${blankLinks.length} have no rel="noopener"/"noreferrer".`,
        samples: samplesOf(doc, offenders),
        fix: `Add rel="noopener noreferrer" to the ${count(offenders.length, 'target="_blank" link')}.`,
      };
    },
  },
];

/** The check table without the runners — safe to serialise to the client. */
export const AUDIT_CHECKS: readonly {
  id: string;
  label: string;
  category: AuditCategory;
  severity: AuditSeverity;
  weight: number;
}[] = CHECKS.map(({ id, label, category, severity, weight }) => ({
  id,
  label,
  category,
  severity,
  weight,
}));

/* -------------------------------------------------------------------- score */

/**
 * `na` checks are excluded from BOTH sides of the ratio: a page with no images
 * must be neither penalised nor rewarded for img-alt. A document where nothing
 * is applicable scores 100 rather than dividing by zero.
 */
const ratio = (earned: number, total: number): number =>
  total === 0 ? 100 : Math.round((100 * earned) / total);

const gradeFor = (score: number): AuditReport["grade"] => {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
};

export const auditHtml = (html: string): AuditReport => {
  const doc = buildDoc(html);

  const issues: AuditIssue[] = [];
  const passed: AuditPassed[] = [];
  const skipped: AuditPassed[] = [];

  const tallies: Record<AuditCategory, { total: number; earned: number }> = {
    accessibility: { total: 0, earned: 0 },
    seo: { total: 0, earned: 0 },
  };

  let totalWeight = 0;
  let earnedWeight = 0;

  for (const check of CHECKS) {
    const outcome = check.run(doc);
    const brief: AuditPassed = {
      id: check.id,
      label: check.label,
      category: check.category,
    };

    if (outcome.status === "na") {
      skipped.push(brief);
      continue;
    }

    totalWeight += check.weight;
    tallies[check.category].total += check.weight;

    if (outcome.status === "pass") {
      earnedWeight += check.weight;
      tallies[check.category].earned += check.weight;
      passed.push(brief);
      continue;
    }

    issues.push({
      id: check.id,
      label: check.label,
      category: check.category,
      severity: check.severity,
      weight: check.weight,
      detail: outcome.detail,
      samples: (outcome.samples ?? []).slice(0, MAX_SAMPLES),
      fix: outcome.fix,
    });
  }

  // Heaviest first, then id — a stable order so two reports of the same
  // document are byte-identical and the fix prompt is deterministic.
  issues.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));

  const score = ratio(earnedWeight, totalWeight);

  return {
    score,
    grade: gradeFor(score),
    seoScore: ratio(tallies.seo.earned, tallies.seo.total),
    accessibilityScore: ratio(
      tallies.accessibility.earned,
      tallies.accessibility.total,
    ),
    issues,
    passed,
    skipped,
    totalWeight,
    earnedWeight,
  };
};

/* ------------------------------------------------------------- fix prompting */

const FIX_PREAMBLE =
  "Fix the following SEO and accessibility problems in the HTML document. " +
  "Keep the existing design, layout, wording and Tailwind classes exactly as they are, " +
  "making only the minimal markup changes needed:";

const FIX_CLOSING = "Do not change any visible text, colours or layout.";

/**
 * Renders a report as a revision instruction, or null when there is nothing to fix.
 *
 * Hard-capped at 10 items and ~1500 characters because the caller sends this
 * alongside a ~40KB HTML document to a free-tier model with a real context
 * limit — and the closing "don't redesign" line is budgeted for up front, since
 * an instruction that loses it comes back as a rewritten page instead of a
 * patched one. No "...and N more" tail: the model would try to guess them.
 */
export const buildFixInstruction = (report: AuditReport): string | null => {
  if (report.issues.length === 0) return null;

  const lines: string[] = [];
  let used = FIX_PREAMBLE.length + FIX_CLOSING.length + 2;

  for (const issue of report.issues.slice(0, FIX_INSTRUCTION_MAX_ITEMS)) {
    const line = `${lines.length + 1}. ${issue.fix}`;
    if (used + line.length + 1 > FIX_INSTRUCTION_MAX_CHARS) break;
    lines.push(line);
    used += line.length + 1;
  }

  return `${FIX_PREAMBLE}\n${lines.join("\n")}\n${FIX_CLOSING}`;
};
