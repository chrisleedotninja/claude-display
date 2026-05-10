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
