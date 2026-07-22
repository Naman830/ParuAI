import { describe, expect, it } from "vitest";
import { extractHtml, isRenderableHtml } from "./html.js";

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
