import { describe, expect, it } from "vitest";
import {
  AUDIT_CHECKS,
  auditHtml,
  buildFixInstruction,
  type AuditIssue,
  type AuditReport,
  type CheckStatus,
} from "./audit.js";

/* ----------------------------------------------------------------- fixtures */

/** Fully compliant: every one of the 19 checks is applicable AND passes. */
const GOOD_DOC = [
  "<!DOCTYPE html>",
  '<html lang="en">',
  "<head>",
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  "<title>Acme Studio - Design and Build</title>",
  '<meta name="description" content="Acme Studio designs and builds fast, accessible marketing sites for small teams that need to ship quickly.">',
  '<meta property="og:title" content="Acme Studio">',
  '<meta property="og:description" content="Design and build">',
  '<meta property="og:image" content="https://acme.test/og.png">',
  '<link rel="icon" href="/favicon.ico">',
  "</head>",
  "<body>",
  '<main id="content">',
  "<h1>Acme Studio</h1>",
  "<h2>What we do</h2>",
  '<img src="/hero.png" alt="The Acme team at work">',
  '<a href="/work">See our work</a>',
  '<a href="https://partner.test" target="_blank" rel="noopener noreferrer">Partner site</a>',
  '<button type="button">Get in touch</button>',
  '<input type="submit" value="Send">',
  '<label for="email">Email</label>',
  '<input id="email" type="email">',
  '<select id="plan" aria-label="Plan"><option>Basic</option></select>',
  '<input type="hidden" name="csrf" value="x">',
  "</main>",
  '<footer id="footer">Acme Inc</footer>',
  "</body>",
  "</html>",
].join("\n");

/** Fails every applicable check; only the two length checks come back `na`. */
const BAD_DOC = [
  "<html>",
  '<head><meta name="viewport" content="user-scalable=no"></head>',
  "<body>",
  '<div id="dup">a</div><div id="dup">b</div>',
  "<h2>Second level, first heading</h2>",
  "<h4>Skips a level</h4>",
  '<img src="/hero.png">',
  '<a href="/about"></a>',
  '<a href="https://partner.test" target="_blank">Partner</a>',
  "<button></button>",
  '<input type="text" placeholder="Email">',
  "</body>",
  "</html>",
].join("\n");

/**
 * Every check the builder below can flip, i.e. all of them except the two whose
 * failure makes a length check `na` and so changes the denominator.
 */
const TOGGLEABLE = [
  "html-lang",
  "img-alt",
  "link-text",
  "button-name",
  "input-label",
  "heading-order",
  "viewport-zoom",
  "duplicate-ids",
  "main-landmark",
  "meta-charset",
  "meta-viewport",
  "single-h1",
  "title-length",
  "og-tags",
  "meta-description-length",
  "favicon",
  "link-noopener",
] as const;

/**
 * Builds a document that fails exactly the named checks and passes every other
 * one, with all 19 applicable. Because totalWeight is then always 100, the
 * expected score is simply `100 - sum(weights of the failed checks)`, which is
 * what makes the grade-boundary and scoring cases below exact rather than
 * approximate.
 */
const docFailing = (fail: readonly string[] = []): string => {
  const f = (id: string): boolean => fail.includes(id);
  return [
    "<!DOCTYPE html>",
    `<html${f("html-lang") ? "" : ' lang="en"'}>`,
    "<head>",
    f("meta-charset") ? "" : '<meta charset="utf-8">',
    `<meta name="viewport" content="${
      f("meta-viewport") ? "initial-scale=1" : "width=device-width, initial-scale=1"
    }${f("viewport-zoom") ? ", user-scalable=no" : ""}">`,
    `<title>${
      f("title-length") ? "Tiny" : "A perfectly ordinary marketing page title"
    }</title>`,
    `<meta name="description" content="${
      f("meta-description-length")
        ? "Too short to be useful."
        : "A description that sits comfortably inside the fifty to one hundred and sixty character window search engines want."
    }">`,
    f("og-tags")
      ? ""
      : '<meta property="og:title" content="T"><meta property="og:description" content="D"><meta property="og:image" content="/og.png">',
    f("favicon") ? "" : '<link rel="icon" href="/favicon.ico">',
    "</head>",
    "<body>",
    f("main-landmark") ? '<div id="content">' : '<main id="content">',
    f("single-h1") ? "<h1>One</h1><h1>Two</h1>" : "<h1>One</h1>",
    f("heading-order") ? "<h3>Skips a level</h3>" : "<h2>Next level</h2>",
    f("img-alt") ? '<img src="/a.png">' : '<img src="/a.png" alt="A picture">',
    f("link-text") ? '<a href="/about"></a>' : '<a href="/about">About us</a>',
    `<a href="https://x.test" target="_blank"${
      f("link-noopener") ? "" : ' rel="noopener"'
    }>Partner</a>`,
    f("button-name") ? "<button></button>" : '<button type="button">Send</button>',
    f("input-label")
      ? '<input id="email" type="email" placeholder="Email">'
      : '<label for="email">Email</label><input id="email" type="email">',
    f("duplicate-ids")
      ? '<p id="dup">a</p><p id="dup">b</p>'
      : '<p id="first">a</p><p id="second">b</p>',
    f("main-landmark") ? "</div>" : "</main>",
    "</body>",
    "</html>",
  ].join("\n");
};

const weightOf = (id: string): number => {
  const check = AUDIT_CHECKS.find((entry) => entry.id === id);
  if (!check) throw new Error(`unknown check id: ${id}`);
  return check.weight;
};

const expectedScore = (fail: readonly string[]): number =>
  100 - fail.reduce((sum, id) => sum + weightOf(id), 0);

const statusOf = (html: string, id: string): CheckStatus | "unknown" => {
  const report = auditHtml(html);
  if (report.issues.some((issue) => issue.id === id)) return "fail";
  if (report.passed.some((entry) => entry.id === id)) return "pass";
  if (report.skipped.some((entry) => entry.id === id)) return "na";
  return "unknown";
};

const issueOf = (html: string, id: string): AuditIssue => {
  const issue = auditHtml(html).issues.find((entry) => entry.id === id);
  if (!issue) throw new Error(`expected ${id} to fail`);
  return issue;
};

/* ---------------------------------------------------------------- structural */

describe("AUDIT_CHECKS", () => {
  it("weights sum to exactly 100", () => {
    const total = AUDIT_CHECKS.reduce((sum, check) => sum + check.weight, 0);
    expect(total).toBe(100);
  });

  it("splits into 51 accessibility and 49 seo weight", () => {
    const subtotal = (category: string) =>
      AUDIT_CHECKS.filter((check) => check.category === category).reduce(
        (sum, check) => sum + check.weight,
        0,
      );
    expect(subtotal("accessibility")).toBe(51);
    expect(subtotal("seo")).toBe(49);
  });

  it("has unique ids", () => {
    const ids = AUDIT_CHECKS.map((check) => check.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exposes 19 checks with metadata only, never the runner", () => {
    expect(AUDIT_CHECKS.length).toBe(19);
    for (const check of AUDIT_CHECKS) {
      expect(Object.keys(check).sort()).toEqual([
        "category",
        "id",
        "label",
        "severity",
        "weight",
      ]);
      expect(check.label.length).toBeGreaterThan(0);
      expect(check.weight).toBeGreaterThan(0);
    }
  });

  it("only uses the documented categories and severities", () => {
    for (const check of AUDIT_CHECKS) {
      expect(["seo", "accessibility"]).toContain(check.category);
      expect(["critical", "warning", "info"]).toContain(check.severity);
    }
  });
});

/* -------------------------------------------------------------- document level */

describe("auditHtml", () => {
  it("scores a fully compliant document 100 / grade A with no issues", () => {
    const report = auditHtml(GOOD_DOC);
    expect(report.score).toBe(100);
    expect(report.grade).toBe("A");
    expect(report.issues).toEqual([]);
    expect(report.seoScore).toBe(100);
    expect(report.accessibilityScore).toBe(100);
  });

  it("finds every check applicable on the compliant fixture", () => {
    const report = auditHtml(GOOD_DOC);
    expect(report.skipped).toEqual([]);
    expect(report.passed.length).toBe(AUDIT_CHECKS.length);
    expect(report.totalWeight).toBe(100);
    expect(report.earnedWeight).toBe(100);
  });

  it("is pure — the same input yields a deeply equal report", () => {
    expect(auditHtml(GOOD_DOC)).toEqual(auditHtml(GOOD_DOC));
    expect(auditHtml(BAD_DOC)).toEqual(auditHtml(BAD_DOC));
  });

  it("carries no timestamp or other non-deterministic field", () => {
    expect(Object.keys(auditHtml(GOOD_DOC)).sort()).toEqual([
      "accessibilityScore",
      "earnedWeight",
      "grade",
      "issues",
      "passed",
      "score",
      "seoScore",
      "skipped",
      "totalWeight",
    ]);
  });

  it("scores a document that fails everything 0 / grade F", () => {
    const report = auditHtml(BAD_DOC);
    expect(report.score).toBe(0);
    expect(report.grade).toBe("F");
    expect(report.passed).toEqual([]);
    expect(report.earnedWeight).toBe(0);
  });

  it("skips only the two length checks when title and description are absent", () => {
    const report = auditHtml(BAD_DOC);
    expect(report.skipped.map((entry) => entry.id).sort()).toEqual([
      "meta-description-length",
      "title-length",
    ]);
    // 100 minus the weight of the two skipped checks.
    expect(report.totalWeight).toBe(93);
    expect(report.issues.length).toBe(17);
  });

  it("does not throw on empty or non-HTML input", () => {
    expect(() => auditHtml("")).not.toThrow();
    expect(() => auditHtml("not html at all")).not.toThrow();
    expect(auditHtml("").grade).toBe("F");
    expect(auditHtml("not html at all").issues.length).toBeGreaterThan(0);
  });

  it("never counts markup that only exists inside <script> or <style>", () => {
    const withRawText = GOOD_DOC.replace(
      "</body>",
      [
        '<script>document.write("<h1>fake</h1><img src=x><a href=\\"#\\"></a>");</script>',
        '<style>.x::after { content: "<h1>also fake</h1>"; }</style>',
        "</body>",
      ].join("\n"),
    );
    const report = auditHtml(withRawText);
    expect(report.score).toBe(100);
    expect(report.issues).toEqual([]);
  });

  it("caps every sample at 3 entries of 120 characters", () => {
    const long = `<img src="/a.png" data-note="${"x".repeat(400)}">`;
    const report = auditHtml(`<html lang="en">${long}${long}${long}${long}</html>`);
    const issue = report.issues.find((entry) => entry.id === "img-alt");
    expect(issue?.samples.length).toBe(3);
    for (const sample of issue?.samples ?? []) {
      expect(sample.length).toBeLessThanOrEqual(120);
    }
  });

  it("agrees with the compliant fixture on the parameterised builder's baseline", () => {
    const report = auditHtml(docFailing());
    expect(report.score).toBe(100);
    expect(report.totalWeight).toBe(100);
    expect(report.skipped).toEqual([]);
  });
});

/* ------------------------------------------------------------ accessibility */

describe("html-lang", () => {
  it("passes on an upper-case attribute — HTML is case-insensitive", () => {
    expect(statusOf('<HTML LANG="EN"></HTML>', "html-lang")).toBe("pass");
  });

  it("fails on an empty lang attribute", () => {
    expect(statusOf('<html lang=""></html>', "html-lang")).toBe("fail");
    expect(statusOf('<html lang="  "></html>', "html-lang")).toBe("fail");
  });

  it("fails and samples the offending tag when lang is missing", () => {
    const issue = issueOf("<html><body>hi</body></html>", "html-lang");
    expect(issue.severity).toBe("critical");
    expect(issue.samples.length).toBe(1);
    expect(issue.samples[0]).toContain("<html");
    expect(issue.fix).toContain('lang="en"');
  });

  it("fails when there is no <html> element at all", () => {
    expect(statusOf("<body>hi</body>", "html-lang")).toBe("fail");
  });
});

describe("img-alt", () => {
  it('passes on alt="" — the correct markup for a decorative image', () => {
    expect(statusOf('<img src="/spacer.png" alt="">', "img-alt")).toBe("pass");
  });

  it("passes when every image has alt text", () => {
    expect(statusOf('<img src="a.png" alt="A"><img src="b.png" alt="B">', "img-alt")).toBe(
      "pass",
    );
  });

  it("fails and reports counts when an image has no alt attribute", () => {
    const issue = issueOf('<img src="a.png" alt="A"><img src="b.png">', "img-alt");
    expect(issue.detail).toContain("1 of 2 <img> tags");
    expect(issue.weight).toBe(9);
    expect(issue.fix).toContain("(1 missing)");
  });

  it("is na for an image that only exists inside a script string", () => {
    expect(statusOf('<script>var s = "<img src=x>";</script>', "img-alt")).toBe("na");
  });

  it("is na for a document with no images", () => {
    expect(statusOf("<p>text only</p>", "img-alt")).toBe("na");
  });
});

describe("link-text", () => {
  it("passes on visible text, aria-label or title", () => {
    expect(statusOf('<a href="/">Home</a>', "link-text")).toBe("pass");
    expect(statusOf('<a href="/" aria-label="Home"></a>', "link-text")).toBe("pass");
    expect(statusOf('<a href="/" title="Home"></a>', "link-text")).toBe("pass");
    expect(statusOf('<a href="/" aria-labelledby="h"></a>', "link-text")).toBe("pass");
  });

  it("passes on an icon link named by a nested img alt", () => {
    expect(statusOf('<a href="/"><img src="h.svg" alt="Home"></a>', "link-text")).toBe(
      "pass",
    );
  });

  it("passes on an icon link named by a nested svg aria-label", () => {
    expect(
      statusOf('<a href="/"><svg aria-label="Home"><path/></svg></a>', "link-text"),
    ).toBe("pass");
  });

  it("fails on an image-only link whose image has no alt", () => {
    expect(statusOf('<a href="#"><img src=x></a>', "link-text")).toBe("fail");
  });

  it("skips an <a> with no href, since it is a jump target rather than a link", () => {
    expect(statusOf('<a><img alt="Home"></a>', "link-text")).toBe("na");
    expect(statusOf('<a name="top"></a>', "link-text")).toBe("na");
  });

  it("is na for a document with no links", () => {
    expect(statusOf("<p>text only</p>", "link-text")).toBe("na");
  });
});

describe("button-name", () => {
  it("passes on button text, aria-label or a nested labelled icon", () => {
    expect(statusOf("<button>Send</button>", "button-name")).toBe("pass");
    expect(statusOf('<button aria-label="Close"></button>', "button-name")).toBe("pass");
    expect(
      statusOf('<button><svg aria-label="Close"></svg></button>', "button-name"),
    ).toBe("pass");
  });

  it("fails on an empty button", () => {
    const issue = issueOf("<button></button>", "button-name");
    expect(issue.detail).toContain("1 of 1 buttons");
    expect(issue.severity).toBe("critical");
  });

  it('passes an <input type="submit"> that carries a value', () => {
    expect(statusOf('<input type="submit" value="Send">', "button-name")).toBe("pass");
    expect(statusOf('<input type="SUBMIT" value="Send">', "button-name")).toBe("pass");
    expect(statusOf('<input type="reset" aria-label="Reset">', "button-name")).toBe(
      "pass",
    );
  });

  it('fails a bare <input type="submit"> with no value', () => {
    expect(statusOf('<input type="submit">', "button-name")).toBe("fail");
    expect(statusOf('<input type="button" value="  ">', "button-name")).toBe("fail");
  });

  it("is na when the document has no buttons", () => {
    expect(statusOf('<input type="text" aria-label="Q">', "button-name")).toBe("na");
  });
});

describe("input-label", () => {
  it("passes a control referenced by <label for>", () => {
    expect(
      statusOf('<label for="email">Email</label><input id="email">', "input-label"),
    ).toBe("pass");
  });

  it("passes a control wrapped in its <label>", () => {
    expect(statusOf("<label>Email <input></label>", "input-label")).toBe("pass");
  });

  it("passes on aria-label, aria-labelledby or title", () => {
    expect(statusOf('<input aria-label="Email">', "input-label")).toBe("pass");
    expect(statusOf('<textarea aria-labelledby="h"></textarea>', "input-label")).toBe(
      "pass",
    );
    expect(statusOf('<select title="Plan"></select>', "input-label")).toBe("pass");
  });

  it("fails when only a placeholder describes the field", () => {
    const issue = issueOf('<input type="email" placeholder="Email">', "input-label");
    expect(issue.detail).toContain("placeholder");
    expect(issue.weight).toBe(7);
  });

  it("fails a control that sits after a label it is not inside of", () => {
    expect(
      statusOf('<label for="other">Other</label><input id="email">', "input-label"),
    ).toBe("fail");
  });

  it("counts <select> and <textarea>, not just <input>", () => {
    expect(statusOf("<select></select>", "input-label")).toBe("fail");
    expect(statusOf("<textarea></textarea>", "input-label")).toBe("fail");
  });

  it("ignores hidden and button-like inputs", () => {
    expect(statusOf('<input type="hidden" name="csrf" value="x">', "input-label")).toBe(
      "na",
    );
    expect(statusOf('<input type="submit" value="Go">', "input-label")).toBe("na");
    expect(statusOf('<input type="image" src="go.png">', "input-label")).toBe("na");
  });

  it("is na for a document with no form controls", () => {
    expect(statusOf("<p>text only</p>", "input-label")).toBe("na");
  });
});

describe("heading-order", () => {
  it("passes a hierarchy that never skips a level", () => {
    expect(
      statusOf("<h1>a</h1><h2>b</h2><h2>c</h2><h3>d</h3>", "heading-order"),
    ).toBe("pass");
  });

  it("fails when a level is skipped", () => {
    const issue = issueOf("<h1>a</h1><h3>b</h3>", "heading-order");
    expect(issue.detail).toContain("h1");
    expect(issue.detail).toContain("h3");
    expect(issue.severity).toBe("warning");
  });

  it("passes when the level decreases, which starts a new section", () => {
    expect(statusOf("<h3>a</h3><h1>b</h1>", "heading-order")).toBe("pass");
    expect(statusOf("<h1>a</h1><h2>b</h2><h1>c</h1>", "heading-order")).toBe("pass");
  });

  it("is na with fewer than two headings", () => {
    expect(statusOf("<h1>only one</h1>", "heading-order")).toBe("na");
    expect(statusOf("<p>none</p>", "heading-order")).toBe("na");
  });
});

describe("viewport-zoom", () => {
  it("passes a viewport that leaves zoom alone", () => {
    expect(
      statusOf('<meta name="viewport" content="width=device-width, initial-scale=1">', "viewport-zoom"),
    ).toBe("pass");
  });

  it("fails user-scalable=no", () => {
    expect(
      statusOf('<meta name="viewport" content="width=device-width, user-scalable=no">', "viewport-zoom"),
    ).toBe("fail");
  });

  it("fails maximum-scale=1 and maximum-scale=1.0", () => {
    expect(
      statusOf('<meta name="viewport" content="width=device-width, maximum-scale=1">', "viewport-zoom"),
    ).toBe("fail");
    expect(
      statusOf('<meta name="viewport" content="width=device-width, maximum-scale=1.0">', "viewport-zoom"),
    ).toBe("fail");
  });

  it("does not mistake maximum-scale=10 for a zoom lock", () => {
    expect(
      statusOf('<meta name="viewport" content="width=device-width, maximum-scale=10">', "viewport-zoom"),
    ).toBe("pass");
  });

  it("is na when the document declares no viewport", () => {
    expect(statusOf("<head></head>", "viewport-zoom")).toBe("na");
  });
});

describe("duplicate-ids", () => {
  it("passes when every id is unique", () => {
    expect(statusOf('<p id="a"></p><p id="b"></p>', "duplicate-ids")).toBe("pass");
  });

  it("fails and names the repeated value", () => {
    const issue = issueOf('<p id="hero"></p><p id="hero"></p>', "duplicate-ids");
    expect(issue.detail).toContain("hero");
    expect(issue.detail).toContain("×2");
    expect(issue.samples.length).toBe(1);
  });

  it("is na with fewer than two ids", () => {
    expect(statusOf('<p id="only"></p>', "duplicate-ids")).toBe("na");
    expect(statusOf("<p></p>", "duplicate-ids")).toBe("na");
  });
});

describe("main-landmark", () => {
  it("passes on a <main> element", () => {
    expect(statusOf("<main><p>hi</p></main>", "main-landmark")).toBe("pass");
  });

  it('passes on role="main"', () => {
    expect(statusOf('<div role="main"><p>hi</p></div>', "main-landmark")).toBe("pass");
    expect(statusOf('<div role="MAIN"></div>', "main-landmark")).toBe("pass");
  });

  it("fails when neither is present", () => {
    const issue = issueOf("<div><p>hi</p></div>", "main-landmark");
    expect(issue.severity).toBe("info");
    expect(issue.fix).toContain("<main>");
  });
});

/* ---------------------------------------------------------------------- seo */

describe("title-present", () => {
  it("passes on a title with text", () => {
    expect(statusOf("<title>A page</title>", "title-present")).toBe("pass");
  });

  it("fails when there is no title", () => {
    const issue = issueOf("<head></head>", "title-present");
    expect(issue.weight).toBe(9);
    expect(issue.detail).toContain("no <title>");
  });

  it("fails on a whitespace-only title", () => {
    const issue = issueOf("<title>   </title>", "title-present");
    expect(issue.detail).toContain("empty");
  });
});

describe("meta-description-present", () => {
  it("passes on a description with content", () => {
    expect(
      statusOf('<meta name="description" content="Hello">', "meta-description-present"),
    ).toBe("pass");
  });

  it("fails when the tag is absent", () => {
    expect(statusOf("<head></head>", "meta-description-present")).toBe("fail");
  });

  it("fails when the tag is present but content is empty", () => {
    const issue = issueOf(
      '<meta name="description" content="  ">',
      "meta-description-present",
    );
    expect(issue.detail).toContain("empty");
  });
});

describe("meta-charset", () => {
  it("passes the short charset form", () => {
    expect(statusOf('<meta charset="utf-8">', "meta-charset")).toBe("pass");
    expect(statusOf("<meta charset=UTF-8>", "meta-charset")).toBe("pass");
  });

  it("passes the legacy http-equiv form", () => {
    expect(
      statusOf(
        '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">',
        "meta-charset",
      ),
    ).toBe("pass");
  });

  it("fails when no encoding is declared", () => {
    expect(statusOf('<meta name="author" content="me">', "meta-charset")).toBe("fail");
    expect(statusOf('<meta charset="">', "meta-charset")).toBe("fail");
  });
});

describe("meta-viewport", () => {
  it("passes width=device-width in any spacing", () => {
    expect(
      statusOf('<meta name="viewport" content="width=device-width,initial-scale=1">', "meta-viewport"),
    ).toBe("pass");
    expect(
      statusOf('<meta name="viewport" content="width = device-width">', "meta-viewport"),
    ).toBe("pass");
  });

  it("fails when the tag is missing", () => {
    const issue = issueOf("<head></head>", "meta-viewport");
    expect(issue.weight).toBe(6);
  });

  it("fails a viewport that omits width=device-width", () => {
    expect(
      statusOf('<meta name="viewport" content="initial-scale=1">', "meta-viewport"),
    ).toBe("fail");
  });
});

describe("single-h1", () => {
  it("passes with exactly one h1", () => {
    expect(statusOf("<h1>Only</h1><h2>Sub</h2>", "single-h1")).toBe("pass");
  });

  it("distinguishes zero h1 from several in the detail", () => {
    expect(issueOf("<p>none</p>", "single-h1").detail).toContain("no <h1>");
    const many = issueOf("<h1>a</h1><h1>b</h1><h1>c</h1>", "single-h1");
    expect(many.detail).toContain("3 <h1>s");
    expect(many.fix).toContain("2");
  });

  it("does not count an h1 written inside a comment", () => {
    expect(statusOf("<h1>Real</h1><!-- <h1>Commented</h1> -->", "single-h1")).toBe("pass");
  });
});

describe("title-length", () => {
  it("passes a title inside the 15-60 character window", () => {
    expect(statusOf("<title>Acme Studio - Design</title>", "title-length")).toBe("pass");
  });

  it("fails and says too short", () => {
    const issue = issueOf("<title>Acme</title>", "title-length");
    expect(issue.detail).toContain("too short");
    expect(issue.detail).toContain("4 characters");
    expect(issue.fix).toContain("Lengthen");
  });

  it("fails and says too long", () => {
    const issue = issueOf(`<title>${"a".repeat(61)}</title>`, "title-length");
    expect(issue.detail).toContain("too long");
    expect(issue.detail).toContain("61 characters");
    expect(issue.fix).toContain("Shorten");
  });

  it("is na when the title is missing, so one mistake is not scored twice", () => {
    expect(statusOf("<head></head>", "title-length")).toBe("na");
    expect(statusOf("<title></title>", "title-length")).toBe("na");
  });
});

describe("og-tags", () => {
  it("passes when all three tags carry content", () => {
    const head =
      '<meta property="og:title" content="T"><meta property="og:description" content="D"><meta property="og:image" content="i.png">';
    expect(statusOf(head, "og-tags")).toBe("pass");
  });

  it('accepts the name="og:*" spelling documents actually use', () => {
    const head =
      '<meta name="og:title" content="T"><meta name="og:description" content="D"><meta name="og:image" content="i.png">';
    expect(statusOf(head, "og-tags")).toBe("pass");
  });

  it("lists exactly which tags are missing", () => {
    const issue = issueOf('<meta property="og:title" content="T">', "og-tags");
    expect(issue.detail).toContain("og:description");
    expect(issue.detail).toContain("og:image");
    expect(issue.detail).not.toContain("og:title");
  });

  it("treats an empty content as missing", () => {
    const head =
      '<meta property="og:title" content=""><meta property="og:description" content="D"><meta property="og:image" content="i.png">';
    expect(issueOf(head, "og-tags").detail).toContain("og:title");
  });
});

describe("meta-description-length", () => {
  it("passes a description inside the 50-160 character window", () => {
    const content = "x".repeat(80);
    expect(
      statusOf(
        `<meta name="description" content="${content}">`,
        "meta-description-length",
      ),
    ).toBe("pass");
  });

  it("fails and says too short", () => {
    const issue = issueOf(
      '<meta name="description" content="Too brief.">',
      "meta-description-length",
    );
    expect(issue.detail).toContain("too short");
  });

  it("fails and says too long", () => {
    const issue = issueOf(
      `<meta name="description" content="${"x".repeat(161)}">`,
      "meta-description-length",
    );
    expect(issue.detail).toContain("too long");
    expect(issue.detail).toContain("161 characters");
  });

  it("is na when there is no description", () => {
    expect(statusOf("<head></head>", "meta-description-length")).toBe("na");
  });
});

describe("favicon", () => {
  it("passes rel=icon, rel=shortcut icon and apple-touch-icon", () => {
    expect(statusOf('<link rel="icon" href="/f.ico">', "favicon")).toBe("pass");
    expect(statusOf('<link rel="shortcut icon" href="/f.ico">', "favicon")).toBe("pass");
    expect(statusOf('<link rel="apple-touch-icon" href="/f.png">', "favicon")).toBe(
      "pass",
    );
  });

  it("fails when no icon link exists", () => {
    const issue = issueOf('<link rel="stylesheet" href="/a.css">', "favicon");
    expect(issue.weight).toBe(2);
    expect(issue.severity).toBe("info");
  });

  it("fails an icon link with no href", () => {
    expect(statusOf('<link rel="icon">', "favicon")).toBe("fail");
  });
});

describe("link-noopener", () => {
  it("passes on case-insensitive, multi-token rel values", () => {
    expect(
      statusOf('<a href="/" target="_blank" rel="NOOPENER noreferrer">x</a>', "link-noopener"),
    ).toBe("pass");
    expect(
      statusOf('<a href="/" target="_blank" rel="noreferrer">x</a>', "link-noopener"),
    ).toBe("pass");
  });

  it("fails a _blank link with no rel", () => {
    const issue = issueOf('<a href="/" target="_BLANK">x</a>', "link-noopener");
    expect(issue.detail).toContain("1 of 1");
    expect(issue.fix).toContain("noopener noreferrer");
  });

  it("fails a _blank link whose rel says something else", () => {
    expect(
      statusOf('<a href="/" target="_blank" rel="nofollow">x</a>', "link-noopener"),
    ).toBe("fail");
  });

  it("is na when nothing opens in a new tab", () => {
    expect(statusOf('<a href="/">x</a>', "link-noopener")).toBe("na");
  });
});

/* ------------------------------------------------------------------ scoring */

describe("scoring", () => {
  it("excludes na checks from both sides of the ratio", () => {
    // A perfect <head> with no images, links, buttons, inputs or extra headings:
    // eight checks are na, and the page is neither penalised nor rewarded.
    const headOnly = [
      '<html lang="en">',
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      "<title>A perfectly ordinary marketing page title</title>",
      '<meta name="description" content="A description that sits comfortably inside the fifty to one hundred and sixty character window search engines want.">',
      '<meta property="og:title" content="T">',
      '<meta property="og:description" content="D">',
      '<meta property="og:image" content="/og.png">',
      '<link rel="icon" href="/favicon.ico">',
      "</head>",
      "<body><main><h1>Only heading</h1></main></body>",
      "</html>",
    ].join("\n");

    const report = auditHtml(headOnly);
    expect(report.score).toBe(100);
    expect(report.grade).toBe("A");
    expect(report.skipped.map((entry) => entry.id).sort()).toEqual([
      "button-name",
      "duplicate-ids",
      "heading-order",
      "img-alt",
      "input-label",
      "link-noopener",
      "link-text",
    ]);
    expect(report.totalWeight).toBe(100 - 9 - 7 - 7 - 7 - 4 - 3 - 2);
  });

  it("scores each check's failure at exactly its own weight", () => {
    for (const id of TOGGLEABLE) {
      const report = auditHtml(docFailing([id]));
      expect(report.issues.map((issue) => issue.id)).toEqual([id]);
      expect(report.totalWeight).toBe(100);
      expect(report.score).toBe(100 - weightOf(id));
    }
  });

  it("covers every check with either the toggle list or the two present-checks", () => {
    const covered = [
      ...TOGGLEABLE,
      "title-present",
      "meta-description-present",
    ].sort();
    expect(covered).toEqual(AUDIT_CHECKS.map((check) => check.id).sort());
  });

  it("reports seoScore and accessibilityScore separately", () => {
    const report = auditHtml(docFailing(["img-alt", "input-label"]));
    expect(report.seoScore).toBe(100);
    expect(report.accessibilityScore).toBe(Math.round((100 * (51 - 9 - 7)) / 51));
    expect(report.accessibilityScore).toBeLessThan(report.seoScore);
  });

  it("reports accessibilityScore 100 and a lower seoScore when only SEO fails", () => {
    const report = auditHtml(docFailing(["og-tags", "favicon", "single-h1"]));
    expect(report.accessibilityScore).toBe(100);
    expect(report.seoScore).toBe(Math.round((100 * (49 - 4 - 2 - 6)) / 49));
  });

  it("grades the A/B boundary at 90 and 89", () => {
    const a = ["og-tags", "heading-order", "favicon"];
    const b = ["img-alt", "favicon"];
    expect(expectedScore(a)).toBe(90);
    expect(expectedScore(b)).toBe(89);
    expect(auditHtml(docFailing(a)).grade).toBe("A");
    expect(auditHtml(docFailing(b)).grade).toBe("B");
  });

  it("grades the B/C boundary at 75 and 74", () => {
    const b = ["img-alt", "link-text", "single-h1", "viewport-zoom"];
    const c = ["img-alt", "link-text", "single-h1", "heading-order"];
    expect(expectedScore(b)).toBe(75);
    expect(expectedScore(c)).toBe(74);
    expect(auditHtml(docFailing(b)).grade).toBe("B");
    expect(auditHtml(docFailing(c)).grade).toBe("C");
  });

  it("grades the C/D boundary at 60 and 59", () => {
    const c = [
      "img-alt",
      "link-text",
      "button-name",
      "input-label",
      "heading-order",
      "viewport-zoom",
      "duplicate-ids",
    ];
    const d = [...c, "html-lang"].filter((id) => id !== "input-label");
    expect(expectedScore(c)).toBe(60);
    expect(expectedScore(d)).toBe(59);
    expect(auditHtml(docFailing(c)).grade).toBe("C");
    expect(auditHtml(docFailing(d)).grade).toBe("D");
  });

  it("grades the D/F boundary at 40 and 39", () => {
    const allAccessibility = AUDIT_CHECKS.filter(
      (check) => check.category === "accessibility",
    ).map((check) => check.id);
    const d = [...allAccessibility, "meta-charset", "meta-description-length"];
    const f = [...allAccessibility, "meta-charset", "title-length"];
    expect(expectedScore(d)).toBe(40);
    expect(expectedScore(f)).toBe(39);
    expect(auditHtml(docFailing(d)).grade).toBe("D");
    expect(auditHtml(docFailing(f)).grade).toBe("F");
  });

  it("sorts issues by weight descending, then id ascending", () => {
    const report = auditHtml(
      docFailing(["img-alt", "link-text", "button-name", "input-label"]),
    );
    expect(report.issues.map((issue) => issue.id)).toEqual([
      "img-alt",
      "button-name",
      "input-label",
      "link-text",
    ]);
    expect(report.issues.map((issue) => issue.weight)).toEqual([9, 7, 7, 7]);
  });

  it("keeps earnedWeight and totalWeight consistent with the score", () => {
    const report = auditHtml(docFailing(["img-alt", "favicon"]));
    expect(report.earnedWeight).toBe(100 - 9 - 2);
    expect(report.totalWeight).toBe(100);
    expect(report.score).toBe(
      Math.round((100 * report.earnedWeight) / report.totalWeight),
    );
  });
});

/* ------------------------------------------------------- buildFixInstruction */

describe("buildFixInstruction", () => {
  const numberedLines = (instruction: string): string[] =>
    instruction.split("\n").filter((line) => /^\d+\. /.test(line));

  it("returns null when there is nothing to fix", () => {
    expect(buildFixInstruction(auditHtml(GOOD_DOC))).toBeNull();
  });

  it("writes one numbered line per failed check, heaviest first", () => {
    const report = auditHtml(docFailing(["img-alt", "favicon", "single-h1"]));
    const instruction = buildFixInstruction(report);
    expect(instruction).not.toBeNull();
    const lines = numberedLines(instruction ?? "");
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain("alt");
    expect(lines[2]).toContain("favicon");
    expect(lines[0].startsWith("1. ")).toBe(true);
    expect(lines[2].startsWith("3. ")).toBe(true);
  });

  it("interpolates the counts from each issue's fix template", () => {
    const report = auditHtml(
      '<html lang="en"><img src="a.png"><img src="b.png"></html>',
    );
    const instruction = buildFixInstruction(report) ?? "";
    expect(instruction).toContain("(2 missing)");
  });

  it("carries the design-preservation preamble and closing line", () => {
    const instruction = buildFixInstruction(auditHtml(BAD_DOC)) ?? "";
    expect(instruction).toContain(
      "Keep the existing design, layout, wording and Tailwind classes exactly as they are",
    );
    expect(instruction).toContain("minimal markup changes");
    expect(instruction).toContain("Do not change any visible text, colours or layout.");
  });

  it("caps the numbered list at 10 items with no trailing summary", () => {
    const report = auditHtml(BAD_DOC);
    expect(report.issues.length).toBe(17);
    const instruction = buildFixInstruction(report) ?? "";
    expect(numberedLines(instruction).length).toBe(10);
    expect(instruction).not.toContain("more");
  });

  it("stays within the 1500 character prompt budget on the worst real document", () => {
    const worst = buildFixInstruction(auditHtml(BAD_DOC)) ?? "";
    expect(worst.length).toBeLessThanOrEqual(1500);
    expect(worst.length).toBeGreaterThan(0);

    const alsoBad = buildFixInstruction(auditHtml(docFailing(TOGGLEABLE))) ?? "";
    expect(alsoBad.length).toBeLessThanOrEqual(1500);
  });

  it("drops whole lines rather than overrun the budget, keeping the closing clause", () => {
    // Real documents never get near the cap, so drive the truncation branch
    // directly: if the budget were spent without reserving the closing line, the
    // model would receive a list of fixes and no "keep the design" instruction.
    const synthetic: AuditReport = {
      ...auditHtml(BAD_DOC),
      issues: auditHtml(BAD_DOC).issues.map((issue, index) => ({
        ...issue,
        fix: `${index} ${"x".repeat(300)}`,
      })),
    };
    const instruction = buildFixInstruction(synthetic) ?? "";
    expect(instruction.length).toBeLessThanOrEqual(1500);
    expect(numberedLines(instruction).length).toBeLessThan(10);
    expect(numberedLines(instruction).length).toBeGreaterThan(0);
    expect(instruction).toContain("Do not change any visible text, colours or layout.");
    expect(instruction.split("\n").every((line) => line.trim() !== "")).toBe(true);
  });

  it("mentions only failed checks, never a passing one", () => {
    const report = auditHtml(docFailing(["og-tags", "favicon"]));
    const instruction = buildFixInstruction(report) ?? "";
    expect(instruction).toContain("og:");
    expect(instruction).not.toContain('lang="en"');
    expect(instruction).not.toContain("alt");
    expect(instruction).not.toContain("<h1>");
  });

  it("orders the lines by the report's own issue order", () => {
    const report: AuditReport = auditHtml(BAD_DOC);
    const lines = numberedLines(buildFixInstruction(report) ?? "");
    const fixes = report.issues.slice(0, 10).map((issue) => issue.fix);
    expect(lines).toEqual(fixes.map((fix, index) => `${index + 1}. ${fix}`));
  });
});
