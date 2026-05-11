import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";
import { cardsFromState } from "../app.js";

describe("cardsFromState propagates title", () => {
  it("includes title on the view-model when the record carries a non-empty string", () => {
    const records = [{ id: "abc12345", status: "active", title: "Reviewing PR #42" }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe("Reviewing PR #42");
  });

  it("omits title on the view-model when the record has no title key", () => {
    const records = [{ id: "abc12345", status: "active" }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBeUndefined();
  });

  it("omits title on the view-model when the record has an empty-string title", () => {
    const records = [{ id: "abc12345", status: "active", title: "" }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBeUndefined();
  });

  it("does not mutate its argument", () => {
    const records = [
      { id: "aaa11111", status: "working", title: "Reviewing PR #42" },
      { id: "bbb22222", status: "waiting" },
    ];
    const snapshot = JSON.parse(JSON.stringify(records));
    cardsFromState(records);
    expect(records).toEqual(snapshot);
  });
});

describe("served Card source references card-meta-title", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js source contains the literal class name card-meta-title", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.includes("card-meta-title")).toBe(true);
  });

  it("served /app.js source guards the card-meta-title element on title being present and non-empty", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // The structure must be: a guard mentioning title, then the element
    // class. We accept any guard form (`&&`, ternary) that names title
    // and produces no element when the prop is falsy/empty. Mirrors the
    // session_label / desktop / instance served-source assertions.
    const guardThenClass = /title[^]*?card-meta-title/;
    expect(guardThenClass.test(body)).toBe(true);
  });

  it("served /app.js does not include 'unknown' as a title placeholder fallback", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // Match the sibling card-meta-desktop / card-meta-instance convention:
    // a raw substring check on "unknown" produces false positives against
    // documentation comments in app.js. A real placeholder fallback would
    // appear as a quoted string literal, e.g. `|| "unknown"`, so anchor
    // on quoted forms only.
    expect(/["']unknown["']/.test(body)).toBe(false);
  });

  it("served /app.js does not render a literal '-' placeholder inside card-meta-title", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(/class="card-meta-title"[^>]*>-</.test(body)).toBe(false);
  });

  it("served /styles.css defines a .card-meta-title rule", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(/\.card-meta-title\b/.test(body)).toBe(true);
  });

  it("served /styles.css gives .card-meta-title the same Tokyo-Night-Storm font/color tokens as the sibling meta-text rules", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    const body = await res.text();
    // Either the new selector is added to the existing shared meta-text
    // selector list (grouped with .card-meta-desktop / .card-meta-session /
    // .card-meta-repo), or it has its own block declaring the same
    // var(--font-mono) + var(--tn-fg) tokens. The structural assertion
    // accepts either form: locate every block whose selector list contains
    // .card-meta-title, and require that at least one such block declares
    // both var(--font-mono) and var(--tn-fg).
    const blockPattern = /([^{}]*\.card-meta-title\b[^{}]*)\{([^}]*)\}/g;
    const matches = [...body.matchAll(blockPattern)];
    expect(matches.length).toBeGreaterThan(0);
    const ok = matches.some(
      (m) => /var\(--font-mono\)/.test(m[2]) && /var\(--tn-fg\)/.test(m[2]),
    );
    expect(ok).toBe(true);
  });
});
