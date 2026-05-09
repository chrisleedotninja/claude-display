import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

// Extract the body of the rule whose selector list contains `.subagent-card`.
// Returns null if no such rule exists. Forgiving about extra selectors and
// whitespace; strict about the rule actually being present and non-empty.
function extractRuleBody(css, selectorFragment) {
  const re = new RegExp(
    `(^|[},\\s])${selectorFragment.replace(/\./g, "\\.")}[^{]*\\{([^}]*)\\}`,
    "m",
  );
  const m = css.match(re);
  return m ? m[2] : null;
}

function extractFontSizePx(css, selectorFragment) {
  const body = extractRuleBody(css, selectorFragment);
  if (!body) return null;
  const m = body.match(/font-size\s*:\s*([\d.]+)px/);
  return m ? parseFloat(m[1]) : null;
}

describe("served /styles.css carries the Mission Board nested treatment", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("contains a .subagent-card rule that carries at least one nesting-flavored property", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    expect(res.status).toBe(200);
    const body = await res.text();

    // The selector itself must appear.
    expect(/\.subagent-card\b/.test(body)).toBe(true);

    // The rule must be non-empty in a way that produces visible nesting.
    const ruleBody = extractRuleBody(body, ".subagent-card");
    expect(ruleBody).not.toBeNull();

    const hasMarginLeft = /\bmargin-left\s*:/.test(ruleBody);
    const hasPaddingLeft = /\bpadding-left\s*:/.test(ruleBody);
    const hasBorderLeft = /\bborder-left\s*:/.test(ruleBody);

    let hasSmallerFontSize = false;
    const subFont = extractFontSizePx(body, ".subagent-card");
    const cardFont = extractFontSizePx(body, ".card");
    if (subFont !== null && cardFont !== null && subFont < cardFont) {
      hasSmallerFontSize = true;
    }

    expect(hasMarginLeft || hasPaddingLeft || hasBorderLeft || hasSmallerFontSize).toBe(true);
  });
});
