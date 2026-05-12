import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

// Chore [079] Step 2: rewrite the `.ms-sub` grid template from the
// four-column form `1.5rem 1.75rem auto 1fr` to the five-column Mission Board
// form `22px 22px auto 1fr auto`. The fifth track is reserved for the new
// `.sub-meta` element rendered in Step 4. The existing `.ms-sub` properties
// (`display: grid`, `align-items: center`, etc.) must remain.

function extractMsSubRuleBody(css) {
  // Match the `.ms-sub` rule specifically (not `.ms-subs`, not stray `.ms-sub`
  // references inside CSS comments). Strip `/* ... */` comments first so the
  // narrative inside the chore [052] comment block above the rule cannot
  // pull the regex onto a sibling rule. Then require `.ms-sub` followed by a
  // non-identifier character and the rule-opening `{` on the same selector.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /(^|[},\s])\.ms-sub(?![A-Za-z0-9_-])[^{}]*\{([^}]*)\}/m;
  const m = stripped.match(re);
  return m ? m[2] : null;
}

describe("served /styles.css carries the five-column `.ms-sub` grid (chore [079])", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("contains a .ms-sub rule whose grid-template-columns declares five tracks `22px 22px auto 1fr auto`", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    expect(res.status).toBe(200);
    const body = await res.text();
    const ruleBody = extractMsSubRuleBody(body);
    expect(ruleBody).not.toBeNull();
    const m = ruleBody.match(/grid-template-columns\s*:\s*([^;]+);/);
    expect(m).not.toBeNull();
    const normalized = m[1].replace(/\s+/g, " ").trim();
    expect(normalized).toBe("22px 22px auto 1fr auto");
  });

  it("the .ms-sub rule still carries `display: grid` and `align-items: center`", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    const body = await res.text();
    const ruleBody = extractMsSubRuleBody(body);
    expect(ruleBody).not.toBeNull();
    expect(/\bdisplay\s*:\s*grid\b/.test(ruleBody)).toBe(true);
    expect(/\balign-items\s*:\s*center\b/.test(ruleBody)).toBe(true);
  });

  it("served /styles.css no longer declares the previous four-column form `1.5rem 1.75rem auto 1fr`", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    const body = await res.text();
    expect(body.includes("1.5rem 1.75rem auto 1fr")).toBe(false);
  });
});
