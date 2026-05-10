import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cardsFromState } from "../app.js";
import { NEEDS_TOKENS } from "../needs-tokens.js";
import { createServer } from "../server.js";

describe("cardsFromState needs_tag projection — attention statuses + recognized needs", () => {
  it("attaches the frozen NEEDS_TOKENS entry by identity for an approval card with needs=approve-tool", () => {
    const records = [
      { id: "aaa11111", status: "approval", needs: "approve-tool" },
    ];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    // Identity assertion: consumer receives the frozen entry, not a copy.
    expect(cards[0].needs_tag).toBe(NEEDS_TOKENS["approve-tool"]);
    // And the locked label / icon are exposed via that entry.
    expect(cards[0].needs_tag.label).toBe("Approve tool");
    expect(cards[0].needs_tag.icon).toBe("✓");
  });

  it("projects needs_tag for every recognized wire-enum value when status is approval", () => {
    for (const key of Object.keys(NEEDS_TOKENS)) {
      const records = [{ id: "x", status: "approval", needs: key }];
      const cards = cardsFromState(records);
      expect(cards[0].needs_tag).toBe(NEEDS_TOKENS[key]);
    }
  });

  it("projects needs_tag for every recognized wire-enum value when status is waiting", () => {
    for (const key of Object.keys(NEEDS_TOKENS)) {
      const records = [{ id: "x", status: "waiting", needs: key }];
      const cards = cardsFromState(records);
      expect(cards[0].needs_tag).toBe(NEEDS_TOKENS[key]);
    }
  });

  it("projects needs_tag for every recognized wire-enum value when status is blocked", () => {
    for (const key of Object.keys(NEEDS_TOKENS)) {
      const records = [{ id: "x", status: "blocked", needs: key }];
      const cards = cardsFromState(records);
      expect(cards[0].needs_tag).toBe(NEEDS_TOKENS[key]);
    }
  });

  it("does not mutate its argument", () => {
    const records = [
      { id: "aaa11111", status: "approval", needs: "approve-tool" },
      { id: "bbb22222", status: "waiting", needs: "answer-question" },
    ];
    const snapshot = JSON.parse(JSON.stringify(records));
    cardsFromState(records);
    expect(records).toEqual(snapshot);
  });
});

describe("cardsFromState needs_tag projection — omitted for non-attention statuses", () => {
  // AC4: a non-attention-state card never renders a needs tag, even when the
  // record carries a recognized needs value. The data-shaping half of that AC
  // is enforced here; the render half is enforced by the served-source tests
  // further down in this file.
  for (const status of ["working", "tests", "reviewing", "success", "idle"]) {
    for (const need of [
      "approve-tool",
      "answer-question",
      "provide-input",
      "pick-option",
      "confirm-destructive",
      "resolve-conflict",
      "review-diff",
    ]) {
      it(`omits needs_tag when status is ${status} and needs is ${need}`, () => {
        const records = [{ id: "x", status, needs: need }];
        const cards = cardsFromState(records);
        expect(cards[0].needs_tag).toBeUndefined();
      });
    }
  }
});

describe("cardsFromState needs_tag projection — omitted for absent / unrecognized needs", () => {
  // AC3 (data-shaping half): an attention-state card whose record has no needs
  // value (or an unrecognized one) renders correctly with no tag. The "renders
  // correctly with no tag" half is enforced by the served-source tests further
  // down in this file.
  it("omits needs_tag when status is approval and needs is absent", () => {
    const records = [{ id: "x", status: "approval" }];
    const cards = cardsFromState(records);
    expect(cards[0].needs_tag).toBeUndefined();
  });

  it("omits needs_tag when status is approval and needs is the empty string", () => {
    const records = [{ id: "x", status: "approval", needs: "" }];
    const cards = cardsFromState(records);
    expect(cards[0].needs_tag).toBeUndefined();
  });

  it("omits needs_tag when status is approval and needs is an unknown string", () => {
    const records = [{ id: "x", status: "approval", needs: "not-a-need" }];
    const cards = cardsFromState(records);
    expect(cards[0].needs_tag).toBeUndefined();
  });

  it("omits needs_tag when status is approval and needs is a non-string number", () => {
    const records = [{ id: "x", status: "approval", needs: 42 }];
    const cards = cardsFromState(records);
    expect(cards[0].needs_tag).toBeUndefined();
  });

  it("omits needs_tag when status is approval and needs is a non-string null", () => {
    const records = [{ id: "x", status: "approval", needs: null }];
    const cards = cardsFromState(records);
    expect(cards[0].needs_tag).toBeUndefined();
  });

  it("omits needs_tag when status is approval and needs is a non-string object", () => {
    const records = [{ id: "x", status: "approval", needs: {} }];
    const cards = cardsFromState(records);
    expect(cards[0].needs_tag).toBeUndefined();
  });

  // Belt-and-braces, mirroring tokensForNeed's "does not silently accept the
  // cousin enum" guard from test/needs-tokens.test.js: feed a status-enum value
  // through the needs slot and confirm we do not project a tag.
  it("omits needs_tag when status is approval and needs is the cousin status-enum value 'approval'", () => {
    const records = [{ id: "x", status: "approval", needs: "approval" }];
    const cards = cardsFromState(records);
    expect(cards[0].needs_tag).toBeUndefined();
  });

  it("does not mutate its argument across the absent / unrecognized cases", () => {
    const records = [
      { id: "aaa11111", status: "approval" },
      { id: "bbb22222", status: "approval", needs: "" },
      { id: "ccc33333", status: "approval", needs: "not-a-need" },
      { id: "ddd44444", status: "approval", needs: 42 },
    ];
    const snapshot = JSON.parse(JSON.stringify(records));
    cardsFromState(records);
    expect(records).toEqual(snapshot);
  });
});

describe("served Card source references card-needs-tag", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js source contains the literal class name card-needs-tag", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.includes("card-needs-tag")).toBe(true);
  });

  it("served /app.js source guards the card-needs-tag element on needs_tag being present", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // Same structural-source check pattern as dashboard-card-elapsed and
    // dashboard-card-session-label: a guard mentioning `needs_tag` precedes
    // the class-name string. Establishes that the class is not unconditionally
    // emitted.
    const guardThenClass = /needs_tag[^]*?card-needs-tag/;
    expect(guardThenClass.test(body)).toBe(true);
  });

  it("served /app.js source emits the card-needs-tag class only inside a guard on needs_tag", async () => {
    // Negative-source mirror of the rail-pulse "no unconditional 'card is-attention'"
    // check: every occurrence of the bare class string `card-needs-tag` (the
    // tag's own class — not the descendants `card-needs-tag-icon` /
    // `card-needs-tag-label`) must be preceded somewhere upstream by a
    // mention of `needs_tag` so the element is gated. We strip the descendant
    // class names first so they don't false-positive on the bare-class regex.
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    const stripped = body
      .replace(/card-needs-tag-icon/g, "")
      .replace(/card-needs-tag-label/g, "");
    // Find every occurrence of `card-needs-tag`. For each one, the nearest
    // mention of `needs_tag` upstream (within the same source) must precede
    // it — i.e. the element is inside a guard that names needs_tag.
    let i = 0;
    let foundAny = false;
    while (true) {
      const idx = stripped.indexOf("card-needs-tag", i);
      if (idx === -1) break;
      foundAny = true;
      const prefix = stripped.slice(0, idx);
      expect(prefix.includes("needs_tag")).toBe(true);
      i = idx + 1;
    }
    expect(foundAny).toBe(true);
  });

  it("served /app.js source imports tokensForNeed from ./needs-tokens.js", async () => {
    // Wire-up sanity: the data-shaping projection added in steps 2-3 must
    // come from the shared needs-tokens.js module, not be re-encoded inline.
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(
      body.includes('from "./needs-tokens.js"') ||
        body.includes("from './needs-tokens.js'"),
    ).toBe(true);
    expect(body.includes("tokensForNeed")).toBe(true);
  });

  it("served /app.js source emits a data-need attribute reachable for per-category CSS", async () => {
    // Step 4's render contract: the element exposes the per-category key on
    // the DOM (data-need=${...}) so step 5's CSS rules can address it.
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(/data-need\s*=/.test(body)).toBe(true);
  });
});

describe("served /styles.css defines .card-needs-tag and seven per-category rules", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  const SEVEN_KEYS = [
    "approve-tool",
    "answer-question",
    "provide-input",
    "pick-option",
    "confirm-destructive",
    "resolve-conflict",
    "review-diff",
  ];

  it("defines a base .card-needs-tag rule with at least one declaration", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    expect(res.status).toBe(200);
    const body = await res.text();
    // Match a `.card-needs-tag` selector that is NOT followed by `[` (i.e. the
    // base rule, not a per-key attribute selector). The declaration block
    // between { and } must contain at least one declaration (non-whitespace,
    // semicolon-terminated or single).
    const re = /\.card-needs-tag(?!\[|-)\s*\{([^}]*)\}/g;
    const blocks = [];
    let m;
    while ((m = re.exec(body)) !== null) blocks.push(m[1]);
    expect(blocks.length).toBeGreaterThan(0);
    const anyHasDecl = blocks.some((b) => /\w+\s*:\s*\S+/.test(b));
    expect(anyHasDecl).toBe(true);
  });

  for (const key of SEVEN_KEYS) {
    it(`defines a per-category rule .card-needs-tag[data-need="${key}"] with at least one declaration`, async () => {
      const res = await fetch(`${baseUrl}/styles.css`);
      const body = await res.text();
      // Build a regex that finds the per-key attribute-selector rule. Allow
      // single or double quotes around the value.
      const escapedKey = key.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const re = new RegExp(
        `\\.card-needs-tag\\[\\s*data-need\\s*=\\s*["']${escapedKey}["']\\s*\\]\\s*\\{([^}]*)\\}`,
        "g",
      );
      const blocks = [];
      let m;
      while ((m = re.exec(body)) !== null) blocks.push(m[1]);
      expect(blocks.length).toBeGreaterThan(0);
      // Per-key rule's declaration block must be non-empty and contain at
      // least one declaration.
      const anyHasDecl = blocks.some((b) => /\w+\s*:\s*\S+/.test(b));
      expect(anyHasDecl).toBe(true);
    });
  }

  it("each per-category rule's declaration block carries at least one declaration not present in the base rule (visually distinct)", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    const body = await res.text();
    // Pull the base block(s) declarations as a set of normalized "prop:value;"
    // strings so we can compare per-category rule contents against them.
    const baseRe = /\.card-needs-tag(?!\[|-)\s*\{([^}]*)\}/g;
    const baseDecls = new Set();
    let bm;
    while ((bm = baseRe.exec(body)) !== null) {
      const decls = bm[1]
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const d of decls) baseDecls.add(d);
    }
    expect(baseDecls.size).toBeGreaterThan(0);

    for (const key of SEVEN_KEYS) {
      const escapedKey = key.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const perRe = new RegExp(
        `\\.card-needs-tag\\[\\s*data-need\\s*=\\s*["']${escapedKey}["']\\s*\\]\\s*\\{([^}]*)\\}`,
        "g",
      );
      let perBlock = null;
      let pm;
      while ((pm = perRe.exec(body)) !== null) {
        perBlock = pm[1];
        break;
      }
      expect(perBlock).not.toBeNull();
      const perDecls = perBlock
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      // At least one per-category declaration must NOT appear verbatim in the
      // base rule — that is the AC2 "visually distinct" guarantee.
      const distinct = perDecls.some((d) => !baseDecls.has(d));
      expect(distinct).toBe(true);
    }
  });
});
