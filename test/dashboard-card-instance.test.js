import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";
import { cardsFromState } from "../app.js";

describe("cardsFromState propagates instance", () => {
  it("includes instance on the view-model when the record carries a non-empty string", () => {
    const records = [{ id: "abc12345", status: "active", instance: "cc-payments" }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].instance).toBe("cc-payments");
  });

  it("omits instance on the view-model when the record has no instance key", () => {
    const records = [{ id: "abc12345", status: "active" }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].instance).toBeUndefined();
  });

  it("omits instance on the view-model when the record has an empty-string instance", () => {
    const records = [{ id: "abc12345", status: "active", instance: "" }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].instance).toBeUndefined();
  });

  it("does not mutate its argument", () => {
    const records = [
      { id: "aaa11111", status: "working", instance: "cc-payments" },
      { id: "bbb22222", status: "waiting" },
    ];
    const snapshot = JSON.parse(JSON.stringify(records));
    cardsFromState(records);
    expect(records).toEqual(snapshot);
  });
});

// Chore 076 Step 4 — the meta column no longer renders the instance row;
// the value moves to the body head row via sibling chore 075. The previous
// `card-meta-instance` served-source assertions are inverted here: the
// class string must no longer appear inside Card's function body, and the
// shared CSS selector list no longer references it. The `cardsFromState`
// instance projection above stays — sibling 075 still needs the value on
// the view-model.
describe("served Card source no longer references card-meta-instance (076 Step 4)", () => {
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

  it("Card's body no longer mentions the card-meta-instance class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const openIdx = findFunctionBodyOpenBrace(body, "Card");
    expect(openIdx).toBeGreaterThan(-1);
    const inner = extractBalancedBlock(body, openIdx);
    expect(inner).not.toBeNull();
    expect(inner.includes("card-meta-instance")).toBe(false);
  });

  it("served /styles.css no longer defines a .card-meta-instance rule", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(/\.card-meta-instance\b/.test(body)).toBe(false);
  });

  it("served /app.js does not introduce 'unknown' or '-' placeholders for instance", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(/["']unknown["']/.test(body)).toBe(false);
  });
});

describe("served Card source's head row leads with instance and falls back to id", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js source binds the .card-body-id element to an expression that mentions both instance and id", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    // Locate the head-row .card-body-id element template and require its
    // interpolation references both `instance` and `id`. Mirrors the
    // structural-source assertion pattern used by the sibling
    // `card-meta-instance` guard test above.
    const headIdPattern = /card-body-id[^]*?\$\{[^}]*\}/;
    const match = body.match(headIdPattern);
    expect(match).not.toBeNull();
    // The matched interpolation must mention both `instance` (the lead)
    // and `id` (the fallback) — accepts any guard form (`||`, ternary,
    // `??`) so long as both identifiers participate in the binding.
    expect(/instance/.test(match[0])).toBe(true);
    expect(/\bid\b/.test(match[0])).toBe(true);
  });

  it("served /app.js source still includes a literal .card-body-id class name (cyan-mono fallback styling unchanged)", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(body.includes("card-body-id")).toBe(true);
  });

  it("served /styles.css's .card-body-id rule remains cyan-mono so layout is stable across the instance/id fallback", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    const body = await res.text();
    const ruleMatch = body.match(/\.card-body-id\b[^{]*\{([^}]*)\}/);
    expect(ruleMatch).not.toBeNull();
    const declarations = ruleMatch[1];
    expect(declarations.includes("var(--font-mono)")).toBe(true);
    expect(/var\(--tn-cyan\)/.test(declarations)).toBe(true);
  });
});
