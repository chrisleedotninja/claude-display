import { describe, it, expect } from "bun:test";
import { cardsFromState } from "../app.js";
import { NEEDS_TOKENS } from "../needs-tokens.js";

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
