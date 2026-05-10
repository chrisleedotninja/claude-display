import { describe, it, expect } from "bun:test";
import {
  TONE_GROUPS,
  STATUS_TONES,
  toneForStatus,
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
