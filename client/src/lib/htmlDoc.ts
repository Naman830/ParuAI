/**
 * Mirrors ensureDoctype() in server/lib/html.ts — keep the two in sync.
 *
 * The browser serializes `documentElement.outerHTML` WITHOUT the doctype, so
 * anything pulled out of the preview iframe (ProjectPreview.getCode()) or typed
 * into the code editor can arrive without one. Rendering that back through
 * `srcDoc` puts the page into quirks mode, which silently changes box sizing.
 */
export const HTML5_DOCTYPE = "<!DOCTYPE html>";

export const ensureDoctype = (html: string): string =>
  /^\s*<!doctype/i.test(html) ? html : `${HTML5_DOCTYPE}\n${html}`;
