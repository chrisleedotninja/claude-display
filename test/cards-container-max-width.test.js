import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

// Chore [005]: raise the `.cards` container `max-width` from `36rem` to
// `1024px` so the agent-card block can grow on wide viewports. The rail
// (88px) and meta (240px) columns of `.card` must remain pinned, and the
// unrelated `.tweaks-panel-surface { max-width: 36rem }` must remain
// untouched.

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function extractRuleBody(css, selector) {
  // Match a top-level rule whose selector is exactly `selector`, after a
  // preceding boundary (line start, `}`, or `,`). Comments are stripped first
  // so narrative inside `/* ... */` cannot pull the regex onto a sibling rule.
  const stripped = stripComments(css);
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(^|[},\\s])${escaped}(?![A-Za-z0-9_-])[^{}]*\\{([^}]*)\\}`,
    "m",
  );
  const m = stripped.match(re);
  return m ? m[2] : null;
}

describe("served /styles.css caps the cards container at 1024px (chore [005])", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it(".cards rule declares max-width: 1024px and no longer carries the previous 36rem value", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    expect(res.status).toBe(200);
    const body = await res.text();
    const ruleBody = extractRuleBody(body, ".cards");
    expect(ruleBody).not.toBeNull();
    const m = ruleBody.match(/max-width\s*:\s*([^;]+);/);
    expect(m).not.toBeNull();
    const normalized = m[1].replace(/\s+/g, " ").trim();
    expect(normalized).toBe("1024px");
    // The previous cap must not linger in the `.cards` rule.
    expect(/\b36rem\b/.test(ruleBody)).toBe(false);
  });

  it(".card rule still pins the rail (88px) and meta (240px) tracks via grid-template-columns: 88px 1fr 240px", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    const body = await res.text();
    const ruleBody = extractRuleBody(body, ".card");
    expect(ruleBody).not.toBeNull();
    const m = ruleBody.match(/grid-template-columns\s*:\s*([^;]+);/);
    expect(m).not.toBeNull();
    const normalized = m[1].replace(/\s+/g, " ").trim();
    expect(normalized).toBe("88px 1fr 240px");
  });

  it(".tweaks-panel-surface still declares max-width: 36rem (the change was scoped to .cards)", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    const body = await res.text();
    const ruleBody = extractRuleBody(body, ".tweaks-panel-surface");
    expect(ruleBody).not.toBeNull();
    const m = ruleBody.match(/max-width\s*:\s*([^;]+);/);
    expect(m).not.toBeNull();
    const normalized = m[1].replace(/\s+/g, " ").trim();
    expect(normalized).toBe("36rem");
  });
});
