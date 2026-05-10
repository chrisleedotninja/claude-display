import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  STATUS_TOKENS,
  ATTENTION_STATUSES,
  isAttentionStatus,
} from "../status-tokens.js";
import { createServer } from "../server.js";

describe("ATTENTION_STATUSES set and isAttentionStatus predicate", () => {
  it("ATTENTION_STATUSES contains exactly approval, waiting, blocked", () => {
    const keys = [...ATTENTION_STATUSES].sort();
    expect(keys).toEqual(["approval", "blocked", "waiting"]);
  });

  it("ATTENTION_STATUSES is frozen", () => {
    expect(Object.isFrozen(ATTENTION_STATUSES)).toBe(true);
  });

  it("isAttentionStatus returns true for each of approval, waiting, blocked", () => {
    expect(isAttentionStatus("approval")).toBe(true);
    expect(isAttentionStatus("waiting")).toBe(true);
    expect(isAttentionStatus("blocked")).toBe(true);
  });

  it("isAttentionStatus returns false for the five non-attention allow-list statuses", () => {
    expect(isAttentionStatus("working")).toBe(false);
    expect(isAttentionStatus("tests")).toBe(false);
    expect(isAttentionStatus("reviewing")).toBe(false);
    expect(isAttentionStatus("success")).toBe(false);
    expect(isAttentionStatus("idle")).toBe(false);
  });

  it("isAttentionStatus returns false for unknown / non-string / undefined / null inputs", () => {
    expect(isAttentionStatus("not-a-status")).toBe(false);
    expect(isAttentionStatus("")).toBe(false);
    expect(isAttentionStatus(undefined)).toBe(false);
    expect(isAttentionStatus(null)).toBe(false);
    expect(isAttentionStatus(42)).toBe(false);
  });
});
