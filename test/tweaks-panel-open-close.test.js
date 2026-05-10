import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { nextPanelOpen } from "../app.js";
import { createServer } from "../server.js";

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

describe("served /app.js panel-open state defaults closed and gates the surface (Step 2)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js initialises the panel-open variable to false (panel starts closed)", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Match a `let panelOpen = false` (or `let panelOpen=false`) initialiser.
    // Using a tolerant regex so an explicit type annotation or surrounding
    // whitespace doesn't break the assertion.
    const initRe = /\b(?:let|var|const)\s+panelOpen\s*=\s*false\b/;
    expect(initRe.test(body)).toBe(true);
  });

  it("served /app.js renders the panel surface conditionally on panelOpen (not unconditionally)", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Mirrors the `guardThenClass` pattern in test/dashboard-card-elapsed.test.js:
    // a guard mentioning panelOpen precedes the panel-surface class string.
    const guardThenClass = /panelOpen[^]*?tweaks-panel-surface/;
    expect(guardThenClass.test(body)).toBe(true);
    // And belt-and-braces: the surface class must appear in the source at all.
    expect(body.includes("tweaks-panel-surface")).toBe(true);
  });
});

describe("served /app.js carries an open/close affordance wired to the toggle helper (Step 3)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js mentions the tweaks-panel-toggle class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("tweaks-panel-toggle")).toBe(true);
  });

  it("served /app.js source contains a literal <button element", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("<button")).toBe(true);
  });

  it("served /app.js wires the affordance to nextPanelOpen via an onClick (or onclick) handler", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // The affordance must reference the Step 1 helper by name in source.
    expect(body.includes("nextPanelOpen")).toBe(true);
    // And it must use a click-handler attribute. Either casing is acceptable
    // because htm/Preact accept both `onClick` and `onclick`.
    const hasClickHandler = /\bonClick\b/.test(body) || /\bonclick\b/.test(body);
    expect(hasClickHandler).toBe(true);
  });
});

describe("served /app.js panel surface renders a header identifying it as the Tweaks panel (Step 4)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js mentions the tweaks-panel-header class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("tweaks-panel-header")).toBe(true);
  });

  it("served /app.js renders the literal label 'Tweaks' inside the same conditional branch as the surface class", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Walk forward from the panel-surface class to the next closing of its
    // template literal (`); within that span the user-facing label "Tweaks"
    // and the header class must both appear, proving the header sits inside
    // the surface's open-state branch.
    const surfaceIdx = body.indexOf("tweaks-panel-surface");
    expect(surfaceIdx).toBeGreaterThan(-1);
    const closeIdx = body.indexOf("`", surfaceIdx);
    expect(closeIdx).toBeGreaterThan(surfaceIdx);
    const span = body.slice(surfaceIdx, closeIdx);
    expect(span.includes("tweaks-panel-header")).toBe(true);
    expect(span.includes("Tweaks")).toBe(true);
  });
});
