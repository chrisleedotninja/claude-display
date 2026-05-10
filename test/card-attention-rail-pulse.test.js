import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  STATUS_TOKENS,
  ATTENTION_STATUSES,
  isAttentionStatus,
} from "../status-tokens.js";
import { createServer } from "../server.js";

describe("ATTENTION_STATUSES set and isAttentionStatus predicate", () => {
  it("ATTENTION_STATUSES contains exactly approval, waiting, blocked", () => {
    const keys = [...ATTENTION_STATUSES].sort();
    expect(keys).toEqual(["approval", "blocked", "waiting"]);
  });

  it("ATTENTION_STATUSES is frozen", () => {
    expect(Object.isFrozen(ATTENTION_STATUSES)).toBe(true);
  });

  it("isAttentionStatus returns true for each of approval, waiting, blocked", () => {
    expect(isAttentionStatus("approval")).toBe(true);
    expect(isAttentionStatus("waiting")).toBe(true);
    expect(isAttentionStatus("blocked")).toBe(true);
  });

  it("isAttentionStatus returns false for the five non-attention allow-list statuses", () => {
    expect(isAttentionStatus("working")).toBe(false);
    expect(isAttentionStatus("tests")).toBe(false);
    expect(isAttentionStatus("reviewing")).toBe(false);
    expect(isAttentionStatus("success")).toBe(false);
    expect(isAttentionStatus("idle")).toBe(false);
  });

  it("isAttentionStatus returns false for unknown / non-string / undefined / null inputs", () => {
    expect(isAttentionStatus("not-a-status")).toBe(false);
    expect(isAttentionStatus("")).toBe(false);
    expect(isAttentionStatus(undefined)).toBe(false);
    expect(isAttentionStatus(null)).toBe(false);
    expect(isAttentionStatus(42)).toBe(false);
  });
});

describe("served /app.js Card adds is-attention class only for attention statuses", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js imports isAttentionStatus from ./status-tokens.js", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(
      body.includes('from "./status-tokens.js"') ||
        body.includes("from './status-tokens.js'"),
    ).toBe(true);
    expect(body.includes("isAttentionStatus")).toBe(true);
  });

  it("served /app.js mentions the is-attention class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("is-attention")).toBe(true);
  });

  it("served /app.js does not hard-code the three attention status keys as a literal list in markup", async () => {
    // Belt-and-braces: the conditional class should reuse isAttentionStatus,
    // not restate the three status keys as a sibling literal in the JSX.
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Reject any literal that lists all three attention keys consecutively
    // separated by JSON-array syntax in the Card source.
    expect(
      /\["approval"\s*,\s*"waiting"\s*,\s*"blocked"\]/.test(body) ||
        /\['approval'\s*,\s*'waiting'\s*,\s*'blocked'\]/.test(body),
    ).toBe(false);
  });
});

describe("served /styles.css renders rail in per-status color on .card.is-attention", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("contains a .card.is-attention rule whose declaration block references var(--card-status-color)", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    // Find a .card.is-attention rule (opening brace) and assert its block
    // (up to the matching closing brace) mentions var(--card-status-color).
    const re = /\.card\.is-attention\s*\{([^}]*)\}/g;
    const blocks = [];
    let m;
    while ((m = re.exec(body)) !== null) blocks.push(m[1]);
    expect(blocks.length).toBeGreaterThan(0);
    const anyHasColor = blocks.some((b) => b.includes("var(--card-status-color)"));
    expect(anyHasColor).toBe(true);
  });

  it("every occurrence of the word `rail` sits inside a .card.is-attention rule block", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    // Strategy: collect ranges of every .card.is-attention { ... } block,
    // then every match of /rail/ must fall inside at least one block.
    const ranges = [];
    const blockRe = /\.card\.is-attention\s*\{[^}]*\}/g;
    let bm;
    while ((bm = blockRe.exec(body)) !== null) {
      ranges.push([bm.index, bm.index + bm[0].length]);
    }
    expect(ranges.length).toBeGreaterThan(0);
    const railRe = /rail/gi;
    let rm;
    while ((rm = railRe.exec(body)) !== null) {
      const inside = ranges.some(([s, e]) => rm.index >= s && rm.index < e);
      expect(inside).toBe(true);
    }
  });
});

describe("served /styles.css carries a continuous pulse on .card.is-attention", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("declares an @keyframes rule and an animation: declaration scoped to .card.is-attention", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(/@keyframes\s+\S+\s*\{/.test(body)).toBe(true);
    // Find a .card.is-attention block that contains an `animation:` shorthand.
    const re = /\.card\.is-attention\s*\{([^}]*)\}/g;
    const blocks = [];
    let m;
    while ((m = re.exec(body)) !== null) blocks.push(m[1]);
    const animBlock = blocks.find((b) => /\banimation\s*:/.test(b));
    expect(animBlock).toBeDefined();
  });

  it("the animation on .card.is-attention is infinite", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const re = /\.card\.is-attention\s*\{([^}]*)\}/g;
    let foundInfinite = false;
    let m;
    while ((m = re.exec(body)) !== null) {
      const animMatch = m[1].match(/\banimation\s*:[^;]*;/);
      if (animMatch && /\binfinite\b/.test(animMatch[0])) {
        foundInfinite = true;
      }
    }
    expect(foundInfinite).toBe(true);
  });

  it("the animation duration is between 1.2s and 4s (subtle, not strobing)", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const re = /\.card\.is-attention\s*\{([^}]*)\}/g;
    let durationSeconds = null;
    let m;
    while ((m = re.exec(body)) !== null) {
      const animMatch = m[1].match(/\banimation\s*:[^;]*;/);
      if (!animMatch) continue;
      // Parse the first time value (Ns or Nms) in the shorthand.
      const tMatch = animMatch[0].match(/(\d+(?:\.\d+)?)(ms|s)\b/);
      if (!tMatch) continue;
      const value = parseFloat(tMatch[1]);
      durationSeconds = tMatch[2] === "ms" ? value / 1000 : value;
      break;
    }
    expect(durationSeconds).not.toBeNull();
    expect(durationSeconds).toBeGreaterThanOrEqual(1.2);
    expect(durationSeconds).toBeLessThanOrEqual(4);
  });
});

describe("non-attention cards never render a rail and never pulse (negative)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js has no unconditional 'card is-attention' literal", async () => {
    // The conditional class string is OK ("card is-attention" only assigned
    // when isAttentionStatus(status) is true). Reject only an unconditional
    // assignment: the literal string "card is-attention" must not appear in
    // a JSX-style class attribute that is not inside an isAttentionStatus
    // ternary or conditional. The defensible string-match: app.js must
    // mention isAttentionStatus on the same line or near the line that emits
    // the class string.
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("is-attention")).toBe(true);
    // Reject hard-coded class="card is-attention" or class='card is-attention'
    expect(/class\s*=\s*["']card\s+is-attention["']/.test(body)).toBe(false);
  });

  it("served /styles.css has no rule that targets .card without .is-attention and mentions animation", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    // Walk every CSS rule { ... } block. For each, look at its selector list
    // (the substring between the previous `}` (or start) and the `{`). If the
    // selector contains `.card` but not `.is-attention`, the block must not
    // mention `animation` or `rail`.
    const blockRe = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = blockRe.exec(body)) !== null) {
      const selector = m[1].trim();
      const decls = m[2];
      // Skip @-rules whose "selector" is an at-rule (e.g. @media, @keyframes).
      if (selector.startsWith("@")) continue;
      // Skip rules that don't target .card at all.
      if (!/\.card\b/.test(selector)) continue;
      // Rules scoped to .card.is-attention are allowed to carry rail/animation.
      if (selector.includes(".is-attention")) continue;
      // For any other .card-targeting rule: forbid animation and rail.
      expect(/\banimation\b/.test(decls)).toBe(false);
      expect(/rail/i.test(decls)).toBe(false);
    }
  });

  it("served /styles.css has no @keyframes rule outside the attention-pulse name", async () => {
    // Sanity: the only @keyframes shipped by this slice is the pulse keyframes.
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const names = [];
    const re = /@keyframes\s+([\w-]+)\s*\{/g;
    let m;
    while ((m = re.exec(body)) !== null) names.push(m[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      // every shipped @keyframes is named for attention/pulse purpose
      expect(/(attention|pulse)/i.test(n)).toBe(true);
    }
  });
});
