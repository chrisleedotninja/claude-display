import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

// Chore 078 — body needs pill uses --accent-bg surface.
// All assertions in this file run against the served source (no JSDOM,
// no getComputedStyle), mirroring test/dashboard-card-needs-tag.test.js
// and test/card-status-render.test.js. Each behavior step in chore.md
// adds one describe-block here.

describe("Card root inline-styles --accent-bg from the tone of the card's status (step 1)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("parent card root inline-styles --accent-bg from a tone-derived --c-<tone>-bg expression", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();

    // (a) app.js imports toneForStatus from ./status-tones.js.
    expect(
      body.includes('from "./status-tones.js"') ||
        body.includes("from './status-tones.js'"),
    ).toBe(true);
    expect(body.includes("toneForStatus")).toBe(true);

    // (b) served body contains the literal substring `--accent-bg`.
    expect(body.includes("--accent-bg")).toBe(true);

    // (c) served body contains a --c-${...tone...}-bg interpolation, or the
    // function call `toneForStatus(...)` appears upstream of a `--c-` ... `-bg`
    // template expression. Either form satisfies the "tone-derived" wiring.
    const interp = /--c-\$\{[^}]*tone[^}]*\}-bg/;
    const callThenC = /toneForStatus\([^)]*\)[\s\S]*?--c-/;
    expect(interp.test(body) || callThenC.test(body)).toBe(true);

    // (d) regression guard — the existing --accent: declaration is still
    // present alongside (AC1's "both" requirement).
    expect(body.includes("--accent:")).toBe(true);
  });
});

describe("base .card-needs-pill rule's background resolves to var(--accent-bg) (step 2)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("base .card-needs-pill background resolves to var(--accent-bg)", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();

    // Match the base .card-needs-pill rule (selector NOT followed by `[` or
    // `-`, i.e. not a per-need attribute selector and not a sibling like
    // .card-needs-pill-foo). Same shape as the base-rule regex in
    // test/dashboard-card-needs-tag.test.js.
    const re = /\.card-needs-pill(?!\[|-)\s*\{([^}]*)\}/g;
    const blocks = [];
    let m;
    while ((m = re.exec(body)) !== null) blocks.push(m[1]);
    expect(blocks.length).toBeGreaterThan(0);

    // At least one base block declares a `background` whose value contains
    // `var(--accent-bg` — AC2 in source form.
    const declRe = /background\s*:\s*[^;]*var\(\s*--accent-bg/;
    const anyHasAccentBg = blocks.some((b) => declRe.test(b));
    expect(anyHasAccentBg).toBe(true);
  });
});

describe("per-need attribute selectors drop background and preserve color (step 3)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  const SEVEN_KEYS = [
    "approve-tool",
    "answer-question",
    "provide-input",
    "pick-option",
    "confirm-destructive",
    "resolve-conflict",
    "review-diff",
  ];

  for (const key of SEVEN_KEYS) {
    it(`per-need attribute selectors drop background and preserve color (${key})`, async () => {
      const body = await (await fetch(`${baseUrl}/styles.css`)).text();
      const escapedKey = key.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const re = new RegExp(
        `\\.card-needs-pill\\[\\s*data-need\\s*=\\s*["']${escapedKey}["']\\s*\\]\\s*\\{([^}]*)\\}`,
        "g",
      );
      let perBlock = null;
      let m;
      while ((m = re.exec(body)) !== null) {
        perBlock = m[1];
        break;
      }
      expect(perBlock).not.toBeNull();

      // (a) The per-need block does NOT declare `background`. Match
      // `background:` as a property — followed by a colon, not inside another
      // identifier like `background-color`.
      const hasBackground = /(^|[\s;])background\s*:/.test(perBlock);
      expect(hasBackground).toBe(false);

      // (b) The per-need block still declares `color` with a non-empty value.
      const colorMatch = /(?:^|[\s;])color\s*:\s*([^;]+);?/.exec(perBlock);
      expect(colorMatch).not.toBeNull();
      expect(colorMatch[1].trim().length).toBeGreaterThan(0);
    });
  }
});

describe("subagent .sub-needs rule preserves var(--sub-bg) background (step 4)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("subagent .sub-needs rule preserves var(--sub-bg) background", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();

    // Match the `.sub-needs` rule (not followed by `-` so we don't catch a
    // sibling class). Mirrors the base-rule regex shape used above.
    const re = /\.sub-needs(?!\[|-)\s*\{([^}]*)\}/g;
    const blocks = [];
    let m;
    while ((m = re.exec(body)) !== null) blocks.push(m[1]);
    expect(blocks.length).toBeGreaterThan(0);

    // At least one block declares `background: var(--sub-bg, …)` — AC4 lock.
    const declRe = /background\s*:\s*[^;]*var\(\s*--sub-bg/;
    const anyHasSubBg = blocks.some((b) => declRe.test(b));
    expect(anyHasSubBg).toBe(true);
  });
});
