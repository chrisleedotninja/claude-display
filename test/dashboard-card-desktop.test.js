import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";
import { cardsFromState } from "../app.js";

describe("cardsFromState propagates desktop", () => {
  it("includes desktop on the view-model when the record carries a non-empty string", () => {
    const records = [{ id: "abc12345", status: "active", desktop: "code" }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].desktop).toBe("code");
  });

  it("omits desktop on the view-model when the record has no desktop", () => {
    const records = [{ id: "abc12345", status: "active" }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].desktop).toBeUndefined();
  });

  it("omits desktop on the view-model when the record has an empty-string desktop", () => {
    const records = [{ id: "abc12345", status: "active", desktop: "" }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].desktop).toBeUndefined();
  });

  it("does not mutate its argument", () => {
    const records = [
      { id: "aaa11111", status: "working", desktop: "code" },
      { id: "bbb22222", status: "waiting" },
    ];
    const snapshot = JSON.parse(JSON.stringify(records));
    cardsFromState(records);
    expect(records).toEqual(snapshot);
  });
});

describe("served /app.js card-desktop shape", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("references the card-meta-desktop class name in the served source", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(body.includes("card-meta-desktop")).toBe(true);
  });

  it("does not include 'unknown' as a desktop placeholder fallback", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // Match the sibling card-meta-repo/branch convention: a raw substring check
    // on "unknown" produces a false positive against the documentation
    // comment in app.js (chore [022] AC2 reference). A real placeholder
    // fallback would appear as a quoted string literal, e.g. `|| "unknown"`,
    // so anchor on quoted forms only.
    expect(/["']unknown["']/.test(body)).toBe(false);
  });

  it("does not render a literal '-' placeholder inside card-meta-desktop", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(/class="card-meta-desktop"[^>]*>-</.test(body)).toBe(false);
  });
});
