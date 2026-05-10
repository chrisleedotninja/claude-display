import { describe, it, expect } from "bun:test";
import { TONE_GROUPS } from "../status-tones.js";

const EXPECTED_TONES = ["attention", "active", "success", "neutral"];

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
