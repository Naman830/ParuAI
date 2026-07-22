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
