import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { STATUS_TOKENS } from "../status-tokens.js";
import { createServer } from "../server.js";

describe("Card rail renders a status label inside the rail next to the chip", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js contains the literal class name card-rail-label", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("card-rail-label")).toBe(true);
  });

  it("served /app.js still contains the literal class name card-rail-chip (existing chip preserved)", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("card-rail-chip")).toBe(true);
  });

  it("served /app.js has card-rail-label appear inside the card-rail wrapper (rail comes before label)", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(/card-rail[^]*?card-rail-label/.test(body)).toBe(true);
  });

  it("served /app.js applies an uppercasing operator to the label source near the rail-label class", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // The new class name and the toUpperCase call must appear together in
    // the rail-label render path (AC2 requires JS-level uppercase equality,
    // not just text-transform).
    const sameRegion =
      /card-rail-label[^]*?toUpperCase|toUpperCase[^]*?card-rail-label/;
    expect(sameRegion.test(body)).toBe(true);
  });

  it("served /app.js does not gate card-rail-label on any operator-authored field", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Any of these identifiers appearing within ~80 chars before
    // card-rail-label would indicate the rail-label is conditional on an
    // operator-authored field — AC6 forbids this.
    const guarded =
      /(instance|title|detail|session_label|desktop|repo|branch|elapsed)[^a-zA-Z_].{0,80}card-rail-label/;
    expect(guarded.test(body)).toBe(false);
  });

  it("STATUS_TOKENS labels uppercased match the spec's enumerated eight values", () => {
    const expected = {
      approval: "APPROVAL",
      waiting: "WAITING",
      blocked: "BLOCKED",
      working: "WORKING",
      tests: "TESTS",
      reviewing: "REVIEW",
      success: "SUCCESS",
      idle: "IDLE",
    };
    for (const [key, want] of Object.entries(expected)) {
      expect(STATUS_TOKENS[key].label.toUpperCase()).toBe(want);
    }
  });
});

describe("styles.css lays out .card-rail as a column with chip top / label bottom", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  // Helper: extract the declaration body of the first `.card-rail { ... }`
  // rule (selector must be exactly `.card-rail`, not `.card-rail-label` or
  // `.card-rail-chip`). Strips CSS /* */ comments from the selector text
  // before comparing so adjacent banner comments don't pollute the match.
  function extractCardRailBody(css) {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const blockRe = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = blockRe.exec(stripped)) !== null) {
      const selector = m[1].trim();
      if (selector.startsWith("@")) continue;
      // Match selectors that target .card-rail directly (not extended forms).
      // We split on commas in case .card-rail is grouped with siblings.
      const parts = selector.split(",").map((s) => s.trim());
      if (parts.includes(".card-rail")) return m[2];
    }
    return null;
  }

  it(".card-rail rule body declares flex-direction: column", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const decls = extractCardRailBody(body);
    expect(decls).not.toBeNull();
    expect(/flex-direction\s*:\s*column/.test(decls)).toBe(true);
  });

  it(".card-rail rule body declares justify-content: space-between", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const decls = extractCardRailBody(body);
    expect(decls).not.toBeNull();
    expect(/justify-content\s*:\s*space-between/.test(decls)).toBe(true);
  });

  it(".card-rail rule body no longer declares align-items: flex-start (old centered-glyph layout retired)", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const decls = extractCardRailBody(body);
    expect(decls).not.toBeNull();
    expect(/align-items\s*:\s*flex-start/.test(decls)).toBe(false);
  });

  it(".card grid still declares grid-template-columns: 88px 1fr 240px (rail column-fill preserved)", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(body.includes("grid-template-columns: 88px 1fr 240px")).toBe(true);
  });
});

describe("styles.css gives .card-rail-label the spec'd mono uppercase typography", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  // Helper: extract the declaration body of the first rule whose selector
  // list contains `.card-rail-label`. Strips comments first.
  function extractCardRailLabelBody(css) {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const blockRe = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = blockRe.exec(stripped)) !== null) {
      const selector = m[1].trim();
      if (selector.startsWith("@")) continue;
      const parts = selector.split(",").map((s) => s.trim());
      if (parts.includes(".card-rail-label")) return m[2];
    }
    return null;
  }

  it("contains a .card-rail-label rule", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const decls = extractCardRailLabelBody(body);
    expect(decls).not.toBeNull();
  });

  it(".card-rail-label declares font-family: var(--font-mono)", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const decls = extractCardRailLabelBody(body);
    expect(decls).not.toBeNull();
    expect(/font-family\s*:\s*var\(--font-mono\)/.test(decls)).toBe(true);
  });

  it(".card-rail-label declares font-size: 10px", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const decls = extractCardRailLabelBody(body);
    expect(decls).not.toBeNull();
    expect(/font-size\s*:\s*10px/.test(decls)).toBe(true);
  });

  it(".card-rail-label declares letter-spacing: 0.08em", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const decls = extractCardRailLabelBody(body);
    expect(decls).not.toBeNull();
    expect(/letter-spacing\s*:\s*0\.08em/.test(decls)).toBe(true);
  });

  it(".card-rail-label declares text-transform: uppercase", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const decls = extractCardRailLabelBody(body);
    expect(decls).not.toBeNull();
    expect(/text-transform\s*:\s*uppercase/.test(decls)).toBe(true);
  });

  it(".card-rail-label declares font-weight: 700", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const decls = extractCardRailLabelBody(body);
    expect(decls).not.toBeNull();
    expect(/font-weight\s*:\s*700/.test(decls)).toBe(true);
  });

  it(".card-rail-label declares color: var(--tn-bg-darker)", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const decls = extractCardRailLabelBody(body);
    expect(decls).not.toBeNull();
    expect(/color\s*:\s*var\(--tn-bg-darker\)/.test(decls)).toBe(true);
  });
});
