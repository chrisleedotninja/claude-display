import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { nextPanelOpen } from "../app.js";

describe("nextPanelOpen pure toggle helper (Step 1)", () => {
  it("returns true when previous state is false", () => {
    expect(nextPanelOpen(false)).toBe(true);
  });

  it("returns false when previous state is true", () => {
    expect(nextPanelOpen(true)).toBe(false);
  });

  it("defaults undefined input to closed (false)", () => {
    // Documented start state: closed. Toggling from `undefined` therefore
    // behaves as if the previous state were `false` — i.e. opens the panel.
    expect(nextPanelOpen(undefined)).toBe(true);
  });

  it("never throws on bad input — non-boolean values coerce to closed-then-toggle", () => {
    expect(() => nextPanelOpen(null)).not.toThrow();
    expect(() => nextPanelOpen(0)).not.toThrow();
    expect(() => nextPanelOpen("")).not.toThrow();
    expect(() => nextPanelOpen("nope")).not.toThrow();
    expect(() => nextPanelOpen({})).not.toThrow();
    expect(() => nextPanelOpen([])).not.toThrow();
    // All non-boolean inputs are treated as "closed" → toggling gives true.
    expect(nextPanelOpen(null)).toBe(true);
    expect(nextPanelOpen(0)).toBe(true);
    expect(nextPanelOpen("")).toBe(true);
    expect(nextPanelOpen("nope")).toBe(true);
    expect(nextPanelOpen({})).toBe(true);
    expect(nextPanelOpen([])).toBe(true);
  });
});
