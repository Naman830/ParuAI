import { describe, expect, it } from "vitest";
import {
  ASSISTANT_MESSAGES,
  GENERATION_FAILED_MARKER,
  HISTORY_TRUNCATION_SUFFIX,
  enhancedPromptMessage,
  formatRevisionHistory,
  generationFailedMessage,
  isAssistantBoilerplate,
  selectRevisionHistory,
  type ConversationTurn,
} from "./conversation.js";

const user = (content: string): ConversationTurn => ({ role: "user", content });
const assistant = (content: string): ConversationTurn => ({
  role: "assistant",
  content,
});

describe("isAssistantBoilerplate", () => {
  // Iterating the catalog means a newly added status message is covered
  // automatically — which is the whole point of having one definition.
  it("matches every message in the catalog", () => {
    for (const message of Object.values(ASSISTANT_MESSAGES)) {
      expect(isAssistantBoilerplate(message)).toBe(true);
    }
  });

  it("matches the interpolating messages whatever they interpolate", () => {
    expect(isAssistantBoilerplate(enhancedPromptMessage("literally anything"))).toBe(
      true,
    );
    expect(isAssistantBoilerplate(enhancedPromptMessage(""))).toBe(true);
    expect(isAssistantBoilerplate(generationFailedMessage())).toBe(true);
    expect(isAssistantBoilerplate(generationFailedMessage("other reason"))).toBe(
      true,
    );
  });

  it("ignores surrounding whitespace", () => {
    expect(isAssistantBoilerplate(`  ${ASSISTANT_MESSAGES.REVISED}\n`)).toBe(true);
  });

  it("does not match real user prompts", () => {
    expect(isAssistantBoilerplate("make the hero blue")).toBe(false);
    expect(isAssistantBoilerplate("")).toBe(false);
    // Near-miss on CREATED — must not be swallowed.
    expect(isAssistantBoilerplate("I've made a coffee shop site")).toBe(false);
    expect(isAssistantBoilerplate("Now generating a sitemap for me please")).toBe(
      false,
    );
  });
});

describe("selectRevisionHistory", () => {
  it("drops boilerplate assistant turns and keeps user turns in order", () => {
    const turns = [
      user("build a coffee shop landing page"),
      assistant(enhancedPromptMessage("a detailed coffee brief")),
      assistant(ASSISTANT_MESSAGES.GENERATING),
      assistant(ASSISTANT_MESSAGES.CREATED),
      user("make the hero blue"),
      assistant(ASSISTANT_MESSAGES.REVISING),
      assistant(ASSISTANT_MESSAGES.REVISED),
    ];

    expect(selectRevisionHistory(turns)).toEqual([
      user("build a coffee shop landing page"),
      user("make the hero blue"),
    ]);
  });

  it("keeps a non-boilerplate assistant turn (the rule is not role-only)", () => {
    const turns = [user("hi"), assistant("I used a serif font for the headings.")];
    expect(selectRevisionHistory(turns)).toEqual([
      user("hi"),
      assistant("I used a serif font for the headings."),
    ]);
  });

  it("drops empty and whitespace-only user turns", () => {
    expect(selectRevisionHistory([user(""), user("   \n "), user("real")])).toEqual([
      user("real"),
    ]);
  });

  it("keeps the newest maxTurns, returned oldest-first", () => {
    const turns = [user("one"), user("two"), user("three"), user("four")];
    expect(selectRevisionHistory(turns, { maxTurns: 2 })).toEqual([
      user("three"),
      user("four"),
    ]);
  });

  it("truncates a turn over maxCharsPerTurn and appends the suffix", () => {
    const long = "x".repeat(50);
    const [turn] = selectRevisionHistory([user(long)], { maxCharsPerTurn: 10 });
    expect(turn.content).toBe("x".repeat(10) + HISTORY_TRUNCATION_SUFFIX);
    expect(turn.content).toHaveLength(10 + HISTORY_TRUNCATION_SUFFIX.length);
  });

  it("stops adding older turns at maxTotalChars and never partially includes one", () => {
    const turns = [user("aaaaa"), user("bbbbb"), user("ccccc")];
    // Budget of 12 fits the two newest (10 chars); a third would reach 15.
    expect(selectRevisionHistory(turns, { maxTotalChars: 12 })).toEqual([
      user("bbbbb"),
      user("ccccc"),
    ]);
  });

  it("measures the budget AFTER per-turn truncation", () => {
    const turns = [user("older"), user("y".repeat(100))];
    // Untruncated, the newest turn alone (100) would blow a 20 budget and the
    // older turn would never be reached. Truncated to 10+suffix it fits, and
    // leaves room for "older".
    const result = selectRevisionHistory(turns, {
      maxCharsPerTurn: 10,
      maxTotalChars: 20,
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(user("older"));
    expect(result[1].content).toBe("y".repeat(10) + HISTORY_TRUNCATION_SUFFIX);
  });

  it("discards everything at or before the last rollback by default", () => {
    const turns = [
      user("build a shop"),
      user("make it green"),
      assistant(ASSISTANT_MESSAGES.ROLLED_BACK),
      user("make it red"),
    ];
    expect(selectRevisionHistory(turns)).toEqual([user("make it red")]);
  });

  it("honours only the LAST rollback barrier when there are several", () => {
    const turns = [
      user("first"),
      assistant(ASSISTANT_MESSAGES.ROLLED_BACK),
      user("second"),
      assistant(ASSISTANT_MESSAGES.ROLLED_BACK),
      user("third"),
    ];
    expect(selectRevisionHistory(turns)).toEqual([user("third")]);
  });

  it("keeps pre-rollback turns when resetOnRollback is false", () => {
    const turns = [
      user("build a shop"),
      assistant(ASSISTANT_MESSAGES.ROLLED_BACK),
      user("make it red"),
    ];
    expect(selectRevisionHistory(turns, { resetOnRollback: false })).toEqual([
      user("build a shop"),
      user("make it red"),
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(selectRevisionHistory([])).toEqual([]);
  });

  it("does not mutate its input", () => {
    const turns = Object.freeze([
      user("b"),
      assistant(ASSISTANT_MESSAGES.REVISED),
      user("a"),
    ]) as readonly ConversationTurn[];
    const before = JSON.stringify(turns);
    selectRevisionHistory(turns, { maxTurns: 1 });
    expect(JSON.stringify(turns)).toBe(before);
  });
});

describe("formatRevisionHistory", () => {
  it("returns an empty string when nothing survives", () => {
    expect(formatRevisionHistory([])).toBe("");
    expect(
      formatRevisionHistory([
        assistant(ASSISTANT_MESSAGES.GENERATING),
        assistant(ASSISTANT_MESSAGES.CREATED),
      ]),
    ).toBe("");
  });

  it("renders a numbered oldest-first block", () => {
    const turns = [
      user("build me a coffee shop landing page"),
      assistant(ASSISTANT_MESSAGES.CREATED),
      user("make the hero section blue"),
    ];
    expect(formatRevisionHistory(turns)).toBe(
      "Earlier requests from the user for this website (oldest first):\n" +
        "1. build me a coffee shop landing page\n" +
        "2. make the hero section blue",
    );
  });

  it("labels surviving assistant turns distinctly from user turns", () => {
    const output = formatRevisionHistory([
      user("hi"),
      assistant("I picked a serif font."),
    ]);
    expect(output).toContain("1. hi");
    expect(output).toContain("2. [assistant] I picked a serif font.");
  });

  it("never leaks a catalog message into the rendered block", () => {
    const turns = [
      user("a real request"),
      ...Object.values(ASSISTANT_MESSAGES).map(assistant),
      assistant(enhancedPromptMessage("some brief")),
      assistant(generationFailedMessage()),
    ];
    const output = formatRevisionHistory(turns, { resetOnRollback: false });
    for (const message of Object.values(ASSISTANT_MESSAGES)) {
      expect(output).not.toContain(message);
    }
    expect(output).not.toContain(GENERATION_FAILED_MARKER);
    expect(output).toContain("a real request");
  });

  it("is deterministic across repeated calls", () => {
    const turns = [user("one"), user("two")];
    expect(formatRevisionHistory(turns)).toBe(formatRevisionHistory(turns));
  });
});
