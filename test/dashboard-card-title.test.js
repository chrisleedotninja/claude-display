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

// Chore 076 Step 1 — the card body's <h3 class="card-body-title"> element is
// now wired to `record.title`, not the status label, and the element is
// emitted only when title is a non-empty string (no fallback to the status
// label, no `unknown`/`-` placeholder).
describe("served Card source wires <h3 class=card-body-title> to record.title (076 Step 1)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  // Walk the Card function body, returning the substring between its opening
  // and closing braces. Same idiom used by tweaks-panel-field-toggles.test.js
  // Step 7. Allows assertions over the body shape without coupling to the
  // surrounding module-level source.
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

  it("Card's body renders <h3 class=card-body-title> wired to ${title} and guarded by hasTitle", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const openIdx = findFunctionBodyOpenBrace(body, "Card");
    expect(openIdx).toBeGreaterThan(-1);
    const inner = extractBalancedBlock(body, openIdx);
    expect(inner).not.toBeNull();
    // There must be an <h3 class="card-body-title"> element in Card's body.
    expect(/<h3\s+class\s*=\s*"card-body-title"\s*>/.test(inner)).toBe(true);
    // The element must be guarded by hasTitle (so it's omitted when title
    // is absent or empty — no fallback to label).
    const guardThenH3 =
      /hasTitle[^]*?<h3\s+class\s*=\s*"card-body-title"\s*>\s*\$\{title\}/;
    expect(guardThenH3.test(inner)).toBe(true);
  });

  it("Card's body no longer renders <h3 class=card-body-title> wired to ${label}", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const openIdx = findFunctionBodyOpenBrace(body, "Card");
    const inner = extractBalancedBlock(body, openIdx);
    // The previous shape was `<h3 class="card-body-title">${label}</h3>` —
    // make sure that exact wiring is gone. (The class string itself stays;
    // only the interpolation changes.)
    expect(/<h3\s+class\s*=\s*"card-body-title"\s*>\s*\$\{label\}/.test(inner)).toBe(false);
  });

  it("served /app.js does not introduce 'unknown' or '-' placeholders alongside the new <h3>", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // The Step 1 wiring must not introduce a fallback string for the title.
    expect(/["']unknown["']/.test(body)).toBe(false);
    expect(/<h3\s+class\s*=\s*"card-body-title"\s*>-</.test(body)).toBe(false);
  });
});
