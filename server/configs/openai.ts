import "dotenv/config";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.AI_API_KEY,
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
