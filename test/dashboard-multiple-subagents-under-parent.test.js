import { describe, it, expect } from "bun:test";
import { cardsFromState } from "../app.js";

describe("cardsFromState preserves multiple concurrent subagents under one parent", () => {
  it("returns one top-level entry whose subagents view-model contains both nested entries in source order", () => {
    const records = [
      {
        id: "P1",
        status: "working",
        subagents: [
          { id: "S1", status: "active" },
          { id: "S2", status: "waiting" },
        ],
      },
    ];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("P1");
    expect(cards[0].subagents).toHaveLength(2);
    expect(cards[0].subagents[0]).toEqual({ id: "S1", status: "active" });
    expect(cards[0].subagents[1]).toEqual({ id: "S2", status: "waiting" });
  });
});
