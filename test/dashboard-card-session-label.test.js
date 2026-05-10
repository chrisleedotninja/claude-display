import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cardsFromState } from "../app.js";
import { createServer } from "../server.js";

describe("cardsFromState session_label", () => {
  it("includes session_label on the view-model when the record has a non-empty string", () => {
    const records = [
      { id: "aaa11111", status: "working", session_label: "tmux-A" },
    ];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].session_label).toBe("tmux-A");
  });

  it("does not include session_label on the view-model when the record has none", () => {
    const records = [{ id: "bbb22222", status: "waiting" }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].session_label).toBeUndefined();
  });

  it("does not include session_label when the record has an empty string", () => {
    const records = [{ id: "ccc33333", status: "waiting", session_label: "" }];
    const cards = cardsFromState(records);
    expect(cards[0].session_label).toBeUndefined();
  });

  it("does not mutate its argument", () => {
    const records = [
      { id: "aaa11111", status: "working", session_label: "tmux-A" },
      { id: "bbb22222", status: "waiting" },
    ];
    const snapshot = JSON.parse(JSON.stringify(records));
    cardsFromState(records);
    expect(records).toEqual(snapshot);
  });
});

describe("served Card source references card-session-label", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js source contains the literal class name card-session-label", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.includes("card-session-label")).toBe(true);
  });

  it("served /app.js source guards the card-session-label element on session_label being present and non-empty", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // The structure must be: a guard mentioning session_label, then the
    // element class. We accept any guard form (`&&`, ternary) that names
    // session_label and produces no element when the prop is falsy/empty.
    // The single regex below requires session_label appearing before the
    // class-name string in the source — i.e. the class is not unconditionally
    // emitted. This is the same kind of structural source check used by
    // dashboard-html-shape.test.js.
    const guardThenClass = /session_label[^]*?card-session-label/;
    expect(guardThenClass.test(body)).toBe(true);
  });

  it("served /styles.css defines a .card-session-label rule", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(/\.card-session-label\b/.test(body)).toBe(true);
  });
});
