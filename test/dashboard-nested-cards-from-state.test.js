import { describe, it, expect } from "bun:test";
import { cardsFromState } from "../app.js";

describe("cardsFromState surfaces a parent's subagent under its view-model entry", () => {
  it("returns one top-level entry whose subagents view-model carries the single nested subagent", () => {
    const records = [
      {
        id: "P1",
        status: "working",
        subagents: [{ id: "S1", status: "active" }],
      },
    ];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("P1");
    expect(cards[0].status).toBe("working");
    expect(Array.isArray(cards[0].subagents)).toBe(true);
    expect(cards[0].subagents).toHaveLength(1);
    expect(cards[0].subagents[0]).toEqual({ id: "S1", status: "active" });
  });
});
