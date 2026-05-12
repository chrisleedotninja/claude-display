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

describe("served Card source references card-meta-instance", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js source contains the literal class name card-meta-instance", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.includes("card-meta-instance")).toBe(true);
  });

  it("served /app.js source guards the card-meta-instance element on instance being present and non-empty", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // The structure must be: a guard mentioning instance, then the element
    // class. We accept any guard form (`&&`, ternary) that names instance
    // and produces no element when the prop is falsy/empty. Mirrors the
    // session_label / desktop served-source assertions.
    const guardThenClass = /instance[^]*?card-meta-instance/;
    expect(guardThenClass.test(body)).toBe(true);
  });

  it("served /app.js does not include 'unknown' as an instance placeholder fallback", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // Match the sibling card-meta-desktop convention: a raw substring check
    // on "unknown" produces a false positive against documentation comments
    // in app.js. A real placeholder fallback would appear as a quoted string
    // literal, e.g. `|| "unknown"`, so anchor on quoted forms only.
    expect(/["']unknown["']/.test(body)).toBe(false);
  });

  it("served /app.js does not render a literal '-' placeholder inside card-meta-instance", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(/class="card-meta-instance"[^>]*>-</.test(body)).toBe(false);
  });

  it("served /styles.css defines a .card-meta-instance rule", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(/\.card-meta-instance\b/.test(body)).toBe(true);
  });

  it("served /styles.css gives .card-meta-instance the same Tokyo-Night-Storm font/color tokens as the sibling meta-text rules", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    const body = await res.text();
    // Either the new selector is added to the existing shared meta-text
    // selector list (grouped with .card-meta-desktop / .card-meta-session /
    // .card-meta-repo), or it has its own block declaring the same
    // var(--font-mono) + var(--tn-fg) tokens. The structural assertion
    // accepts either form: locate every block whose selector list contains
    // .card-meta-instance, and require that at least one such block
    // declares both var(--font-mono) and var(--tn-fg).
    const blockPattern = /([^{}]*\.card-meta-instance\b[^{}]*)\{([^}]*)\}/g;
    const matches = [...body.matchAll(blockPattern)];
    expect(matches.length).toBeGreaterThan(0);
    const ok = matches.some(
      (m) => /var\(--font-mono\)/.test(m[2]) && /var\(--tn-fg\)/.test(m[2]),
    );
    expect(ok).toBe(true);
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
