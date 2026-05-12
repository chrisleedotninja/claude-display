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
