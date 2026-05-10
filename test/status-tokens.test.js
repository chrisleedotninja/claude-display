import { describe, it, expect } from "bun:test";
import { STATUS_TOKENS, tokensForStatus } from "../status-tokens.js";

const EXPECTED = {
  approval: { color: "#ff9e64", icon: "?", label: "Approval" },
  waiting: { color: "#e0af68", icon: "⋯", label: "Waiting" },
  blocked: { color: "#f7768e", icon: "!", label: "Blocked" },
  working: { color: "#7aa2f7", icon: "▶", label: "Working" },
  tests: { color: "#7dcfff", icon: "▣", label: "Tests" },
  reviewing: { color: "#bb9af7", icon: "◉", label: "Review" },
  success: { color: "#9ece6a", icon: "✓", label: "Success" },
  idle: { color: "#565f89", icon: "○", label: "Idle" },
};

describe("STATUS_TOKENS", () => {
  it("has exactly the eight allow-list keys", () => {
    expect(Object.keys(STATUS_TOKENS).sort()).toEqual(
      Object.keys(EXPECTED).sort(),
    );
  });

  it("each entry equals the locked color/icon/label triple verbatim", () => {
    for (const key of Object.keys(EXPECTED)) {
      expect(STATUS_TOKENS[key]).toEqual(EXPECTED[key]);
    }
  });

  it("the outer object is frozen", () => {
    expect(Object.isFrozen(STATUS_TOKENS)).toBe(true);
  });

  it("each entry is frozen", () => {
    for (const key of Object.keys(EXPECTED)) {
      expect(Object.isFrozen(STATUS_TOKENS[key])).toBe(true);
    }
  });
});

describe("tokensForStatus", () => {
  it("returns the matching entry for every allow-list value", () => {
    for (const key of Object.keys(EXPECTED)) {
      expect(tokensForStatus(key)).toEqual(EXPECTED[key]);
    }
  });

  it("returns the idle entry for undefined", () => {
    expect(tokensForStatus(undefined)).toBe(STATUS_TOKENS.idle);
  });

  it("returns the idle entry for null", () => {
    expect(tokensForStatus(null)).toBe(STATUS_TOKENS.idle);
  });

  it("returns the idle entry for the empty string", () => {
    expect(tokensForStatus("")).toBe(STATUS_TOKENS.idle);
  });

  it("returns the idle entry for a non-string input (number)", () => {
    expect(tokensForStatus(42)).toBe(STATUS_TOKENS.idle);
  });

  it("returns the idle entry for an unknown string", () => {
    expect(tokensForStatus("not-a-status")).toBe(STATUS_TOKENS.idle);
  });

  it("returns the same frozen idle object identity for both 'idle' and a fallback case", () => {
    expect(tokensForStatus("idle")).toBe(tokensForStatus("not-a-status"));
  });
});
