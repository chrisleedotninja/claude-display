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

describe("server static route /status-tones.js (Step 3)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("GET /status-tones.js returns 200 with the tone-module source text", async () => {
    const res = await fetch(`${baseUrl}/status-tones.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
    expect(body.includes("TONE_GROUPS")).toBe(true);
    expect(body.includes("filterCardsByTones")).toBe(true);
  });

  it("preserves the 404 fallback for unrelated unknown static paths", async () => {
    const res = await fetch(`${baseUrl}/not-a-real-path.js`);
    expect(res.status).toBe(404);
  });
});

describe("served /app.js renders one filter control per tone group inside the panel body (Step 4)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js mentions the tweaks-tone-filter class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("tweaks-tone-filter")).toBe(true);
  });

  it("served /app.js mentions the is-on on-state modifier string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("is-on")).toBe(true);
  });

  it("renders all four tone-name labels inside the panel-body span", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Walk forward from the panel-body class to the surface template's
    // closing backtick — the same surfaceIdx → closeIdx walk used in
    // test/tweaks-panel-open-close.test.js Step 4.
    const surfaceIdx = body.indexOf("tweaks-panel-surface");
    expect(surfaceIdx).toBeGreaterThan(-1);
    const bodyIdx = body.indexOf("tweaks-panel-body", surfaceIdx);
    expect(bodyIdx).toBeGreaterThan(surfaceIdx);
    const closeIdx = body.indexOf("`", surfaceIdx);
    expect(closeIdx).toBeGreaterThan(bodyIdx);
    const span = body.slice(bodyIdx, closeIdx);
    for (const tone of ["attention", "active", "success", "neutral"]) {
      expect(span.includes(tone)).toBe(true);
    }
  });

  it("wires the controls with onClick (or onclick) inside the surface span", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const surfaceIdx = body.indexOf("tweaks-panel-surface");
    const closeIdx = body.indexOf("`", surfaceIdx);
    const span = body.slice(surfaceIdx, closeIdx);
    const hasClickHandler = /\bonClick\b/.test(span) || /\bonclick\b/.test(span);
    expect(hasClickHandler).toBe(true);
  });
});
