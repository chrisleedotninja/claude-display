import { describe, it, expect } from "bun:test";
import { NEEDS_TOKENS } from "../needs-tokens.js";

const EXPECTED = {
  "approve-tool": { label: "Approve tool", icon: "✓" },
  "answer-question": { label: "Answer question", icon: "?" },
  "provide-input": { label: "Provide input", icon: "✎" },
  "pick-option": { label: "Pick option", icon: "◆" },
  "confirm-destructive": { label: "Confirm destructive", icon: "⚠" },
  "resolve-conflict": { label: "Resolve conflict", icon: "⤫" },
  "review-diff": { label: "Review diff", icon: "≣" },
};

describe("NEEDS_TOKENS", () => {
  it("has exactly the seven wire-enum keys", () => {
    expect(Object.keys(NEEDS_TOKENS).sort()).toEqual(
      Object.keys(EXPECTED).sort(),
    );
  });

  it("each entry equals the locked label/icon pair verbatim", () => {
    for (const key of Object.keys(EXPECTED)) {
      expect(NEEDS_TOKENS[key]).toEqual(EXPECTED[key]);
    }
  });
});
