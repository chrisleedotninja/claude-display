import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

// Chore [079] Step 3: `.sub-body` stacks `.sub-name`, `.sub-title`, and
// `.sub-detail` vertically. The two new elements are emitted from
// `SubagentCard` only inside a guard on the corresponding prop so a sparse
// subagent record renders no `.sub-title` and no `.sub-detail` element.
//
// All assertions are structural-source / served-CSS regex checks — the
// codebase has no JSDOM, so we verify by reading the served bundle, the same
// pattern `dashboard-subagent-card-instance.test.js` already uses for the
// `instance` / `parentInstance` wiring.

function extractSubagentCardFunctionSource(body) {
  const declIdx = body.indexOf("function SubagentCard(");
  expect(declIdx).toBeGreaterThanOrEqual(0);
  const slice = body.slice(declIdx);
  const parenOpen = slice.indexOf("(");
  let depth = 0;
  let parenEnd = -1;
  for (let k = parenOpen; k < slice.length; k++) {
    const ch = slice[k];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        parenEnd = k;
        break;
      }
    }
  }
  expect(parenEnd).toBeGreaterThan(parenOpen);
  const bodyStart = slice.indexOf("{", parenEnd);
  expect(bodyStart).toBeGreaterThan(parenEnd);
  depth = 0;
  let endIdx = -1;
  for (let k = bodyStart; k < slice.length; k++) {
    const ch = slice[k];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        endIdx = k;
        break;
      }
    }
  }
  expect(endIdx).toBeGreaterThan(bodyStart);
  return {
    params: slice.slice(parenOpen, parenEnd + 1),
    fnBody: slice.slice(bodyStart, endIdx + 1),
  };
}

describe("served /app.js: SubagentCard renders .sub-title and .sub-detail inside .sub-body (chore [079])", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("SubagentCard's parameter list mentions `title` and `detail`", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const { params } = extractSubagentCardFunctionSource(body);
    expect(params.includes("title")).toBe(true);
    expect(params.includes("detail")).toBe(true);
  });

  it("served /app.js source contains the literal class names `sub-title` and `sub-detail`", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes('class="sub-title"')).toBe(true);
    expect(body.includes('class="sub-detail"')).toBe(true);
  });

  it("every `sub-title` class string in /app.js is emitted only inside a guard on `title`", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const { fnBody } = extractSubagentCardFunctionSource(body);
    let i = 0;
    let foundAny = false;
    while (true) {
      const idx = fnBody.indexOf("sub-title", i);
      if (idx === -1) break;
      foundAny = true;
      const prefix = fnBody.slice(0, idx);
      expect(prefix.includes("title")).toBe(true);
      // The guard must apply specifically to a `title`-flavored condition
      // (either a direct `${title ? ...}` or a derived `hasTitle` flag).
      const guardRe = /\$\{(?:[^{}]*\b(?:title|hasTitle)\b[^{}]*)\?/;
      expect(guardRe.test(prefix)).toBe(true);
      i = idx + 1;
    }
    expect(foundAny).toBe(true);
  });

  it("every `sub-detail` class string in /app.js is emitted only inside a guard on `detail`", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const { fnBody } = extractSubagentCardFunctionSource(body);
    let i = 0;
    let foundAny = false;
    while (true) {
      const idx = fnBody.indexOf("sub-detail", i);
      if (idx === -1) break;
      foundAny = true;
      const prefix = fnBody.slice(0, idx);
      expect(prefix.includes("detail")).toBe(true);
      const guardRe = /\$\{(?:[^{}]*\b(?:detail|hasDetail)\b[^{}]*)\?/;
      expect(guardRe.test(prefix)).toBe(true);
      i = idx + 1;
    }
    expect(foundAny).toBe(true);
  });

  it("the `.sub-title` and `.sub-detail` elements follow the `.sub-name` inside `.sub-body`", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const { fnBody } = extractSubagentCardFunctionSource(body);
    const subBodyIdx = fnBody.indexOf('class="sub-body"');
    expect(subBodyIdx).toBeGreaterThanOrEqual(0);
    const subNameIdx = fnBody.indexOf('class="sub-name"', subBodyIdx);
    const subTitleIdx = fnBody.indexOf('class="sub-title"', subBodyIdx);
    const subDetailIdx = fnBody.indexOf('class="sub-detail"', subBodyIdx);
    expect(subNameIdx).toBeGreaterThan(subBodyIdx);
    expect(subTitleIdx).toBeGreaterThan(subNameIdx);
    expect(subDetailIdx).toBeGreaterThan(subTitleIdx);
  });
});

describe("served /styles.css: `.sub-body` stacks vertically and `.sub-title` / `.sub-detail` rules exist (chore [079])", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  function ruleBody(css, selector) {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const escaped = selector.replace(/\./g, "\\.");
    const re = new RegExp(
      `(^|[},\\s])${escaped}(?![A-Za-z0-9_-])[^{}]*\\{([^}]*)\\}`,
      "m",
    );
    const m = stripped.match(re);
    return m ? m[2] : null;
  }

  it("`.sub-body` declares `flex-direction: column`", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const rb = ruleBody(body, ".sub-body");
    expect(rb).not.toBeNull();
    expect(/\bflex-direction\s*:\s*column\b/.test(rb)).toBe(true);
  });

  it("`.sub-title` rule binds `color: var(--tn-fg)` and `font-weight: 500`", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const rb = ruleBody(body, ".sub-title");
    expect(rb).not.toBeNull();
    expect(/color\s*:\s*var\(--tn-fg\)/.test(rb)).toBe(true);
    expect(/font-weight\s*:\s*500\b/.test(rb)).toBe(true);
  });

  it("`.sub-detail` rule binds `color: var(--tn-muted)` and includes a `max-width` declaration", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const rb = ruleBody(body, ".sub-detail");
    expect(rb).not.toBeNull();
    expect(/color\s*:\s*var\(--tn-muted\)/.test(rb)).toBe(true);
    expect(/\bmax-width\s*:/.test(rb)).toBe(true);
  });
});
