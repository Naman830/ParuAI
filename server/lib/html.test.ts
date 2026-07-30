import { describe, expect, it } from "vitest";
import {
  createHtmlStreamTrimmer,
  ensureDoctype,
  extractHtml,
  isRenderableHtml,
} from "./html.js";

describe("extractHtml", () => {
  it("returns empty string for null/undefined/empty input", () => {
    expect(extractHtml(null)).toBe("");
    expect(extractHtml(undefined)).toBe("");
    expect(extractHtml("")).toBe("");
  });

  it("strips a fenced ```html block", () => {
    const raw = "```html\n<!DOCTYPE html><html><body>hi</body></html>\n```";
    expect(extractHtml(raw)).toBe("<!DOCTYPE html><html><body>hi</body></html>");
  });

  it("strips a bare ``` fence with no language tag", () => {
    const raw = "```\n<!DOCTYPE html><html><body>hi</body></html>\n```";
    expect(extractHtml(raw)).toBe("<!DOCTYPE html><html><body>hi</body></html>");
  });

  it("strips multiple fence occurrences, not just the first", () => {
    const raw = "```html\n<!DOCTYPE html>```<html><body>hi</body></html>```\n```";
    const result = extractHtml(raw);
    expect(result).not.toContain("```");
  });

  it("drops preamble text before <!DOCTYPE html>, case-insensitively", () => {
    const raw = "Here is your updated code:\n<!DOCTYPE html><html><body>hi</body></html>";
    expect(extractHtml(raw)).toBe("<!DOCTYPE html><html><body>hi</body></html>");

    const rawLower = "Here you go:\n<!doctype html><html><body>hi</body></html>";
    expect(extractHtml(rawLower)).toBe("<!doctype html><html><body>hi</body></html>");
  });

  it("falls back to slicing from <html> when no <!DOCTYPE> is present", () => {
    const raw = "Sure, here it is:\n<html><body>hi</body></html>";
    expect(extractHtml(raw)).toBe("<html><body>hi</body></html>");
  });

  it("leaves content untouched (after fence/trim) when neither <!DOCTYPE> nor <html> is found", () => {
    const raw = "just some plain text, no markup here";
    expect(extractHtml(raw)).toBe(raw);
  });

  it("trims leading/trailing whitespace from the result", () => {
    const raw = "   <!DOCTYPE html><html></html>   ";
    expect(extractHtml(raw)).toBe("<!DOCTYPE html><html></html>");
  });
});

describe("isRenderableHtml", () => {
  it("returns false for empty or whitespace-only input", () => {
    expect(isRenderableHtml("")).toBe(false);
    expect(isRenderableHtml("   \n\t  ")).toBe(false);
  });

  it("returns false when <!DOCTYPE> is present but no <html> tag", () => {
    expect(isRenderableHtml("<!DOCTYPE html>")).toBe(false);
  });

  it("returns true when an <html> tag is present", () => {
    expect(isRenderableHtml("<html><body>hi</body></html>")).toBe(true);
    expect(isRenderableHtml("<html lang=\"en\"><body>hi</body></html>")).toBe(true);
  });
});

describe("ensureDoctype", () => {
  it("prefixes a doctype when none is present", () => {
    expect(ensureDoctype("<html><body>hi</body></html>")).toBe(
      "<!DOCTYPE html>\n<html><body>hi</body></html>",
    );
  });

  it("is idempotent when a doctype is already present", () => {
    const doc = "<!DOCTYPE html><html></html>";
    expect(ensureDoctype(doc)).toBe(doc);
    expect(ensureDoctype(ensureDoctype(doc))).toBe(doc);
  });

  it("recognises a lower-case doctype and does not double-prefix", () => {
    const doc = "<!doctype html><html></html>";
    expect(ensureDoctype(doc)).toBe(doc);
  });

  it("recognises a doctype after leading whitespace", () => {
    const doc = "\n  <!DOCTYPE html><html></html>";
    expect(ensureDoctype(doc)).toBe(doc);
  });

  it("prefixes an empty string", () => {
    expect(ensureDoctype("")).toBe("<!DOCTYPE html>\n");
  });

  it("composes with extractHtml to make an <html>-only document renderable", () => {
    const result = ensureDoctype(extractHtml("Sure:\n<html><body>hi</body></html>"));
    expect(result).toBe("<!DOCTYPE html>\n<html><body>hi</body></html>");
    expect(isRenderableHtml(result)).toBe(true);
  });
});

describe("createHtmlStreamTrimmer", () => {
  it("suppresses a preamble before <!DOCTYPE", () => {
    const trim = createHtmlStreamTrimmer();
    expect(trim("Here is your code:\n")).toBe("");
    expect(trim("<!DOCTYPE html><html>")).toBe("<!DOCTYPE html><html>");
  });

  it("finds a doctype split across chunk boundaries", () => {
    const trim = createHtmlStreamTrimmer();
    expect(trim("```html\n<!doc")).toBe("");
    expect(trim("type html><html>")).toBe("<!doctype html><html>");
  });

  it("strips a leading markdown fence", () => {
    const trim = createHtmlStreamTrimmer();
    expect(trim("```html\n<!DOCTYPE html>")).toBe("<!DOCTYPE html>");
  });

  it("falls back to <html> when there is no doctype", () => {
    const trim = createHtmlStreamTrimmer();
    expect(trim("blah blah <html lang=\"en\">")).toBe("<html lang=\"en\">");
  });

  it("passes everything through unchanged once opened", () => {
    const trim = createHtmlStreamTrimmer();
    trim("<!DOCTYPE html>");
    expect(trim("<body>")).toBe("<body>");
    expect(trim("plain text with no tags")).toBe("plain text with no tags");
    expect(trim("")).toBe("");
  });

  it("flushes the buffered prefix once the budget is exceeded", () => {
    const trim = createHtmlStreamTrimmer(16);
    expect(trim("0123456789")).toBe("");
    // Crosses the 16-char budget with no document start: flush what we have.
    expect(trim("abcdefghij")).toBe("0123456789abcdefghij");
    expect(trim("more")).toBe("more");
  });

  it("does not treat a partial tag name as the document start", () => {
    const trim = createHtmlStreamTrimmer();
    // `<htm` and `<html` without a following space or `>` must not match.
    expect(trim("<htm")).toBe("");
    expect(trim("l")).toBe("");
    expect(trim(">")).toBe("<html>");
  });
});
