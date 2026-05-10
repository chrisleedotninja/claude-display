import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { toggleVisibleField } from "../app.js";

describe("toggleVisibleField pure helper (Step 1)", () => {
  it("returns a Set with the toggled field removed when previously present", () => {
    const prev = new Set(["repo", "branch", "session", "desktop", "elapsed"]);
    const next = toggleVisibleField(prev, "branch");
    expect(next.has("branch")).toBe(false);
    expect(next.has("repo")).toBe(true);
    expect(next.has("session")).toBe(true);
    expect(next.has("desktop")).toBe(true);
    expect(next.has("elapsed")).toBe(true);
  });

  it("returns a Set with the toggled field added when previously absent", () => {
    const prev = new Set(["repo", "session"]);
    const next = toggleVisibleField(prev, "branch");
    expect(next.has("branch")).toBe(true);
    expect(next.has("repo")).toBe(true);
    expect(next.has("session")).toBe(true);
  });

  it("returns a different Set instance from the input", () => {
    const prev = new Set(["repo"]);
    const next = toggleVisibleField(prev, "branch");
    expect(next).not.toBe(prev);
    expect(next instanceof Set).toBe(true);
  });

  it("does not mutate the input Set", () => {
    const prev = new Set(["repo", "branch"]);
    const snapshot = new Set(prev);
    toggleVisibleField(prev, "branch");
    expect(prev.size).toBe(snapshot.size);
    for (const field of snapshot) {
      expect(prev.has(field)).toBe(true);
    }
    // The branch field should still be in prev — it was not mutated.
    expect(prev.has("branch")).toBe(true);
  });

  it("passes through unrecognized field strings (toggles them as opaque strings) without throwing", () => {
    const prev = new Set(["repo"]);
    expect(() => toggleVisibleField(prev, "made-up-field")).not.toThrow();
    const added = toggleVisibleField(prev, "made-up-field");
    expect(added.has("made-up-field")).toBe(true);
    const removed = toggleVisibleField(added, "made-up-field");
    expect(removed.has("made-up-field")).toBe(false);
  });
});
