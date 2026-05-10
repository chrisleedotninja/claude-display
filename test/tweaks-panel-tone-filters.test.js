import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { toggleActiveTone } from "../app.js";
import { createServer } from "../server.js";

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

describe("served /app.js initialises activeTones from TONE_GROUPS (Step 2)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("imports TONE_GROUPS and filterCardsByTones from ./status-tones.js", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Match an import statement from "./status-tones.js" that references both
    // names. Tolerant of ordering and surrounding whitespace.
    const importRe =
      /import\s*\{[^}]*\}\s*from\s*["']\.\/status-tones\.js["']/;
    const m = body.match(importRe);
    expect(m).not.toBeNull();
    const importBlock = m[0];
    expect(importBlock.includes("TONE_GROUPS")).toBe(true);
    expect(importBlock.includes("filterCardsByTones")).toBe(true);
  });

  it("constructs a fresh Set(TONE_GROUPS) (or new Set([...TONE_GROUPS])) for the active-tones initialiser", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Tolerant: accept either `new Set(TONE_GROUPS)` or `new Set([...TONE_GROUPS])`.
    const initRe = /new\s+Set\s*\(\s*(?:\[\s*\.\.\.\s*)?TONE_GROUPS\s*\]?\s*\)/;
    expect(initRe.test(body)).toBe(true);
  });
});
