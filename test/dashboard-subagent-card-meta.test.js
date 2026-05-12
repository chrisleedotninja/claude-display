import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

// Chore [079] Steps 4 and 5: the `SubagentCard` adds a fifth grid child,
// `<span class="sub-meta">`, whose body interpolates `elapsed` and
// `relative_time`. The element is emitted only when at least one of the two
// is present (structural-omit pattern). Step 5 threads `now` from
// `Dashboard` through `Card`'s subagent map to `SubagentCard`.

function extractFunctionSource(body, name) {
  const declIdx = body.indexOf(`function ${name}(`);
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

describe("served /app.js: SubagentCard renders .sub-meta in the fifth grid column (chore [079])", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("SubagentCard's parameter list mentions `elapsed`, `relative_time`, and `now`", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const { params } = extractFunctionSource(body, "SubagentCard");
    expect(params.includes("elapsed")).toBe(true);
    expect(params.includes("relative_time")).toBe(true);
    expect(params.includes("now")).toBe(true);
  });

  it("served /app.js source contains the literal class name `sub-meta`", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("sub-meta")).toBe(true);
  });

  it("every `sub-meta` class string in SubagentCard is emitted only inside a guard on `elapsed` or `relative_time`", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const { fnBody } = extractFunctionSource(body, "SubagentCard");
    let i = 0;
    let foundAny = false;
    while (true) {
      const idx = fnBody.indexOf("sub-meta", i);
      if (idx === -1) break;
      foundAny = true;
      const prefix = fnBody.slice(0, idx);
      // The guard must apply specifically to elapsed/relative_time presence
      // (either via a direct prop reference or a derived `has*` flag).
      const guardRe = /\$\{(?:[^{}]*\b(?:elapsed|relative_time|hasElapsed|hasRelativeTime)\b[^{}]*)\?/;
      expect(guardRe.test(prefix)).toBe(true);
      i = idx + 1;
    }
    expect(foundAny).toBe(true);
  });

  it("the `.sub-meta` element's interpolation references both `elapsed` and `relative_time`", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const { fnBody } = extractFunctionSource(body, "SubagentCard");
    // Walk to the sub-meta substring, then take a slice forward through the
    // next `</span>` so we only consider the element's own interpolation.
    const idx = fnBody.indexOf('class="sub-meta"');
    expect(idx).toBeGreaterThanOrEqual(0);
    const tail = fnBody.slice(idx, idx + 400);
    expect(tail.includes("elapsed")).toBe(true);
    expect(tail.includes("relative_time")).toBe(true);
  });
});

describe("served /styles.css: `.sub-meta` rule (chore [079])", () => {
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

  it("`.sub-meta` rule binds `text-align: right` and `color: var(--tn-faint)`", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const rb = ruleBody(body, ".sub-meta");
    expect(rb).not.toBeNull();
    expect(/text-align\s*:\s*right\b/.test(rb)).toBe(true);
    expect(/color\s*:\s*var\(--tn-faint\)/.test(rb)).toBe(true);
  });
});

describe("served /app.js: Dashboard threads `now` through Card to SubagentCard (chore [079] Step 5)", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("Card's parameter list mentions `now`", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const { params } = extractFunctionSource(body, "Card");
    expect(params.includes("now")).toBe(true);
  });

  it("Dashboard's `<${Card}/>` invocation forwards `now=${now}`", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const { fnBody } = extractFunctionSource(body, "Dashboard");
    expect(/<\$\{Card\}[\s\S]*?now=\$\{now\}[\s\S]*?\/>/.test(fnBody)).toBe(true);
  });

  it("Card's `subagents.map(...)` block forwards `now=${now}` to `<${SubagentCard}>`", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    const { fnBody } = extractFunctionSource(body, "Card");
    // The SubagentCard call site appears inside Card's `subagents.map(...)`
    // block. Look for the literal `<${SubagentCard}` followed by `now=${now}`
    // before the JSX self-closes (`/>`).
    expect(/<\$\{SubagentCard\}[\s\S]*?now=\$\{now\}[\s\S]*?\/>/.test(fnBody)).toBe(true);
  });
});
