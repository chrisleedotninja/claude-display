import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

// Tests for chore [073]: header strip title + cyan rule glyph.
// Pattern follows test/dashboard-header-stats-render.test.js — bun:test +
// createServer + fetch against the served /app.js and /styles.css, then
// substring-assert on the response body.

describe("HeaderStrip title + accent (chore 073)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("title body literal — served /app.js HeaderStrip contains 'claude code · mission board'", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(body.includes("claude code · mission board")).toBe(true);
  });

  it("accent glyph span — served /app.js has a ms-head-title-accent span containing ▍ inside the title span", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // The accent class is present.
    expect(body.includes("ms-head-title-accent")).toBe(true);
    // The rule glyph literal is present.
    expect(body.includes("▍")).toBe(true);
    // The accent span sits inside the .ms-head-title span, immediately before
    // a single space and then the body literal — capture the structural shape.
    const titleSpanStart = body.indexOf('class="ms-head-title"');
    expect(titleSpanStart).toBeGreaterThanOrEqual(0);
    const titleBlock = body.slice(titleSpanStart, titleSpanStart + 400);
    // Inside that block, the accent span appears, then a space, then the body
    // literal. We assert the nested-accent → space → literal ordering.
    const accentIdx = titleBlock.indexOf('class="ms-head-title-accent"');
    const glyphIdx = titleBlock.indexOf("▍");
    const bodyIdx = titleBlock.indexOf("claude code · mission board");
    expect(accentIdx).toBeGreaterThanOrEqual(0);
    expect(glyphIdx).toBeGreaterThan(accentIdx);
    expect(bodyIdx).toBeGreaterThan(glyphIdx);
  });

  it("accent cyan rule — served /styles.css has .ms-head-title-accent { color: var(--tn-cyan) }", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    const body = await res.text();
    // Find the selector.
    const selectorIdx = body.indexOf(".ms-head-title-accent");
    expect(selectorIdx).toBeGreaterThanOrEqual(0);
    // Slice the rule's declaration block — find next "{" and "}" after the
    // selector and assert color: var(--tn-cyan) sits inside.
    const openBrace = body.indexOf("{", selectorIdx);
    const closeBrace = body.indexOf("}", openBrace);
    expect(openBrace).toBeGreaterThan(selectorIdx);
    expect(closeBrace).toBeGreaterThan(openBrace);
    const block = body.slice(openBrace, closeBrace);
    expect(block.includes("color: var(--tn-cyan)")).toBe(true);
  });

  it("title body muted — served /styles.css .ms-head-title rule contains color: var(--tn-muted)", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    const body = await res.text();
    // Locate the .ms-head-title selector. Be careful to match the exact
    // selector — not .ms-head-title-accent — by requiring the next character
    // after the selector to be whitespace or '{'.
    let searchFrom = 0;
    let selectorIdx = -1;
    while (true) {
      const idx = body.indexOf(".ms-head-title", searchFrom);
      if (idx < 0) break;
      const nextChar = body[idx + ".ms-head-title".length];
      if (nextChar === " " || nextChar === "\n" || nextChar === "\t" || nextChar === "{") {
        selectorIdx = idx;
        break;
      }
      searchFrom = idx + 1;
    }
    expect(selectorIdx).toBeGreaterThanOrEqual(0);
    const openBrace = body.indexOf("{", selectorIdx);
    const closeBrace = body.indexOf("}", openBrace);
    expect(openBrace).toBeGreaterThan(selectorIdx);
    expect(closeBrace).toBeGreaterThan(openBrace);
    const block = body.slice(openBrace, closeBrace);
    expect(block.includes("color: var(--tn-muted)")).toBe(true);
  });

  it("preserves class names and clock — served /app.js HeaderStrip retains stable hooks", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // Locate the HeaderStrip function body. The next "function statsFromCards"
    // / "export function statsFromCards" marker bounds the HeaderStrip render
    // block conservatively.
    const startIdx = body.indexOf("function HeaderStrip");
    expect(startIdx).toBeGreaterThanOrEqual(0);
    const endIdx = body.indexOf("statsFromCards", startIdx + 1);
    expect(endIdx).toBeGreaterThan(startIdx);
    const headerBlock = body.slice(startIdx, endIdx);
    expect(headerBlock.includes("ms-head")).toBe(true);
    expect(headerBlock.includes("ms-head-title")).toBe(true);
    expect(headerBlock.includes("ms-head-clock")).toBe(true);
    expect(headerBlock.includes("formatClock(now)")).toBe(true);
  });
});
