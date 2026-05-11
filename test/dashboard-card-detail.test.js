import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cardsFromState } from "../app.js";
import { createServer } from "../server.js";

describe("cardsFromState propagates detail", () => {
  it("includes detail on the view-model when the record carries a non-empty string", () => {
    const detail =
      "Wants to nuke node_modules to resolve a peer-dep conflict in @stripe/react-stripe-js. Last build failed with ERESOLVE.";
    const records = [{ id: "abc12345", status: "working", detail }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].detail).toBe(detail);
  });

  it("omits detail on the view-model when the record has no detail", () => {
    const records = [{ id: "abc12345", status: "working" }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].detail).toBeUndefined();
  });

  it("omits detail on the view-model when the record has an empty-string detail", () => {
    const records = [{ id: "abc12345", status: "working", detail: "" }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].detail).toBeUndefined();
  });

  it("does not mutate its argument", () => {
    const records = [
      { id: "aaa11111", status: "working", detail: "narrative content" },
      { id: "bbb22222", status: "waiting" },
    ];
    const snapshot = JSON.parse(JSON.stringify(records));
    cardsFromState(records);
    expect(records).toEqual(snapshot);
  });
});

describe("served Card source renders card-body-detail under the title", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js source contains the literal class name card-body-detail", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.includes("card-body-detail")).toBe(true);
  });

  it("served /app.js source guards card-body-detail on detail being present and non-empty", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // The element must not be unconditionally emitted: a guard mentioning
    // `detail` must appear before the class name string in the source.
    const guardThenClass = /detail[^]*?card-body-detail/;
    expect(guardThenClass.test(body)).toBe(true);
  });

  it("served /app.js renders card-body-detail after card-body-title (under the title)", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    const titleIdx = body.indexOf("card-body-title");
    const detailIdx = body.indexOf("card-body-detail");
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(detailIdx).toBeGreaterThanOrEqual(0);
    expect(detailIdx).toBeGreaterThan(titleIdx);
  });

  it("served /app.js does not include 'unknown' as a detail placeholder fallback", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(/["']unknown["']/.test(body)).toBe(false);
  });

  it("served /app.js does not render a literal '-' placeholder inside card-body-detail", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(/class="card-body-detail"[^>]*>-</.test(body)).toBe(false);
  });

  it("served /styles.css defines a .card-body-detail rule with Tokyo-Night-Storm tokens", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(/\.card-body-detail\b/.test(body)).toBe(true);
    // Pull the .card-body-detail declaration block off the served stylesheet
    // and assert structural properties on it: a Tokyo-Night-Storm font token
    // and one of the existing --tn-* color tokens used by sibling card-body
    // rules.
    const ruleMatch = body.match(/\.card-body-detail\b[^{]*\{([^}]*)\}/);
    expect(ruleMatch).not.toBeNull();
    const declarations = ruleMatch[1];
    expect(declarations.includes("var(--font-mono)")).toBe(true);
    expect(/var\(--tn-(fg|muted|faint)\)/.test(declarations)).toBe(true);
  });

  it("served /styles.css .card-body-detail rule declares the multi-line CSS truncation idiom", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    const body = await res.text();
    const ruleMatch = body.match(/\.card-body-detail\b[^{]*\{([^}]*)\}/);
    expect(ruleMatch).not.toBeNull();
    const declarations = ruleMatch[1];
    expect(declarations.includes("-webkit-line-clamp")).toBe(true);
    expect(declarations.includes("-webkit-box-orient")).toBe(true);
    expect(/display:\s*-webkit-box/.test(declarations)).toBe(true);
    expect(/overflow:\s*hidden/.test(declarations)).toBe(true);
  });
});
