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

describe("served /app.js filtered card list drives both the rendered list and the empty-state branch (Step 5)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  // Brace-walking helper (mirrored from
  // test/tweaks-panel-open-close.test.js): given the source and the index
  // of an opening `{`, return the substring between that brace and its
  // matching `}`.
  function extractBalancedBlock(src, openBraceIdx) {
    let depth = 1;
    for (let i = openBraceIdx + 1; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return src.slice(openBraceIdx + 1, i);
      }
    }
    return null;
  }

  function findFunctionBodyOpenBrace(src, name) {
    const sigRe = new RegExp(`\\bfunction\\s+${name}\\s*\\(`);
    const m = src.match(sigRe);
    if (!m) return -1;
    let i = m.index + m[0].length;
    let depth = 1;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      i++;
    }
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] !== "{") return -1;
    return i;
  }

  it("served /app.js contains a filterCardsByTones( call site whose args reference cardsFromState and activeTones", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const callIdx = body.indexOf("filterCardsByTones(");
    expect(callIdx).toBeGreaterThan(-1);
    const openParen = callIdx + "filterCardsByTones".length;
    expect(body[openParen]).toBe("(");
    let depth = 1;
    let endIdx = -1;
    for (let i = openParen + 1; i < body.length; i++) {
      const c = body[i];
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    expect(endIdx).toBeGreaterThan(openParen);
    const span = body.slice(openParen, endIdx + 1);
    expect(span.includes("cardsFromState")).toBe(true);
    expect(span.includes("activeTones")).toBe(true);
  });

  it("preserves the empty-state class string and the 'No sessions yet.' literal", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("empty-state")).toBe(true);
    expect(body.includes("No sessions yet.")).toBe(true);
  });

  it("Dashboard's body has a cards.length === 0 check and no second cardsFromState( call inside it", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const openIdx = findFunctionBodyOpenBrace(body, "Dashboard");
    expect(openIdx).toBeGreaterThan(-1);
    const inner = extractBalancedBlock(body, openIdx);
    expect(inner).not.toBeNull();
    // The empty-state branch is still gated on cards.length === 0.
    expect(/cards\.length\s*===\s*0/.test(inner)).toBe(true);
    // Dashboard does not re-derive cards itself — it gets the already-
    // filtered list from mount(). So no cardsFromState( call appears
    // inside Dashboard's body.
    expect(inner.includes("cardsFromState(")).toBe(false);
  });
});

describe("served /app.js toggle handler updates activeTones via toggleActiveTone and calls draw() (Step 6)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("references the toggleActiveTone helper by name in the served body", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("toggleActiveTone")).toBe(true);
  });

  it("the toggle handler reassigns activeTones via the helper and calls draw()", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Locate a span starting at the first `toggleActiveTone(` call site
    // (the helper's USE site, not its definition). Walk forward to the
    // next `}` that closes the enclosing arrow-function or block. The
    // span must mention `activeTones` on both sides of an `=` and
    // contain a `draw(` call.
    const useIdx = body.indexOf("toggleActiveTone(", body.indexOf("toggleActiveTone") + 1);
    // First occurrence is `export function toggleActiveTone`; the second
    // is the use site. Sanity-check we found a use site beyond the
    // definition.
    expect(useIdx).toBeGreaterThan(-1);
    // Walk back to find the start of the enclosing handler — look for
    // the most recent `=>` or `{`.
    // Simpler: take a window of ~400 chars around the use site and
    // assert the structural conditions hold.
    const windowStart = Math.max(0, useIdx - 200);
    const windowEnd = Math.min(body.length, useIdx + 400);
    const span = body.slice(windowStart, windowEnd);
    // Both an assignment of activeTones and a draw() call must appear in
    // the same handler window.
    expect(/activeTones\s*=\s*toggleActiveTone\s*\(\s*activeTones\b/.test(span)).toBe(true);
    expect(/\bdraw\s*\(/.test(span)).toBe(true);
  });
});
