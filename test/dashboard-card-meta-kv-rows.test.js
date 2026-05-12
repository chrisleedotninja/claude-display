import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

// Chore 076 Step 2 + Step 3 — the meta column emits K/V rows in fixed
// `Repo`, `Tmux`, `Desk`, `Elapsed`, `At` order. Each row carries a
// `.card-meta-k` key element with the label literal and a `.card-meta-v`
// value element with the field value. The `At` row reflects
// `formatClock(event_at)` with `last_event_at` fallback.
describe("served Card source emits K/V meta rows in fixed order (076 Step 2)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

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

  it("served /app.js source contains the card-meta-k and card-meta-v class names", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("card-meta-k")).toBe(true);
    expect(body.includes("card-meta-v")).toBe(true);
  });

  it("Card's body emits a card-meta-k key element preceding each per-field value class", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const openIdx = findFunctionBodyOpenBrace(body, "Card");
    expect(openIdx).toBeGreaterThan(-1);
    const inner = extractBalancedBlock(body, openIdx);
    expect(inner).not.toBeNull();

    // For each of the four guarded fields, the served source should show
    // a `card-meta-k` span literal before the corresponding `card-meta-v`
    // value span (which still carries its per-field class so existing
    // served-source / styles-source tests find the per-field class).
    for (const valueClass of [
      "card-meta-repo",
      "card-meta-session",
      "card-meta-desktop",
      "card-meta-elapsed",
    ]) {
      const re = new RegExp(`card-meta-k[^]*?card-meta-v[^]*?${valueClass}`);
      expect(re.test(inner)).toBe(true);
    }
  });

  it("Card's body emits the five fixed-order key labels (Repo, Tmux, Desk, Elapsed, At)", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const openIdx = findFunctionBodyOpenBrace(body, "Card");
    const inner = extractBalancedBlock(body, openIdx);
    // The label literal may be either the title-case form ("Repo") or the
    // uppercased form ("REPO"); the CSS rule applies text-transform: uppercase
    // already, so either form satisfies AC4. The order in the served source
    // must match Repo → Tmux → Desk → Elapsed → At.
    const labels = ["Repo", "Tmux", "Desk", "Elapsed", "At"];
    let cursor = 0;
    for (const label of labels) {
      const idxLower = inner.indexOf(label, cursor);
      const idxUpper = inner.indexOf(label.toUpperCase(), cursor);
      const hits = [idxLower, idxUpper].filter((x) => x !== -1);
      expect(hits.length).toBeGreaterThan(0);
      cursor = Math.min(...hits) + label.length;
    }
  });

  it("Card's body no longer mentions card-meta-instance or card-meta-title inside the meta column", async () => {
    // Sister check for the Step 4 removal — by the time Step 2 lands the
    // meta column has been rewritten to K/V rows; the new rows do not
    // include `instance` or `title`, so the per-field class strings for
    // those two fields must be absent from Card's body. (Both moved out:
    // `title` to the body <h3>, `instance` to the head row via sibling
    // chore 075.)
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const openIdx = findFunctionBodyOpenBrace(body, "Card");
    const inner = extractBalancedBlock(body, openIdx);
    expect(inner.includes("card-meta-instance")).toBe(false);
    expect(inner.includes("card-meta-title")).toBe(false);
  });
});

describe("At row reflects formatClock(event_at) with last_event_at fallback (076 Step 3)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

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

  it("Card's body wires the At row value to formatClock(...) of event_at (or last_event_at fallback)", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const openIdx = findFunctionBodyOpenBrace(body, "Card");
    const inner = extractBalancedBlock(body, openIdx);
    // The At row must invoke formatClock on a value derived from event_at,
    // and the source must reference last_event_at (the fallback). Both
    // identifiers must appear in the same expression.
    expect(/formatClock\s*\(/.test(inner)).toBe(true);
    expect(inner.includes("event_at")).toBe(true);
    expect(inner.includes("last_event_at")).toBe(true);
  });

  it("Card's body guards the At row on the presence of event_at or last_event_at", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const openIdx = findFunctionBodyOpenBrace(body, "Card");
    const inner = extractBalancedBlock(body, openIdx);
    // A `hasAt` (or equivalent) guard must appear before the "At" label so
    // the row is omitted entirely when neither event_at nor last_event_at
    // is present on the record.
    // We accept any boolean-derivation form: hasAt, hasAtTime, atSource,
    // etc. — the structural requirement is just that the literal "At"
    // appears inside a ternary or `&&` expression in the meta block.
    // A practical proxy: there's a "card-meta-v" value span paired with
    // an "At" key (rendered as text content between tags or as a quoted
    // literal), and the value interpolates `formatClock(...)` in the same
    // neighbourhood. Accept both title-case (`At`) and upper-case (`AT`)
    // forms — the CSS rule applies `text-transform: uppercase` to keys.
    const atTextRe = />\s*At\s*<[^]*?card-meta-v[^]*?formatClock/;
    const atUpperTextRe = />\s*AT\s*<[^]*?card-meta-v[^]*?formatClock/;
    const atQuotedRe = /["']At["'][^]*?card-meta-v[^]*?formatClock/;
    const atUpperQuotedRe = /["']AT["'][^]*?card-meta-v[^]*?formatClock/;
    expect(
      atTextRe.test(inner) ||
        atUpperTextRe.test(inner) ||
        atQuotedRe.test(inner) ||
        atUpperQuotedRe.test(inner),
    ).toBe(true);
  });
});
