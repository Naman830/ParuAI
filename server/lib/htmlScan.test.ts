import { describe, expect, it } from "vitest";
import {
  innerTextOf,
  parseAttrs,
  scanTags,
  scrubHtml,
  tokens,
} from "./htmlScan.js";

describe("scrubHtml", () => {
  it("blanks script contents to an equal-length run of spaces", () => {
    const html = '<script>alert("<p>hi</p>")</script>';
    const scrubbed = scrubHtml(html);
    expect(scrubbed).toBe(`<script>${" ".repeat(18)}</script>`);
    expect(scrubbed.length).toBe(html.length);
  });

  it("blanks style contents", () => {
    const html = "<style>h1{color:red}</style>";
    const scrubbed = scrubHtml(html);
    expect(scrubbed).toBe(`<style>${" ".repeat(13)}</style>`);
    expect(scrubbed.length).toBe(html.length);
  });

  it("blanks comment contents but keeps the delimiters", () => {
    const html = "<!-- <p>x</p> -->";
    const scrubbed = scrubHtml(html);
    expect(scrubbed).toBe(`<!--${" ".repeat(10)}-->`);
    expect(scrubbed.length).toBe(html.length);
  });

  it("blanks template contents", () => {
    const html = "<template><div>t</div></template>";
    const scrubbed = scrubHtml(html);
    expect(scrubbed).toBe(`<template>${" ".repeat(12)}</template>`);
    expect(scrubbed.length).toBe(html.length);
  });

  it("does NOT blank noscript, whose markup is real for non-JS users", () => {
    const html = '<noscript><a href="/x">js off</a></noscript>';
    const scrubbed = scrubHtml(html);
    expect(scrubbed).toBe(html);
    expect(scanTags(scrubbed, "a").length).toBe(1);
  });

  it("is case-insensitive on both the open and the close tag", () => {
    const html = "<SCRIPT>x</SCRIPT>";
    expect(scrubHtml(html)).toBe("<SCRIPT> </SCRIPT>");
  });

  it("keeps attributes on the opening tag intact", () => {
    const html = '<script src="a.js" type="module">bad</script>';
    const scrubbed = scrubHtml(html);
    expect(scrubbed).toBe('<script src="a.js" type="module">   </script>');
    expect(parseAttrs(scanTags(scrubbed, "script")[0].attrSource)).toEqual({
      src: "a.js",
      type: "module",
    });
  });

  it("blanks an unterminated script to end-of-string", () => {
    const html = "<p>a</p><script>let a = 1;";
    const scrubbed = scrubHtml(html);
    expect(scrubbed).toBe(`<p>a</p><script>${" ".repeat(10)}`);
    expect(scrubbed.length).toBe(html.length);
  });

  it("hides markup that only exists inside a comment", () => {
    const html = "<h1>real</h1><!-- <h1>commented</h1> -->";
    expect(scanTags(html, "h1").length).toBe(2);
    expect(scanTags(scrubHtml(html), "h1").length).toBe(1);
  });

  it("hides markup that only exists inside a JS string literal", () => {
    const html = '<script>const s = "<h1>fake</h1>";</script><h1>real</h1>';
    const scrubbed = scrubHtml(html);
    const headings = scanTags(scrubbed, "h1");
    expect(headings.length).toBe(1);
    expect(innerTextOf(scrubbed, headings[0])).toBe("real");
  });

  it("does not let a commented-out script swallow the rest of the document", () => {
    const html = "<!-- <script> --><p>real</p>";
    const scrubbed = scrubHtml(html);
    expect(scrubbed.length).toBe(html.length);
    expect(scanTags(scrubbed, "p").length).toBe(1);
  });

  it("keeps offsets valid, so a tag scanned on the scrubbed copy slices the original", () => {
    const html =
      "<html><head><style>h1{color:red}</style></head>" +
      "<body><h1>Hi &amp; bye</h1></body></html>";
    const scrubbed = scrubHtml(html);
    const heading = scanTags(scrubbed, "h1")[0];
    expect(scrubbed.length).toBe(html.length);
    expect(html.slice(heading.start, heading.end)).toBe("<h1>");
    expect(innerTextOf(html, heading)).toBe("Hi & bye");
  });

  it("preserves length across several blanked regions at once", () => {
    const html =
      "<!-- lead --><style>a{b:c}</style><div>keep</div>" +
      "<script>d()</script><template><span>t</span></template>";
    const scrubbed = scrubHtml(html);
    expect(scrubbed.length).toBe(html.length);
    expect(scanTags(scrubbed).map((tag) => tag.name)).toEqual([
      "style",
      "div",
      "script",
      "template",
    ]);
  });

  it("leaves a document with no scripts, styles or comments untouched", () => {
    const html = "<!DOCTYPE html><html><body><p>hi</p></body></html>";
    expect(scrubHtml(html)).toBe(html);
  });
});

describe("scanTags", () => {
  it("round-trips the raw start tag via src.slice(start, end)", () => {
    const src = 'x <a href="/y" data-q="a>b">link</a>';
    const [anchor] = scanTags(src, "a");
    expect(src.slice(anchor.start, anchor.end)).toBe(
      '<a href="/y" data-q="a>b">',
    );
  });

  it("does not let a > inside a double-quoted value terminate the tag", () => {
    const [img] = scanTags('<img alt="a > b" src="x.png">');
    expect(img.end).toBe(29);
    expect(parseAttrs(img.attrSource)).toEqual({
      alt: "a > b",
      src: "x.png",
    });
  });

  it("does not let a > inside a single-quoted value terminate the tag", () => {
    const [img] = scanTags("<img alt='a > b' src='x.png'>");
    expect(parseAttrs(img.attrSource)).toEqual({
      alt: "a > b",
      src: "x.png",
    });
  });

  it("matches a start tag spread over several lines", () => {
    const src = '<img\n  src="a.png"\n  alt="A cat"\n/>';
    const [img] = scanTags(src);
    expect(img.name).toBe("img");
    expect(img.selfClosing).toBe(true);
    expect(parseAttrs(img.attrSource)).toEqual({ src: "a.png", alt: "A cat" });
  });

  it("recognises all three self-closing spellings", () => {
    expect(scanTags("<img>")[0].selfClosing).toBe(false);
    expect(scanTags("<img/>")[0].selfClosing).toBe(true);
    expect(scanTags("<img />")[0].selfClosing).toBe(true);
    expect(scanTags("<img>").length).toBe(1);
    expect(scanTags("<img/>")[0].name).toBe("img");
  });

  it("strips the trailing slash out of attrSource", () => {
    const [img] = scanTags('<img src="a.png" alt="c" />');
    expect(img.attrSource).toBe(' src="a.png" alt="c" ');
    expect(parseAttrs(img.attrSource)).toEqual({ src: "a.png", alt: "c" });
  });

  it("never returns end tags", () => {
    expect(scanTags("<div>x</div>").map((tag) => tag.name)).toEqual(["div"]);
  });

  it("never returns the doctype", () => {
    const src = "<!DOCTYPE html><html><body></body></html>";
    expect(scanTags(src).map((tag) => tag.name)).toEqual(["html", "body"]);
  });

  it("never returns a comment as a tag (but does see markup inside one)", () => {
    // The comment delimiters themselves are not tags; the <p> inside is only
    // hidden once scrubHtml() has run.
    expect(scanTags("<!-- <p>x</p> -->").map((tag) => tag.name)).toEqual(["p"]);
    expect(scanTags("<!-- plain prose -->")).toEqual([]);
  });

  it("lower-cases tag names", () => {
    expect(scanTags("<DIV><IMG></DIV>").map((tag) => tag.name)).toEqual([
      "div",
      "img",
    ]);
  });

  it("filters by name, lower-casing the filter as well as the tag", () => {
    const src = "<DIV></DIV><div></div><span></span>";
    expect(scanTags(src, "DIV").length).toBe(2);
    expect(scanTags(src, "div").length).toBe(2);
    expect(scanTags(src, "span").length).toBe(1);
    expect(scanTags(src, "section")).toEqual([]);
  });

  it("returns tags in document order, nested ones included", () => {
    const src = '<section><h2>t</h2><p><a href="#">l</a></p></section>';
    expect(scanTags(src).map((tag) => tag.name)).toEqual([
      "section",
      "h2",
      "p",
      "a",
    ]);
  });

  it("gives identical results on repeated calls (no leaked regex lastIndex)", () => {
    const src = "<a></a><b></b>";
    expect(scanTags(src).length).toBe(2);
    expect(scanTags(src).length).toBe(2);
    expect(scanTags(src, "b")[0].start).toBe(scanTags(src, "b")[0].start);
  });

  it("returns an empty array for markup-free input", () => {
    expect(scanTags("")).toEqual([]);
    expect(scanTags("just prose, 1 < 2")).toEqual([]);
  });
});

describe("parseAttrs", () => {
  it("reads double-quoted, single-quoted and unquoted values", () => {
    expect(parseAttrs(' id="a" class=\'b\' data-x=c')).toEqual({
      id: "a",
      class: "b",
      "data-x": "c",
    });
  });

  it("maps a valueless attribute to an empty string", () => {
    expect(parseAttrs(" disabled")).toEqual({ disabled: "" });
    expect(parseAttrs(' hidden class="a"')).toEqual({ hidden: "", class: "a" });
  });

  it("distinguishes a valueless attribute from an empty value", () => {
    expect(parseAttrs(' alt=""')).toEqual({ alt: "" });
    expect(parseAttrs(" alt")).toEqual({ alt: "" });
  });

  it("keeps the first of a duplicated attribute", () => {
    expect(parseAttrs(' id="first" id="second"')).toEqual({ id: "first" });
    expect(parseAttrs(' lang="en" LANG="fr"')).toEqual({ lang: "en" });
  });

  it("lower-cases names but preserves value case", () => {
    expect(parseAttrs(' ALT="A Cat" Href="/Foo"')).toEqual({
      alt: "A Cat",
      href: "/Foo",
    });
  });

  it("decodes the supported entity set", () => {
    expect(
      parseAttrs(
        ' title="Tom &amp; Jerry &lt;b&gt; &quot;q&quot; &#39;s&#39; &apos;t&apos; a&nbsp;b"',
      ),
    ).toEqual({ title: `Tom & Jerry <b> "q" 's' 't' a b` });
  });

  it("decodes in a single pass so &amp;lt; stays escaped", () => {
    expect(parseAttrs(' title="&amp;lt;"')).toEqual({ title: "&lt;" });
  });

  it("keeps = and / inside a quoted value", () => {
    expect(parseAttrs(' href="/a/b?x=1&amp;y=2"')).toEqual({
      href: "/a/b?x=1&y=2",
    });
  });

  it("keeps a > that came from a quoted value", () => {
    expect(parseAttrs(' data-q="a>b"')).toEqual({ "data-q": "a>b" });
  });

  it("returns an empty object for an empty or whitespace-only blob", () => {
    expect(parseAttrs("")).toEqual({});
    expect(parseAttrs("   \n ")).toEqual({});
  });

  it("does not confuse an attribute named like an Object.prototype key", () => {
    expect(parseAttrs(' constructor="x" id="y"')).toEqual({
      constructor: "x",
      id: "y",
    });
  });

  it("handles attributes separated by newlines and extra spacing", () => {
    expect(parseAttrs('\n  src="a.png"\n\talt = "c"  ')).toEqual({
      src: "a.png",
      alt: "c",
    });
  });

  it("reads a boolean attribute that follows an unquoted value", () => {
    const [input] = scanTags("<input type=checkbox checked>");
    expect(parseAttrs(input.attrSource)).toEqual({
      type: "checkbox",
      checked: "",
    });
  });
});

describe("innerTextOf", () => {
  it("returns the text of a simple element", () => {
    const src = "<h1>Hello</h1>";
    expect(innerTextOf(src, scanTags(src, "h1")[0])).toBe("Hello");
  });

  it("strips nested tags", () => {
    const src = '<h1>Hello <span class="x">World</span></h1>';
    expect(innerTextOf(src, scanTags(src, "h1")[0])).toBe("Hello World");
  });

  it("removes nested tags without inserting a separator", () => {
    const src = "<h1><span>A</span><span>B</span></h1>";
    expect(innerTextOf(src, scanTags(src, "h1")[0])).toBe("AB");
  });

  it("collapses whitespace runs and trims", () => {
    const src = "<p>\n  a\t\tb\n  c  </p>";
    expect(innerTextOf(src, scanTags(src, "p")[0])).toBe("a b c");
  });

  it("decodes entities in the text", () => {
    const src = "<title>Tom &amp; Jerry&nbsp;Co</title>";
    expect(innerTextOf(src, scanTags(src, "title")[0])).toBe("Tom & Jerry Co");
  });

  it("does not strip markup that was escaped as entities", () => {
    const src = "<p>&lt;b&gt;bold&lt;/b&gt;</p>";
    expect(innerTextOf(src, scanTags(src, "p")[0])).toBe("<b>bold</b>");
  });

  it("drops comments inside the element", () => {
    const src = "<p>a<!-- note -->b</p>";
    expect(innerTextOf(src, scanTags(src, "p")[0])).toBe("ab");
  });

  it("returns an empty string when the close tag is missing", () => {
    const src = "<p>text with no close";
    expect(innerTextOf(src, scanTags(src, "p")[0])).toBe("");
  });

  it("returns an empty string for a self-closing tag", () => {
    const src = '<img alt="x" />text</img>';
    expect(innerTextOf(src, scanTags(src, "img")[0])).toBe("");
  });

  it("stops at the FIRST matching close tag (no nesting model)", () => {
    const src = "<div>a<div>b</div>c</div>";
    expect(innerTextOf(src, scanTags(src, "div")[0])).toBe("ab");
  });

  it("does not end a <a> at the </a inside </abbr>", () => {
    const src = '<a href="#">x<abbr title="t">y</abbr>z</a>';
    expect(innerTextOf(src, scanTags(src, "a")[0])).toBe("xyz");
  });

  it("matches the close tag case-insensitively", () => {
    const src = "<DIV>hi</DIV>";
    expect(innerTextOf(src, scanTags(src, "div")[0])).toBe("hi");
  });

  it("survives a > inside a nested tag's quoted attribute", () => {
    const src = '<p>a <a href="/q?x=1" title="a>b">link</a> c</p>';
    expect(innerTextOf(src, scanTags(src, "p")[0])).toBe("a link c");
  });
});

describe("tokens", () => {
  it("lower-cases and splits on whitespace runs", () => {
    expect(tokens("noopener  NOREFERRER\nnofollow")).toEqual([
      "noopener",
      "noreferrer",
      "nofollow",
    ]);
  });

  it("drops empties from leading/trailing whitespace", () => {
    expect(tokens("  stylesheet ")).toEqual(["stylesheet"]);
  });

  it("returns an empty array for empty or whitespace-only input", () => {
    expect(tokens("")).toEqual([]);
    expect(tokens("   \t\n ")).toEqual([]);
  });
});

describe("documented limits", () => {
  it("limit 1: a > inside an UNQUOTED value truncates the tag", () => {
    const [anchor] = scanTags("<a title=a>b>");
    expect(anchor.end).toBe(11);
    expect(parseAttrs(anchor.attrSource)).toEqual({ title: "a" });
  });

  it("limit 2: an unquoted value ending in / is misread as self-closing", () => {
    const [anchor] = scanTags("<a href=/foo/>");
    expect(anchor.selfClosing).toBe(true);
    expect(parseAttrs(anchor.attrSource)).toEqual({ href: "/foo" });
  });

  it("limit 3: a stray apostrophe in an unquoted value breaks that tag", () => {
    expect(scanTags("<div data-x=it's>text</div>")).toEqual([]);
    // …but tags after it are still found.
    expect(scanTags("<div data-x=it's><p>ok</p>").map((t) => t.name)).toEqual([
      "p",
    ]);
    // Quoting the value is all it takes.
    const [div] = scanTags("<div data-x=\"it's\">text</div>");
    expect(parseAttrs(div.attrSource)).toEqual({ "data-x": "it's" });
  });

  it("limit 5: names are lower-cased, values and text keep their case", () => {
    const src = '<IMG SRC="Foo.PNG" ALT="A Cat">';
    const [img] = scanTags(src);
    expect(img.name).toBe("img");
    expect(parseAttrs(img.attrSource)).toEqual({
      src: "Foo.PNG",
      alt: "A Cat",
    });
  });
});
