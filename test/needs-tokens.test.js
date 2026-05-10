import { describe, it, expect } from "bun:test";
import { NEEDS_TOKENS, tokensForNeed } from "../needs-tokens.js";

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

  it("the outer object is frozen", () => {
    expect(Object.isFrozen(NEEDS_TOKENS)).toBe(true);
  });

  it("each entry is frozen", () => {
    for (const key of Object.keys(EXPECTED)) {
      expect(Object.isFrozen(NEEDS_TOKENS[key])).toBe(true);
    }
  });
});

describe("tokensForNeed", () => {
  it("returns the same frozen entry identity for every wire-enum value", () => {
    for (const key of Object.keys(EXPECTED)) {
      expect(tokensForNeed(key)).toBe(NEEDS_TOKENS[key]);
    }
  });

  it("returns null for undefined", () => {
    expect(tokensForNeed(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(tokensForNeed(null)).toBeNull();
  });

  it("returns null for the empty string", () => {
    expect(tokensForNeed("")).toBeNull();
  });

  it("returns null for a non-string number input", () => {
    expect(tokensForNeed(42)).toBeNull();
  });

  it("returns null for a non-string boolean input", () => {
    expect(tokensForNeed(true)).toBeNull();
  });

  it("returns null for a non-string object input", () => {
    expect(tokensForNeed({})).toBeNull();
  });

  it("returns null for an unknown string", () => {
    expect(tokensForNeed("not-a-need")).toBeNull();
  });

  it("returns null for a status-enum string (does not silently accept the cousin enum)", () => {
    expect(tokensForNeed("approval")).toBeNull();
  });
});

describe("module evaluation", () => {
  it("imports cleanly without adding own enumerable properties to globalThis", async () => {
    const before = new Set(Object.keys(globalThis));
    await import("../needs-tokens.js");
    const after = new Set(Object.keys(globalThis));
    const added = [...after].filter((key) => !before.has(key));
    expect(added).toEqual([]);
  });
});
