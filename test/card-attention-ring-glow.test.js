import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

// Helper: extract the inner body of the @media (prefers-reduced-motion: reduce)
// block by walking characters to find the matching closing brace.
function extractReducedMotionBody(css) {
  const startRe = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{/i;
  const startMatch = css.match(startRe);
  if (!startMatch) return null;
  const start = startMatch.index + startMatch[0].length;
  let depth = 1;
  for (let i = start; i < css.length; i++) {
    const c = css[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return css.slice(start, i);
    }
  }
  return null;
}

describe("attention cards carry ring+glow box-shadow, not left-border pulse", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it(".card.is-attention rule carries a box-shadow ring+glow declaration", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    // Find all .card.is-attention rule blocks
    const re = /\.card\.is-attention\s*\{([^}]*)\}/g;
    const blocks = [];
    let m;
    while ((m = re.exec(body)) !== null) blocks.push(m[1]);
    expect(blocks.length).toBeGreaterThan(0);
    const anyHasBoxShadow = blocks.some((b) => /\bbox-shadow\s*:/.test(b));
    expect(anyHasBoxShadow).toBe(true);
  });

  it(".card.is-attention rule does NOT carry a border-left rail declaration", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const re = /\.card\.is-attention\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const decls = m[1];
      // .card.is-attention must not declare border-left
      expect(/\bborder-left\s*:/.test(decls)).toBe(false);
    }
  });

  it(".card.is-attention rule does NOT carry an animation: shorthand", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const re = /\.card\.is-attention\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const decls = m[1];
      expect(/\banimation\s*:/.test(decls)).toBe(false);
    }
  });

  it("there is no @keyframes attention-pulse rule in styles.css", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(/@keyframes\s+attention-pulse\b/.test(body)).toBe(false);
  });

  it("the prefers-reduced-motion block resets box-shadow to none on .card.is-attention", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const inner = extractReducedMotionBody(body);
    expect(inner).not.toBeNull();
    // Must contain a .card.is-attention rule whose box-shadow is none
    const ruleRe = /\.card\.is-attention\s*\{([^}]*)\}/g;
    let nuked = false;
    let m;
    while ((m = ruleRe.exec(inner)) !== null) {
      if (/\bbox-shadow\s*:\s*none\b/.test(m[1])) {
        nuked = true;
      }
    }
    expect(nuked).toBe(true);
  });
});
