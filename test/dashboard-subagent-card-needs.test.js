import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cardsFromState } from "../app.js";
import { NEEDS_TOKENS } from "../needs-tokens.js";
import { createServer } from "../server.js";

describe("cardsFromState subagent needs_tag projection — attention statuses + recognized needs", () => {
  it("attaches the frozen NEEDS_TOKENS entry by identity for an approval subagent with needs=approve-tool", () => {
    const records = [
      {
        id: "P",
        status: "working",
        subagents: [{ id: "S", status: "approval", needs: "approve-tool" }],
      },
    ];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].subagents).toHaveLength(1);
    expect(cards[0].subagents[0].needs_tag).toBe(NEEDS_TOKENS["approve-tool"]);
  });

  it("cardsFromState omits subagent needs_tag when subagent status is non-attention 'working'", () => {
    const records = [
      {
        id: "P",
        status: "working",
        subagents: [{ id: "S", status: "working", needs: "approve-tool" }],
      },
    ];
    const cards = cardsFromState(records);
    expect(cards[0].subagents[0].needs_tag).toBeUndefined();
  });

  it("cardsFromState omits subagent needs_tag when needs is absent on attention-state status", () => {
    const records = [
      {
        id: "P",
        status: "working",
        subagents: [{ id: "S", status: "approval" }],
      },
    ];
    const cards = cardsFromState(records);
    expect(cards[0].subagents[0].needs_tag).toBeUndefined();
  });

  it("cardsFromState omits subagent needs_tag when needs is an unknown string ('bogus') on attention-state status", () => {
    const records = [
      {
        id: "P",
        status: "working",
        subagents: [{ id: "S", status: "approval", needs: "bogus" }],
      },
    ];
    const cards = cardsFromState(records);
    expect(cards[0].subagents[0].needs_tag).toBeUndefined();
  });

  it("cardsFromState keeps parent and subagent needs_tag independent (parent: review-diff, sub: approve-tool)", () => {
    const records = [
      {
        id: "P",
        status: "approval",
        needs: "review-diff",
        subagents: [{ id: "S", status: "approval", needs: "approve-tool" }],
      },
    ];
    const cards = cardsFromState(records);
    expect(cards[0].needs_tag).toBe(NEEDS_TOKENS["review-diff"]);
    expect(cards[0].subagents[0].needs_tag).toBe(NEEDS_TOKENS["approve-tool"]);
  });

  it("cardsFromState does not mutate its input across the subagent needs_tag cases", () => {
    const records = [
      {
        id: "P",
        status: "approval",
        needs: "review-diff",
        subagents: [
          { id: "S1", status: "approval", needs: "approve-tool" },
          { id: "S2", status: "working", needs: "approve-tool" },
          { id: "S3", status: "approval", needs: "bogus" },
          { id: "S4", status: "approval" },
        ],
      },
    ];
    const snapshot = JSON.parse(JSON.stringify(records));
    cardsFromState(records);
    expect(records).toEqual(snapshot);
  });
});

describe("served /app.js: SubagentCard renders card-needs-pill guarded on needs_tag", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js source contains at least two occurrences of the literal class name card-needs-pill (top-level Card + SubagentCard)", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    let count = 0;
    let i = 0;
    while (true) {
      const idx = body.indexOf("card-needs-pill", i);
      if (idx === -1) break;
      count += 1;
      i = idx + 1;
    }
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("served /app.js source emits every card-needs-pill class only inside a guard on needs_tag", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    let i = 0;
    let foundAny = false;
    while (true) {
      const idx = body.indexOf("card-needs-pill", i);
      if (idx === -1) break;
      foundAny = true;
      const prefix = body.slice(0, idx);
      expect(prefix.includes("needs_tag")).toBe(true);
      i = idx + 1;
    }
    expect(foundAny).toBe(true);
  });

  it("served /app.js source includes the literal data-need= attribute (per-category key on the DOM)", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(/data-need\s*=/.test(body)).toBe(true);
  });

  it("served /app.js source: SubagentCard accepts a needs_tag prop and looks up its key via needKeyFor", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // Locate the SubagentCard function literal by its declaration prefix.
    const declIdx = body.indexOf("function SubagentCard(");
    expect(declIdx).toBeGreaterThanOrEqual(0);
    // Walk forward to the end of the parameter-list `(...)`, then balance
    // braces from the *function-body* `{`. The destructured-parameters
    // literal `{ ... }` would otherwise terminate the scan early.
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
    const params = slice.slice(parenOpen, parenEnd + 1);
    const fnBody = slice.slice(0, endIdx + 1);
    expect(params.includes("needs_tag")).toBe(true);
    expect(fnBody.includes("needKeyFor(")).toBe(true);
  });

  it("served /app.js source: the subagents .map(...) inside Card forwards needs_tag from each s entry", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // Looser literal match: somewhere in the source, the subagent prop
    // wiring includes `needs_tag=${s.needs_tag}` (the canonical htm syntax
    // already used at the SubagentCard call site).
    expect(body.includes("needs_tag=${s.needs_tag}")).toBe(true);
  });
});

describe("served /styles.css: no separate styling layer for subagent-row pill", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /styles.css contains no compound or descendant selector combining .ms-subs (or .ms-sub) with .card-needs-pill", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    expect(res.status).toBe(200);
    const body = await res.text();
    // No selector that combines `.ms-subs` with `card-needs-pill` before the
    // next `{` brace. AC6: "no separate styling layer".
    expect(/\.ms-subs[^{]*card-needs-pill/.test(body)).toBe(false);
    expect(/\.ms-sub[^{]*card-needs-pill/.test(body)).toBe(false);
  });
});

