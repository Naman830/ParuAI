/**
 * Normalises raw model output into renderable HTML.
 *
 * The generator prompt forbids markdown/fences, but free-tier models still leak
 * them (and the occasional preamble sentence), so every write path must run the
 * output through here before persisting it. Previously this logic was
 * copy-pasted per handler and `makeRevision` was missing the preamble slicing,
 * which let "Here is your updated code:" end up inside current_code.
 */
export const extractHtml = (raw: string | null | undefined): string => {
  if (!raw) return "";

  // 1. Strip markdown code fences (```html ... ```)
  let code = raw
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```$/g, "")
    .trim();

  // 2. Drop any model preamble before the document starts.
  //    Case-insensitive: models emit both <!DOCTYPE and <!doctype.
  const doctype = code.search(/<!DOCTYPE/i);
  if (doctype !== -1) {
    code = code.slice(doctype);
  } else {
    const htmlTag = code.search(/<html[\s>]/i);
    if (htmlTag !== -1) code = code.slice(htmlTag);
  }

  return code.trim();
};

/** True when the model returned something we can actually render. */
export const isRenderableHtml = (code: string): boolean =>
  code.trim().length > 0 && /<html[\s>]/i.test(code);

/**
 * Prefixes an HTML5 doctype when the document doesn't already declare one.
 *
 * The browser's `documentElement.outerHTML` (which is what the client's
 * ProjectPreview.getCode() serializes) never includes the doctype, so a
 * hand-edited or visually-edited document arrives here without it. Persisting
 * that put every subsequent preview, /view/:id render and downloaded
 * index.html into quirks mode, which silently changes box sizing and layout
 * after the first manual save.
 */
export const ensureDoctype = (code: string): string =>
  /^\s*<!doctype/i.test(code) ? code : `<!DOCTYPE html>\n${code}`;

/**
 * Stateful trimmer for STREAMED model output.
 *
 * Suppresses everything before the document actually starts, so a live preview
 * never paints markdown fences or a "Here is your code:" preamble as visible
 * text (and never gets forced into quirks mode by a stray prefix before the
 * doctype). Chunk boundaries are arbitrary, so the document start can be split
 * across calls — hence the buffered prefix rather than a per-chunk regex.
 *
 * DISPLAY ONLY. This never feeds a DB write: current_code and Version.code
 * still go through extractHtml() on the fully accumulated string.
 */
export const createHtmlStreamTrimmer = (maxPrefix = 4096) => {
  let prefix = "";
  let open = false;

  return (chunk: string): string => {
    if (open) return chunk;

    prefix += chunk;

    // Same precedence as extractHtml: prefer <!DOCTYPE, fall back to <html.
    let start = prefix.search(/<!DOCTYPE/i);
    if (start === -1) {
      const htmlTag = prefix.search(/<html[\s>]/i);
      if (htmlTag !== -1) start = htmlTag;
    }

    if (start !== -1) {
      open = true;
      const out = prefix.slice(start);
      prefix = "";
      return out;
    }

    // No document start within the budget — flush what we have and stop
    // buffering, so a model that emits a bare fragment still shows something.
    // isRenderableHtml() rejects it at persist time regardless.
    if (prefix.length > maxPrefix) {
      open = true;
      const out = prefix;
      prefix = "";
      return out;
    }

    return "";
  };
};
