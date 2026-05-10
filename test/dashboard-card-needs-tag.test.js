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
