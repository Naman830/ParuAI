/**
 * Offset-preserving tag scanner for a single standalone HTML document.
 *
 * The SEO/accessibility audit has to look inside generated pages, and this
 * server ships no HTML parser (and must not grow one). So every check is
 * expressed as "find the start tags, read their attributes, read their text" —
 * pure regex/string work, zero dependencies.
 *
 * This is deliberately NOT a parser: it builds no element tree, has no
 * implied-end-tag handling and no error recovery. Its one real invariant is
 * that every offset it hands back indexes the string that was passed in, so a
 * caller can scan the scrubbed copy and still slice text out of the original.
 */

/*
 * KNOWN LIMITS (all verified in htmlScan.test.ts)
 *
 * 1. A `>` inside a QUOTED attribute value is handled — that is what the
 *    quote-aware alternation in TAG_RE buys. A `>` inside an UNQUOTED value
 *    (`<a title=a>b>`) still terminates the tag early; that is invalid HTML,
 *    so no attempt is made to recover it.
 * 2. An unquoted value ending in `/` (`<a href=/foo/>`) is misread as
 *    self-closing, and that trailing `/` is stripped off the value. Nothing
 *    consumes `selfClosing` for correctness — it only suppresses the pointless
 *    innerTextOf() lookup on void elements — so the misread is cosmetic.
 * 3. A stray apostrophe in an unquoted attribute context (`<div data-x=it's>`)
 *    kills the scan of THAT tag: the `'` can neither be consumed as plain text
 *    nor closed as a quoted value. Tags after it still scan normally.
 * 4. No nesting model: innerTextOf() stops at the FIRST matching close tag, so
 *    a self-nested element (`<div>a<div>b</div>c</div>`) yields only the text
 *    before its inner twin's close tag.
 * 5. Tag names and attribute NAMES are lower-cased; attribute VALUES and text
 *    keep their original case (an audit reports `alt` text back to the user).
 * 6. All three self-closing spellings are recognised: `<img>`, `<img/>`,
 *    `<img />`.
 */

export interface TagMatch {
  /** Lower-cased tag name, e.g. `img`. */
  name: string;
  /** The raw attribute blob exactly as authored, minus any trailing `/`. */
  attrSource: string;
  /** Index of `<` in the scanned string. */
  start: number;
  /** Index just past `>`, so `src.slice(start, end)` is the raw start tag. */
  end: number;
  selfClosing: boolean;
}

/** `<!-- ... -->`, plus an unterminated comment running to end-of-string. */
const COMMENT_RE = /<!--([\s\S]*?)(?:-->|$)/g;

/**
 * Elements whose children are text/CSS/JS rather than markup.
 *
 * `noscript` is missing on purpose: its content is real markup that non-JS
 * users actually see, so an audit has to keep scanning it. The backreference
 * `\1` is case-insensitive under /i, so `<SCRIPT>…</SCRIPT>` pairs up too, and
 * the `|$` branch makes an unterminated block blank to end-of-string instead of
 * being left as scannable markup.
 */
const RAW_TEXT_RE =
  /<(script|style|template)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>([\s\S]*?)(?:<\/\1\s*>|$)/gi;

const blank = (length: number): string => " ".repeat(length);

/**
 * Blanks out script/style/template bodies and comment bodies, replacing each
 * with a run of spaces of EXACTLY the same length.
 *
 * Equal length is the whole trick. A generated page is one file with its CSS
 * and JS inline, and a JS string like `"<h1>fake</h1>"` or a commented-out
 * block would otherwise be counted as real markup (a document with one visible
 * <h1> was reported as having two). Padding instead of deleting keeps every
 * byte offset valid, so TagMatch.start/end and innerTextOf() work against the
 * scrubbed copy and the original interchangeably.
 */
export const scrubHtml = (html: string): string =>
  html
    // Comments first: a commented-out `<script>` has no `</script>`, so
    // blanking raw text first would hit the `|$` branch and swallow the rest of
    // the document along with it.
    .replace(COMMENT_RE, (match: string, inner: string) => {
      const openLen = "<!--".length;
      return (
        match.slice(0, openLen) +
        blank(inner.length) +
        match.slice(openLen + inner.length)
      );
    })
    .replace(
      RAW_TEXT_RE,
      (match: string, name: string, attrs: string, inner: string) => {
        // The opening tag is `<` + name + attrs + `>` and nothing else, so this
        // is its exact length; slicing rather than rebuilding keeps the
        // author's original casing and spacing byte-for-byte.
        const openLen = 1 + name.length + attrs.length + 1;
        return (
          match.slice(0, openLen) +
          blank(inner.length) +
          match.slice(openLen + inner.length)
        );
      },
    );

/**
 * One quote-aware pattern for every start tag.
 *
 * The alternation consumes whole quoted values before falling back to `[^>"']`,
 * so a `>` inside `alt="a > b"` cannot terminate the tag. `[^>"']` also matches
 * newlines, which is what makes multiline start tags work without the /s flag.
 * `<` must be followed by a letter, which excludes end tags, `<!DOCTYPE …>` and
 * `<!-- … -->` for free.
 */
const TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

/** XHTML-style self-closing marker, e.g. the `/` in `<br />`. */
const TRAILING_SLASH_RE = /\/\s*$/;

/** Every start tag in `src`, in document order; `name` filters by tag name. */
export const scanTags = (src: string, name?: string): TagMatch[] => {
  const wanted = name?.toLowerCase();
  const found: TagMatch[] = [];

  // TAG_RE is module-level and /g: reset rather than trust the previous call to
  // have run to exhaustion, since a throw mid-loop would leave lastIndex
  // pointing into the old string and silently skip this document's first tags.
  TAG_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(src)) !== null) {
    const tagName = match[1].toLowerCase();
    if (wanted && tagName !== wanted) continue;

    // Derived after the fact, not baked into TAG_RE: making the `/` part of the
    // pattern would have it compete with the attribute alternation.
    const rawAttrs = match[2];
    const selfClosing = TRAILING_SLASH_RE.test(rawAttrs);

    found.push({
      name: tagName,
      attrSource: selfClosing
        ? rawAttrs.replace(TRAILING_SLASH_RE, "")
        : rawAttrs,
      start: match.index,
      end: match.index + match[0].length,
      selfClosing,
    });
  }

  return found;
};

/**
 * Name, then optionally `=` and a value in one of HTML's three spellings.
 * Group 2 keeps its surrounding quotes so a valueless attribute (group 2
 * undefined) stays distinguishable from `alt=""` (group 2 = `""`).
 */
const ATTR_RE =
  /([a-zA-Z_:][a-zA-Z0-9_.:-]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;

const ENTITIES = new Map<string, string>([
  ["&amp;", "&"],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&quot;", '"'],
  ["&#39;", "'"],
  ["&apos;", "'"],
  // A normal space, so innerTextOf()'s collapse treats `a&nbsp;b` as two words
  // rather than one unbreakable token.
  ["&nbsp;", " "],
]);

const ENTITY_RE = /&(?:amp|lt|gt|quot|apos|nbsp|#39);/g;

/**
 * Decodes the handful of entities that actually show up in generated pages.
 *
 * Single pass on purpose: decoding `&amp;` in its own pass would turn the
 * literal text `&amp;lt;` into `&lt;` and then into `<`, i.e. invent markup
 * that the author escaped deliberately.
 */
const decodeEntities = (value: string): string =>
  value.replace(ENTITY_RE, (entity) => ENTITIES.get(entity) ?? entity);

/** Attributes of a start tag, keyed by lower-cased name. */
export const parseAttrs = (attrSource: string): Record<string, string> => {
  const attrs: Record<string, string> = {};

  ATTR_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(attrSource)) !== null) {
    const key = match[1].toLowerCase();

    // First occurrence wins, matching how a browser resolves a duplicate
    // attribute. hasOwnProperty rather than `in`, because `<div constructor=x>`
    // would otherwise look like an already-seen key via Object.prototype and
    // get dropped.
    if (Object.prototype.hasOwnProperty.call(attrs, key)) continue;

    const rawValue = match[2]; // undefined for a valueless attribute
    let value = "";
    if (rawValue) {
      const quote = rawValue[0];
      value = quote === '"' || quote === "'" ? rawValue.slice(1, -1) : rawValue;
    }

    attrs[key] = decodeEntities(value);
  }

  return attrs;
};

/** Start tags, end tags and comments — everything innerTextOf() drops. */
const INNER_TAG_RE =
  /<!--[\s\S]*?-->|<\/?[a-zA-Z][a-zA-Z0-9-]*(?:"[^"]*"|'[^']*'|[^>"'])*>/g;

/** Characters that would turn a tag name into a regex operator. */
const REGEX_META_RE = /[.*+?^${}()|[\]\\]/g;

/**
 * Visible text between `tag` and its close tag: descendant markup removed,
 * entities decoded, whitespace collapsed, trimmed.
 *
 * Nested tags are removed rather than replaced with a space, so
 * `<title>My <b>Site</b></title>` reads back as the string a search engine
 * would show. Stripping happens BEFORE decoding, otherwise an escaped
 * `&lt;b&gt;` would decode into `<b>` and then be stripped as if it were a real
 * element.
 */
export const innerTextOf = (src: string, tag: TagMatch): string => {
  if (tag.selfClosing) return "";

  // The negative lookahead stops a <p> from ending at the `</p` inside
  // `</pre>`; the escape stops a hand-built TagMatch name from throwing a
  // regex SyntaxError and taking down the whole audit request.
  const closeTag = new RegExp(
    `</${tag.name.replace(REGEX_META_RE, "\\$&")}(?![a-zA-Z0-9-])`,
    "i",
  );

  const rest = src.slice(tag.end);
  const closeAt = rest.search(closeTag);
  if (closeAt === -1) return ""; // unclosed: no trustworthy text range

  return decodeEntities(rest.slice(0, closeAt).replace(INNER_TAG_RE, ""))
    .replace(/\s+/g, " ")
    .trim();
};

/** Splits a space-separated attribute (`rel`, `type`, `role`) into lower-cased tokens. */
export const tokens = (attrValue: string): string[] =>
  attrValue
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
