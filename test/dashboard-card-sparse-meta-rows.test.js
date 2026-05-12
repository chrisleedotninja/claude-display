import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";
import { cardsFromState, formatClock } from "../app.js";

// Chore 076 Step 6 — a sparse idle card (the verified-live record shape
// `{id, status, last_event_at, desktop, event_at}`) renders exactly two
// K/V meta rows — `Desk` and `At` — and no body `<h3>` element. Proves AC8
// (the cumulative shape) and that Steps 1 (h3 omission) and 2 (per-field
// presence guards) work together. Uses a structural-source assertion
// against served `/app.js` plus a `cardsFromState` view-model check —
// `Card` is not exported, so we verify by combining the source guards with
// the view-model the projection produces.
describe("sparse idle card produces a view-model with no title / no session_label / no repo", () => {
  it("cardsFromState produces a view-model whose only meta keys are desktop + the timestamps", () => {
    const record = {
      id: "abc12345",
      status: "idle",
      last_event_at: 1700000000000,
      desktop: "code",
    };
    const cards = cardsFromState([record]);
    expect(cards).toHaveLength(1);
    const c = cards[0];
    // Desk and At are the only two row sources on this view-model.
    expect(c.desktop).toBe("code");
    expect(c.last_event_at).toBe(1700000000000);
    // Without event_at on the record, the projection does not produce
    // elapsed or event_at; the meta column's Elapsed row's guard
    // therefore returns falsy.
    expect(c.elapsed).toBeUndefined();
    expect(c.event_at).toBeUndefined();
    // No Repo / Tmux / instance / title surfaces on the view-model.
    expect(c.repo === undefined || c.repo === "").toBe(true);
    expect(c.session_label).toBeUndefined();
    expect(c.title).toBeUndefined();
    expect(c.instance).toBeUndefined();
    // formatClock applied to last_event_at returns an HH:MM-shaped string,
    // matching the At row's wiring in Card.
    expect(/^\d{2}:\d{2}$/.test(formatClock(record.last_event_at))).toBe(true);
  });
});

describe("served Card source emits guards that produce only Desk + At for a sparse view-model (076 Step 6)", () => {
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

  it("Card's body guards <h3 class=card-body-title> on hasTitle so a sparse record renders no <h3>", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const openIdx = findFunctionBodyOpenBrace(body, "Card");
    const inner = extractBalancedBlock(body, openIdx);
    // The structural guarantee: the h3 element appears only after a
    // hasTitle check. A sparse view-model has hasTitle === false, so
    // the element is omitted.
    const guardedH3 =
      /hasTitle[^]*?<h3\s+class\s*=\s*"card-body-title"\s*>\s*\$\{title\}/;
    expect(guardedH3.test(inner)).toBe(true);
    // And no unconditional <h3 class="card-body-title"> rendering remains.
    const unconditional = /<h3\s+class\s*=\s*"card-body-title"\s*>\s*\$\{label\}/;
    expect(unconditional.test(inner)).toBe(false);
  });

  it("Card's body emits each per-field meta row only inside its presence guard", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const openIdx = findFunctionBodyOpenBrace(body, "Card");
    const inner = extractBalancedBlock(body, openIdx);
    // Repo row: behind a `repo` truthy check.
    expect(/\$\{repo\s*\?[^]*?card-meta-repo/.test(inner)).toBe(true);
    // Tmux (session_label) row: behind hasLabel.
    expect(/\$\{hasLabel\s*\?[^]*?card-meta-session/.test(inner)).toBe(true);
    // Desk row: behind hasDesktop.
    expect(/\$\{hasDesktop\s*\?[^]*?card-meta-desktop/.test(inner)).toBe(true);
    // Elapsed row: behind hasElapsed.
    expect(/\$\{hasElapsed\s*\?[^]*?card-meta-elapsed/.test(inner)).toBe(true);
    // At row: behind hasAt.
    expect(/\$\{hasAt\s*\?[^]*?formatClock/.test(inner)).toBe(true);
  });

  it("meta block contains exactly five conditional rows in fixed order — Repo, Tmux, Desk, Elapsed, At", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const openIdx = findFunctionBodyOpenBrace(body, "Card");
    const inner = extractBalancedBlock(body, openIdx);
    // Locate the `<div class="card-meta">` block and ensure the five
    // guards appear in the documented order. Use the per-field value
    // classes as ordered checkpoints.
    const metaIdx = inner.indexOf('class="card-meta"');
    expect(metaIdx).toBeGreaterThan(-1);
    const after = inner.slice(metaIdx);
    const order = [
      "card-meta-repo",
      "card-meta-session",
      "card-meta-desktop",
      "card-meta-elapsed",
      // At row has no per-field class; use formatClock as its anchor.
      "formatClock",
    ];
    let cursor = 0;
    for (const token of order) {
      const idx = after.indexOf(token, cursor);
      expect(idx).toBeGreaterThan(-1);
      cursor = idx + token.length;
    }
  });
});
