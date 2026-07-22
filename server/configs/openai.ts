import "dotenv/config";
import OpenAI from "openai";

// Per-request ceiling. Generating a full page on a free model legitimately
// takes minutes, so this is generous — it exists only to bound the failure
// case, not to cut off slow-but-working generations.
export const AI_REQUEST_TIMEOUT_MS = Number(
  process.env.AI_REQUEST_TIMEOUT_MS ?? 300_000,
);

const AI_MAX_RETRIES = Number(process.env.AI_MAX_RETRIES ?? 2);

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.AI_API_KEY,

  // The SDK defaults to a 10-minute timeout and 2 retries, so a stalled
  // provider could hold a background generation for ~30 minutes. Because that
  // job is fire-and-forget, the project sat at current_code: null the whole
  // time with no [generation-failed] marker — and the client polls until the
  // marker appears, so the UI spun forever. Bounding this is what makes the
  // failure path actually reachable.
  timeout: AI_REQUEST_TIMEOUT_MS,
  maxRetries: AI_MAX_RETRIES,
});

// Single source of truth for the generation model (was duplicated in 4 places).
// Override with AI_MODEL in .env to swap models without touching code.
//
// The previous default (stepfun/step-3.5-flash:free) was withdrawn from
// OpenRouter's free tier and now answers 404 "unavailable for free", which
// surfaced as every generation failing. Verify a new default with
// `GET https://openrouter.ai/api/v1/models` before changing this.
export const AI_MODEL = process.env.AI_MODEL || "poolside/laguna-s-2.1:free";

// OpenRouter's free tier rate-limits aggressively; this pause runs before the
// first completion of a new project. Set AI_RATE_LIMIT_DELAY_MS=0 on a paid key.
export const AI_RATE_LIMIT_DELAY_MS = Number(
  process.env.AI_RATE_LIMIT_DELAY_MS ?? 4000,
);

export default openai;
