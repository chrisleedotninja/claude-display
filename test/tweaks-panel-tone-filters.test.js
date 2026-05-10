import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { toggleActiveTone } from "../app.js";

describe("toggleActiveTone pure helper (Step 1)", () => {
  it("returns a Set with the toggled tone removed when previously present", () => {
    const prev = new Set(["attention", "active", "success", "neutral"]);
    const next = toggleActiveTone(prev, "active");
    expect(next.has("active")).toBe(false);
    expect(next.has("attention")).toBe(true);
    expect(next.has("success")).toBe(true);
    expect(next.has("neutral")).toBe(true);
  });

  it("returns a Set with the toggled tone added when previously absent", () => {
    const prev = new Set(["attention", "success"]);
    const next = toggleActiveTone(prev, "active");
    expect(next.has("active")).toBe(true);
    expect(next.has("attention")).toBe(true);
    expect(next.has("success")).toBe(true);
  });

  it("returns a different Set instance from the input", () => {
    const prev = new Set(["attention"]);
    const next = toggleActiveTone(prev, "active");
    expect(next).not.toBe(prev);
    expect(next instanceof Set).toBe(true);
  });

  it("does not mutate the input Set", () => {
    const prev = new Set(["attention", "active"]);
    const snapshot = new Set(prev);
    toggleActiveTone(prev, "active");
    expect(prev.size).toBe(snapshot.size);
    for (const tone of snapshot) {
      expect(prev.has(tone)).toBe(true);
    }
    // The active tone should still be in prev — it was not mutated.
    expect(prev.has("active")).toBe(true);
  });

  it("passes through unrecognized tone strings (toggles them as opaque strings) without throwing", () => {
    const prev = new Set(["attention"]);
    expect(() => toggleActiveTone(prev, "made-up-tone")).not.toThrow();
    const added = toggleActiveTone(prev, "made-up-tone");
    expect(added.has("made-up-tone")).toBe(true);
    const removed = toggleActiveTone(added, "made-up-tone");
    expect(removed.has("made-up-tone")).toBe(false);
  });
});
