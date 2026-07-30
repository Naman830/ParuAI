import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import type { Stream } from "openai/streaming";
import openai, { AI_MODEL } from "../configs/openai.js";

/**
 * Runs one streaming chat completion and hands every text delta to `onDelta`,
 * returning the fully accumulated raw output.
 *
 * Raw is deliberate: callers still put the returned string through
 * extractHtml() / isRenderableHtml() before persisting it. This module only
 * owns the transport and its failure bounds.
 */

// Deltas can stop arriving without the connection closing. This is the ceiling
// on that silence, independent of AI_REQUEST_TIMEOUT_MS in configs/openai.ts:
// the SDK's `timeout` bounds getting a response, not a response BODY that
// opens and then stalls forever.
export const AI_STREAM_IDLE_TIMEOUT_MS = Number(
  process.env.AI_STREAM_IDLE_TIMEOUT_MS ?? 90_000,
);

// A real generated page is tens of KB. Four megabytes means the model is
// looping, and every character of it is being buffered in a background job.
const HARD_ABORT_CHARS = 4 * 1024 * 1024;

export const streamChatCompletion = async (
  messages: ChatCompletionMessageParam[],
  onDelta: (piece: string) => void,
): Promise<string> => {
  // Annotated, never inline: in an object literal `stream: true` widens to
  // `boolean`, TypeScript then resolves the base overload, and the return type
  // decays to `Stream<ChatCompletionChunk> | ChatCompletion` — which cannot be
  // iterated without a cast. The annotation pins the streaming overload.
  const params: ChatCompletionCreateParamsStreaming = {
    model: AI_MODEL,
    messages,
    stream: true,
  };

  const stream: Stream<ChatCompletionChunk> =
    await openai.chat.completions.create(params);

  let full = "";
  let idle: ReturnType<typeof setTimeout> | undefined;

  // Re-armed on every chunk, so slow-but-progressing generations (37-72 s per
  // call on the free tier is normal) are never cut off, while a provider that
  // goes quiet mid-page is. Without this bound a stalled body holds the
  // fire-and-forget generation open indefinitely: the project stays at
  // current_code: null with no [generation-failed] marker, and the client
  // polls until the marker appears — i.e. forever. Aborting the controller is
  // what turns that hang into a throw the caller can refund on.
  const armIdleWatchdog = () => {
    clearTimeout(idle);
    idle = setTimeout(
      () => stream.controller.abort(),
      AI_STREAM_IDLE_TIMEOUT_MS,
    );
  };

  try {
    armIdleWatchdog();

    // A mid-body provider drop (and the watchdog abort above) throws out of
    // this loop rather than ending it. That is the outcome we want: the SDK's
    // maxRetries cannot replay a stream we have already partly consumed, so
    // there is nothing to retry — the throw belongs in the caller's catch,
    // where the credit refund and the [generation-failed] marker are written.
    for await (const chunk of stream) {
      armIdleWatchdog();

      // `choices` is an EMPTY ARRAY on the final usage-only chunk, and delta
      // content is `string | null | undefined`, so neither the index nor the
      // value can be trusted.
      const piece = chunk.choices[0]?.delta?.content;
      if (typeof piece !== "string" || piece === "") continue;

      full += piece;
      onDelta(piece);

      if (full.length > HARD_ABORT_CHARS) {
        stream.controller.abort();

        // Throw, do not break. Breaking would return a truncated document as
        // if it were complete: extractHtml() would slice it happily and
        // isRenderableHtml() only tests for `<html`, so a half-written 4MB
        // page would pass the gate and be persisted as current_code — the
        // live document served to /view/:id and downloaded as index.html.
        throw new Error(
          `AI stream exceeded ${HARD_ABORT_CHARS} characters; aborted`,
        );
      }
    }

    return full;
  } catch (error) {
    // No-op when the watchdog (or the guard above) already aborted; for every
    // other failure this is what releases the still-open response.
    stream.controller.abort();
    throw error;
  } finally {
    // The timer keeps the event loop alive and would abort a stream we are
    // already done with, so it has to go on every exit path.
    clearTimeout(idle);
  }
};
