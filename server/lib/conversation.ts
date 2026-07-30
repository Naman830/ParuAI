import type { Role } from "../generated/prisma/enums.js";

/** Marker used by the client to stop polling when a background job died. */
export const GENERATION_FAILED_MARKER = "[generation-failed]";

/**
 * Every fixed assistant line the app writes to `Conversation`.
 *
 * Defined HERE and nowhere else. The controllers write these exact values and
 * `isAssistantBoilerplate()` matches these exact values, so a reworded status
 * message can never start silently leaking into the model's context. Adding a
 * new status message to this object is what keeps it invisible to the model —
 * there is no second list to remember to update.
 *
 * These strings are byte-for-byte copies of what the controllers used to
 * inline, odd capitalisation and missing trailing periods included. Do not
 * "tidy" them: they are displayed in the sidebar chat and `[generation-failed]`
 * is a cross-repo contract matched in client/src/pages/Projects.tsx.
 */
export const ASSISTANT_MESSAGES = {
  GENERATING: "Now generating your Website...",
  REVISING: "Now making changes to your website...",
  CREATED:
    "I've Created your Website! You can now preview it and request any changes.",
  REVISED: "I've made the changes to your website! You can now preview it",
  ROLLED_BACK:
    "I've rolled back your website to selected version. You can now preview it",
  UNUSABLE_OUTPUT: "Unable to generate the code, please try again",
} as const;

/** Prefixes of the assistant lines that interpolate runtime values. */
export const ASSISTANT_MESSAGE_PREFIXES = {
  ENHANCED_PROMPT: "I've enhanced your prompt to: ",
  GENERATION_FAILED: `${GENERATION_FAILED_MARKER} `,
} as const;

export const enhancedPromptMessage = (enhanced: string) =>
  `${ASSISTANT_MESSAGE_PREFIXES.ENHANCED_PROMPT}"${enhanced}"`;

export const generationFailedMessage = (
  reason = "Generation failed and your credits were refunded. Please try again.",
) => `${ASSISTANT_MESSAGE_PREFIXES.GENERATION_FAILED}${reason}`;

/** True for any app-authored status line, i.e. anything the model should not see. */
export const isAssistantBoilerplate = (content: string): boolean => {
  const text = content.trim();
  if (Object.values(ASSISTANT_MESSAGES).some((m) => text === m)) return true;
  return Object.values(ASSISTANT_MESSAGE_PREFIXES).some((p) =>
    text.startsWith(p.trimEnd()),
  );
};

export type ConversationTurn = { role: Role; content: string };

export type RevisionHistoryOptions = {
  /** Newest N surviving turns. */
  maxTurns?: number;
  /** Per-turn character ceiling; longer turns are truncated. */
  maxCharsPerTurn?: number;
  /** Total character budget across kept turns. */
  maxTotalChars?: number;
  /**
   * Discard everything up to and including the most recent rollback notice.
   * After a rollback the live document IS the older snapshot, so the requests
   * that produced the abandoned versions no longer describe it.
   */
  resetOnRollback?: boolean;
};

const DEFAULTS = {
  maxTurns: 8,
  maxCharsPerTurn: 500,
  maxTotalChars: 2000,
  resetOnRollback: true,
} as const;

export const HISTORY_TRUNCATION_SUFFIX = "…";

/**
 * Filter + cap conversation turns down to what is worth showing the model.
 *
 * Input oldest-first; output oldest-first. Never mutates the input.
 *
 * Today this collapses to "user turns only", because every assistant row the
 * app writes is app-authored status text — the model's real output is HTML and
 * lives in Version.code, never in Conversation. It is expressed as a role-aware
 * rule anyway so it stays correct if assistant rows ever carry model prose.
 */
export function selectRevisionHistory(
  turns: readonly ConversationTurn[],
  options?: RevisionHistoryOptions,
): ConversationTurn[] {
  const maxTurns = options?.maxTurns ?? DEFAULTS.maxTurns;
  const maxCharsPerTurn = options?.maxCharsPerTurn ?? DEFAULTS.maxCharsPerTurn;
  const maxTotalChars = options?.maxTotalChars ?? DEFAULTS.maxTotalChars;
  const resetOnRollback = options?.resetOnRollback ?? DEFAULTS.resetOnRollback;

  let scoped = turns;

  if (resetOnRollback) {
    // Only the LAST rollback matters; anything at or before it is undone.
    let barrier = -1;
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      if (turns[i].content.trim() === ASSISTANT_MESSAGES.ROLLED_BACK) {
        barrier = i;
        break;
      }
    }
    if (barrier !== -1) scoped = turns.slice(barrier + 1);
  }

  const kept = scoped.filter((turn) =>
    turn.role === "assistant"
      ? !isAssistantBoilerplate(turn.content)
      : turn.content.trim() !== "",
  );

  // Walk newest-first so the budget is spent on the most relevant turns, and
  // truncate BEFORE measuring so one runaway prompt (the Hero textarea is
  // unbounded) cannot eat the whole budget and starve older context.
  const picked: ConversationTurn[] = [];
  let total = 0;

  for (let i = kept.length - 1; i >= 0 && picked.length < maxTurns; i -= 1) {
    const turn = kept[i];
    const trimmed = turn.content.trim();
    const content =
      trimmed.length > maxCharsPerTurn
        ? trimmed.slice(0, maxCharsPerTurn) + HISTORY_TRUNCATION_SUFFIX
        : trimmed;

    if (total + content.length > maxTotalChars) break;

    total += content.length;
    picked.push({ role: turn.role, content });
  }

  return picked.reverse();
}

/**
 * Renders the selection as a compact block for the revision enhancer prompt.
 * Returns "" when nothing survives.
 */
export function formatRevisionHistory(
  turns: readonly ConversationTurn[],
  options?: RevisionHistoryOptions,
): string {
  const selected = selectRevisionHistory(turns, options);
  if (selected.length === 0) return "";

  const lines = selected.map((turn, index) => {
    // Label non-user turns explicitly so roles are never conflated inside the
    // single user message this block gets embedded in.
    const prefix = turn.role === "user" ? "" : "[assistant] ";
    return `${index + 1}. ${prefix}${turn.content}`;
  });

  return `Earlier requests from the user for this website (oldest first):\n${lines.join("\n")}`;
}
