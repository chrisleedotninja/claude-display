import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cardsFromState } from "../app.js";
import { STATUS_TOKENS } from "../status-tokens.js";
import { createServer } from "../server.js";

describe("cardsFromState — color, icon, label fields", () => {
  it("includes color/icon/label resolved via tokensForStatus for an allow-list status", () => {
    const records = [{ id: "aaa11111", status: "approval" }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("aaa11111");
    expect(cards[0].status).toBe("approval");
    expect(cards[0].color).toBe("#ff9e64");
    expect(cards[0].icon).toBe("?");
    expect(cards[0].label).toBe("Approval");
  });

  it("falls back to the idle token triple when status is undefined", () => {
    const records = [{ id: "ccc33333" }];
    const cards = cardsFromState(records);
    expect(cards[0].color).toBe(STATUS_TOKENS.idle.color);
    expect(cards[0].icon).toBe(STATUS_TOKENS.idle.icon);
    expect(cards[0].label).toBe(STATUS_TOKENS.idle.label);
  });

  it("falls back to the idle token triple for an unknown status string", () => {
    const records = [{ id: "ddd44444", status: "not-a-status" }];
    const cards = cardsFromState(records);
    expect(cards[0].color).toBe(STATUS_TOKENS.idle.color);
    expect(cards[0].icon).toBe(STATUS_TOKENS.idle.icon);
    expect(cards[0].label).toBe(STATUS_TOKENS.idle.label);
  });

  it("does not mutate its input records when adding the resolved fields", () => {
    const records = [
      { id: "eee55555", status: "working" },
      { id: "fff66666", status: "blocked" },
    ];
    const snapshot = JSON.parse(JSON.stringify(records));
    cardsFromState(records);
    expect(records).toEqual(snapshot);
  });
});

describe("server serves /status-tokens.js", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("GET /status-tokens.js returns 200 with the module source", async () => {
    const res = await fetch(`${baseUrl}/status-tokens.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
    expect(body.includes("tokensForStatus")).toBe(true);
  });

  it("GET on an unrelated unknown path still 404s (allow-list semantics unchanged)", async () => {
    const res = await fetch(`${baseUrl}/not-a-real-path.js`);
    expect(res.status).toBe(404);
  });
});

describe("Card renders the per-status color and icon (served-source contract)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js imports tokensForStatus from ./status-tokens.js", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(
      body.includes('from "./status-tokens.js"') ||
        body.includes("from './status-tokens.js'"),
    ).toBe(true);
    expect(body.includes("tokensForStatus")).toBe(true);
  });

  it("served /app.js writes data-status, --card-status-color, and the card-status-icon class", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("data-status")).toBe(true);
    expect(body.includes("--card-status-color")).toBe(true);
    expect(body.includes("card-status-icon")).toBe(true);
  });

  it("served /styles.css references --card-status-color and .card-status-icon", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(body.includes("--card-status-color")).toBe(true);
    expect(body.includes(".card-status-icon")).toBe(true);
  });

  it("served /app.js still references cardsFromState and the root mount (AC5 preserved)", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("cardsFromState")).toBe(true);
    expect(
      body.includes("getElementById('root')") ||
        body.includes('getElementById("root")'),
    ).toBe(true);
    expect(body.includes("card-id")).toBe(true);
  });

  it("served /styles.css still declares the .card silhouette (AC5 preserved)", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(/\.card\b/.test(body)).toBe(true);
    expect(body.includes("-apple-system")).toBe(true);
  });
});
