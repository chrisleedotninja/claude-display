import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

// Extract the body of the rule whose selector list contains the given fragment.
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

describe("served /styles.css carries the Mission Board nested treatment (updated chore [052])", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("contains a .ms-sub rule that carries nesting-flavored properties (grid-template-columns, padding-left)", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    expect(res.status).toBe(200);
    const body = await res.text();

    // The .ms-sub selector must appear (replaces old .subagent-card).
    expect(/\.ms-sub\b/.test(body)).toBe(true);

    // The rule must carry grid-template-columns (nesting-flavored layout) and/or
    // padding-left (nesting indentation).
    const ruleBody = extractRuleBody(body, ".ms-sub");
    expect(ruleBody).not.toBeNull();

    const hasGrid = /\bgrid-template-columns\s*:/.test(ruleBody);
    const hasPaddingLeft = /\bpadding-left\s*:/.test(ruleBody);
    const hasConnector = body.includes(".connector");

    expect(hasGrid || hasPaddingLeft || hasConnector).toBe(true);
  });
});
