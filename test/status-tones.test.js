import { describe, it, expect } from "bun:test";
import {
  TONE_GROUPS,
  STATUS_TONES,
  toneForStatus,
  filterCardsByTones,
} from "../status-tones.js";

const EXPECTED_TONES = ["attention", "active", "success", "neutral"];

const EXPECTED_STATUS_TONES = {
  approval: "attention",
  waiting: "attention",
  blocked: "attention",
  working: "active",
  tests: "active",
  reviewing: "active",
  success: "success",
  idle: "neutral",
};

describe("TONE_GROUPS", () => {
  it("is a Set", () => {
    expect(TONE_GROUPS).toBeInstanceOf(Set);
  });

  it("contains exactly the four tone-group strings", () => {
    expect([...TONE_GROUPS].sort()).toEqual([...EXPECTED_TONES].sort());
  });

  it("is frozen", () => {
    expect(Object.isFrozen(TONE_GROUPS)).toBe(true);
  });
});

describe("STATUS_TONES", () => {
  it("has exactly the eight allow-list status keys", () => {
    expect(Object.keys(STATUS_TONES).sort()).toEqual(
      Object.keys(EXPECTED_STATUS_TONES).sort(),
    );
  });

  it("each value is a member of TONE_GROUPS", () => {
    for (const key of Object.keys(STATUS_TONES)) {
      expect(TONE_GROUPS.has(STATUS_TONES[key])).toBe(true);
    }
  });

  it("partitions the eight statuses into the four tone groups verbatim", () => {
    expect(STATUS_TONES).toEqual(EXPECTED_STATUS_TONES);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(STATUS_TONES)).toBe(true);
  });
});

describe("toneForStatus", () => {
  it("returns the matching tone-group string for every allow-list status", () => {
    for (const key of Object.keys(EXPECTED_STATUS_TONES)) {
      expect(toneForStatus(key)).toBe(STATUS_TONES[key]);
    }
  });

  it("returns 'neutral' for undefined", () => {
    expect(toneForStatus(undefined)).toBe("neutral");
  });

  it("returns 'neutral' for null", () => {
    expect(toneForStatus(null)).toBe("neutral");
  });

  it("returns 'neutral' for the empty string", () => {
    expect(toneForStatus("")).toBe("neutral");
  });

  it("returns 'neutral' for a non-string input (number)", () => {
    expect(toneForStatus(42)).toBe("neutral");
  });

  it("returns 'neutral' for an unknown string", () => {
    expect(toneForStatus("not-a-status")).toBe("neutral");
  });
});

describe("filterCardsByTones — boundary cases", () => {
  const fixture = Object.freeze([
    { id: "a", status: "approval" },
    { id: "b", status: "working" },
    { id: "c", status: "success" },
    { id: "d", status: "idle" },
  ]);

  it("returns a new array equal in length and order when all four tones are active", () => {
    const cards = fixture.map((c) => ({ ...c }));
    const snapshot = cards.map((c) => ({ ...c }));
    const result = filterCardsByTones(cards, TONE_GROUPS);
    expect(result).not.toBe(cards);
    expect(result.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
    expect(cards).toEqual(snapshot);
  });

  it("returns a new empty array when activeTones is an empty Set", () => {
    const cards = fixture.map((c) => ({ ...c }));
    const snapshot = cards.map((c) => ({ ...c }));
    const result = filterCardsByTones(cards, new Set());
    expect(result).not.toBe(cards);
    expect(result).toEqual([]);
    expect(cards).toEqual(snapshot);
  });
});
