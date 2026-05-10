import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { nextPanelOpen } from "../app.js";
import { createServer } from "../server.js";

describe("nextPanelOpen pure toggle helper (Step 1)", () => {
  it("returns true when previous state is false", () => {
    expect(nextPanelOpen(false)).toBe(true);
  });

  it("returns false when previous state is true", () => {
    expect(nextPanelOpen(true)).toBe(false);
  });

  it("defaults undefined input to closed (false)", () => {
    // Documented start state: closed. Toggling from `undefined` therefore
    // behaves as if the previous state were `false` — i.e. opens the panel.
    expect(nextPanelOpen(undefined)).toBe(true);
  });

  it("never throws on bad input — non-boolean values coerce to closed-then-toggle", () => {
    expect(() => nextPanelOpen(null)).not.toThrow();
    expect(() => nextPanelOpen(0)).not.toThrow();
    expect(() => nextPanelOpen("")).not.toThrow();
    expect(() => nextPanelOpen("nope")).not.toThrow();
    expect(() => nextPanelOpen({})).not.toThrow();
    expect(() => nextPanelOpen([])).not.toThrow();
    // All non-boolean inputs are treated as "closed" → toggling gives true.
    expect(nextPanelOpen(null)).toBe(true);
    expect(nextPanelOpen(0)).toBe(true);
    expect(nextPanelOpen("")).toBe(true);
    expect(nextPanelOpen("nope")).toBe(true);
    expect(nextPanelOpen({})).toBe(true);
    expect(nextPanelOpen([])).toBe(true);
  });
});

describe("served /app.js panel-open state defaults closed and gates the surface (Step 2)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js initialises the panel-open variable to false (panel starts closed)", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Match a `let panelOpen = false` (or `let panelOpen=false`) initialiser.
    // Using a tolerant regex so an explicit type annotation or surrounding
    // whitespace doesn't break the assertion.
    const initRe = /\b(?:let|var|const)\s+panelOpen\s*=\s*false\b/;
    expect(initRe.test(body)).toBe(true);
  });

  it("served /app.js renders the panel surface conditionally on panelOpen (not unconditionally)", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Mirrors the `guardThenClass` pattern in test/dashboard-card-elapsed.test.js:
    // a guard mentioning panelOpen precedes the panel-surface class string.
    const guardThenClass = /panelOpen[^]*?tweaks-panel-surface/;
    expect(guardThenClass.test(body)).toBe(true);
    // And belt-and-braces: the surface class must appear in the source at all.
    expect(body.includes("tweaks-panel-surface")).toBe(true);
  });
});

describe("served /app.js carries an open/close affordance wired to the toggle helper (Step 3)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js mentions the tweaks-panel-toggle class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("tweaks-panel-toggle")).toBe(true);
  });

  it("served /app.js source contains a literal <button element", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("<button")).toBe(true);
  });

  it("served /app.js wires the affordance to nextPanelOpen via an onClick (or onclick) handler", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // The affordance must reference the Step 1 helper by name in source.
    expect(body.includes("nextPanelOpen")).toBe(true);
    // And it must use a click-handler attribute. Either casing is acceptable
    // because htm/Preact accept both `onClick` and `onclick`.
    const hasClickHandler = /\bonClick\b/.test(body) || /\bonclick\b/.test(body);
    expect(hasClickHandler).toBe(true);
  });
});

describe("served /app.js panel surface renders a header identifying it as the Tweaks panel (Step 4)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js mentions the tweaks-panel-header class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("tweaks-panel-header")).toBe(true);
  });

  it("served /app.js renders the literal label 'Tweaks' inside the same conditional branch as the surface class", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Walk forward from the panel-surface class to the next closing of its
    // template literal (`); within that span the user-facing label "Tweaks"
    // and the header class must both appear, proving the header sits inside
    // the surface's open-state branch.
    const surfaceIdx = body.indexOf("tweaks-panel-surface");
    expect(surfaceIdx).toBeGreaterThan(-1);
    const closeIdx = body.indexOf("`", surfaceIdx);
    expect(closeIdx).toBeGreaterThan(surfaceIdx);
    const span = body.slice(surfaceIdx, closeIdx);
    expect(span.includes("tweaks-panel-header")).toBe(true);
    expect(span.includes("Tweaks")).toBe(true);
  });
});

describe("served /app.js panelOpen never gates cards or per-card fields (Step 5, AC3)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  // Brace-walking helper: given the source and the index of an opening `{`,
  // return the substring between that brace and its matching `}`. Mirrors
  // the technique used by `extractReducedMotionBody` in
  // test/card-attention-rail-pulse.test.js.
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

  // Locate `function <name>(...)` and return the index of the `{` that opens
  // the function body. Walks parens to handle default-arg expressions like
  // `Date.now()` that contain their own `()`.
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
    // Now `i` is just past the closing `)`. Skip whitespace to find `{`.
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] !== "{") return -1;
    return i;
  }

  it("cardsFromState's function body does not mention panelOpen", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const openIdx = findFunctionBodyOpenBrace(body, "cardsFromState");
    expect(openIdx).toBeGreaterThan(-1);
    const inner = extractBalancedBlock(body, openIdx);
    expect(inner).not.toBeNull();
    expect(inner.includes("panelOpen")).toBe(false);
  });

  it("the Card component's definition body does not mention panelOpen", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const openIdx = findFunctionBodyOpenBrace(body, "Card");
    expect(openIdx).toBeGreaterThan(-1);
    const inner = extractBalancedBlock(body, openIdx);
    expect(inner).not.toBeNull();
    expect(inner.includes("panelOpen")).toBe(false);
  });

  it("the cards.map(...) iteration is not gated on panelOpen", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Locate the `cards.map(` call site inside Dashboard. The substring from
    // that call site through its matching `)` must not mention panelOpen.
    const mapIdx = body.indexOf("cards.map(");
    expect(mapIdx).toBeGreaterThan(-1);
    // Walk parens from the `(` after `cards.map`.
    const openParen = mapIdx + "cards.map".length;
    expect(body[openParen]).toBe("(");
    let depth = 1;
    let endIdx = -1;
    for (let i = openParen + 1; i < body.length; i++) {
      const c = body[i];
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    expect(endIdx).toBeGreaterThan(openParen);
    const span = body.slice(openParen, endIdx + 1);
    expect(span.includes("panelOpen")).toBe(false);
  });
});

describe("served /app.js panel renders cleanly when empty (Step 6, AC5)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js mentions the tweaks-panel-body class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("tweaks-panel-body")).toBe(true);
  });

  it("served /app.js does not gate the panel surface on a second condition beyond panelOpen", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // No `panelOpen && (… && …) … tweaks-panel-surface` chained-AND
    // construct gating the surface on a second condition (e.g.
    // `panelOpen && hasContent && html\`…surface…\``). The defensible
    // approximation: between any `panelOpen && ` and the next
    // `tweaks-panel-surface` occurrence, the span must not contain another
    // ` && `. We assert the negative form directly with a regex.
    const gateRe = /panelOpen\s*&&\s*[^;]*?&&[^;]*?tweaks-panel-surface/;
    expect(gateRe.test(body)).toBe(false);
  });
});

describe("served /styles.css panel rules source palette vars and add no new hex (Step 7)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  // Collect every `.<selector> { ... }` block whose selector list mentions
  // the given class name. Returns the inner declaration-block strings.
  function blocksFor(css, className) {
    const blocks = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css)) !== null) {
      const sel = m[1].trim();
      if (sel.startsWith("@")) continue;
      if (sel.includes(`.${className}`)) blocks.push(m[2]);
    }
    return blocks;
  }

  it("each of the four panel selectors appears with at least one rule block", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    for (const cls of [
      "tweaks-panel-surface",
      "tweaks-panel-header",
      "tweaks-panel-body",
      "tweaks-panel-toggle",
    ]) {
      const blocks = blocksFor(body, cls);
      expect(blocks.length).toBeGreaterThan(0);
    }
  });

  it("every declaration block for the four panel selectors uses at least one var(--…) reference", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    for (const cls of [
      "tweaks-panel-surface",
      "tweaks-panel-header",
      "tweaks-panel-body",
      "tweaks-panel-toggle",
    ]) {
      const blocks = blocksFor(body, cls);
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(/var\(\s*--[\w-]+\s*\)/.test(block)).toBe(true);
      }
    }
  });

  it("no new top-level #xxxxxx hex literal is introduced inside the four panel selectors' declaration blocks", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    for (const cls of [
      "tweaks-panel-surface",
      "tweaks-panel-header",
      "tweaks-panel-body",
      "tweaks-panel-toggle",
    ]) {
      const blocks = blocksFor(body, cls);
      for (const block of blocks) {
        // Reject any literal of the form #abc or #aabbcc (3- or 6-digit hex).
        expect(/#[0-9a-fA-F]{3,8}\b/.test(block)).toBe(false);
      }
    }
  });
});

describe("HTML shape continuity around the new panel scaffolding (Step 8)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served / contains exactly one <div id=\"root\"></div> mount point", async () => {
    const body = await (await fetch(`${baseUrl}/`)).text();
    const matches = body.match(/<div\s+id\s*=\s*"root"\s*>\s*<\/div>/g) || [];
    expect(matches).toHaveLength(1);
  });

  it("served / contains exactly one /app.js module-script reference", async () => {
    const body = await (await fetch(`${baseUrl}/`)).text();
    const matches =
      body.match(/<script[^>]+type\s*=\s*"module"[^>]+src\s*=\s*"\/app\.js"[^>]*>/g) ||
      [];
    expect(matches).toHaveLength(1);
  });

  it("served /app.js contains no http(s) URL", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(/https?:\/\//.test(body)).toBe(false);
  });
});
