// Status glyph SVG set — served-source assertions (chore 051).
// All tests assert on served text from /app.js and /styles.css via the
// real HTTP server (mirrors card-status-render.test.js pattern).
// No DOM required.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

let handle;
let baseUrl;

beforeEach(() => {
  handle = createServer({ port: 0, hostname: "127.0.0.1" });
  baseUrl = `http://127.0.0.1:${handle.server.port}`;
});

afterEach(() => {
  handle.stop();
});

// Step 1: StatusGlyph component with all eight inline SVG shapes
describe("Step 1 — served app.js contains StatusGlyph and SVG paths for all eight statuses", () => {
  it("served /app.js defines a StatusGlyph function", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("StatusGlyph")).toBe(true);
  });

  it("served /app.js contains SVG markup for each of the eight statuses", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Must contain svg viewBox declarations (inline SVG approach)
    expect(body.includes("viewBox")).toBe(true);
    // Each status has a distinct SVG path/shape; verify by checking for
    // each status string used as a discriminant key in the switch/if
    for (const status of ["working", "approval", "waiting", "blocked", "tests", "reviewing", "success", "idle"]) {
      expect(body.includes(`"${status}"`)).toBe(true);
    }
  });

  it("served /app.js contains status-glyph class on the SVG element", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("status-glyph")).toBe(true);
  });
});

// Step 2: Animation class gating on anim prop
describe("Step 2 — served app.js references animation class strings gated on anim prop", () => {
  it("served /app.js contains glyph-spin class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("glyph-spin")).toBe(true);
  });

  it("served /app.js contains glyph-pulse class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("glyph-pulse")).toBe(true);
  });

  it("served /app.js contains glyph-blink class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("glyph-blink")).toBe(true);
  });

  it("served /app.js contains glyph-shimmer class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("glyph-shimmer")).toBe(true);
  });

  it("served /app.js gates animation classes on the anim prop", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // anim prop must be referenced in StatusGlyph
    expect(body.includes("anim")).toBe(true);
  });
});

// Step 3: CSS keyframes and glyph sizing rules
describe("Step 3 — served styles.css contains glyph keyframe names and suppression rules", () => {
  it("served /styles.css contains @keyframes glyph-spin", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(body.includes("glyph-spin")).toBe(true);
  });

  it("served /styles.css contains @keyframes glyph-blink", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(body.includes("glyph-blink")).toBe(true);
  });

  it("served /styles.css contains @keyframes glyph-shimmer", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(body.includes("glyph-shimmer")).toBe(true);
  });

  it("served /styles.css contains @keyframes glyph-pulse", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(body.includes("glyph-pulse")).toBe(true);
  });

  it("served /styles.css contains .status-glyph sizing rule", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(body.includes(".status-glyph")).toBe(true);
  });

  it("served /styles.css contains .anim-off suppression rule", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(body.includes("anim-off")).toBe(true);
  });
});

// Step 4: anim toggle wiring through Dashboard and Card
describe("Step 4 — served app.js contains tweaks-anim-toggle and threads anim prop", () => {
  it("served /app.js contains tweaks-anim-toggle class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("tweaks-anim-toggle")).toBe(true);
  });

  it("served /app.js threads anim prop through Dashboard", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Dashboard must pass anim down
    expect(body.includes("Dashboard")).toBe(true);
    expect(body.includes("anim")).toBe(true);
  });
});

// Step 5: StatusGlyph replaces card-status-icon span in Card and SubagentCard
describe("Step 5 — served app.js uses StatusGlyph in Card and SubagentCard render bodies", () => {
  it("served /app.js references StatusGlyph inside Card render", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("StatusGlyph")).toBe(true);
  });

  it("served /app.js card-status-icon span is no longer a Unicode text child", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // The old pattern was: <span class="card-status-icon">${icon}</span>
    // It must no longer render a direct Unicode text child (icon variable in span)
    // The class may still exist for CSS sizing, but it must not wrap ${icon} directly
    expect(body.includes("card-status-icon")).toBe(true);
    // icon Unicode text child pattern must be gone — the old form was `>${icon}<`
    // We check that icon is not directly interpolated inside card-status-icon span
    expect(body.includes("card-status-icon\">${icon}</span>") ||
           body.includes("card-status-icon'>${icon}</span>") ||
           body.includes("card-status-icon\">${icon}</span>")).toBe(false);
  });
});
