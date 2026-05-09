import { describe, it, expect } from "bun:test";
import { cardsFromState } from "../app.js";

describe("cardsFromState isolates subagents per parent", () => {
  it("surfaces each parent's subagents only on that parent — no cross-contamination", () => {
    const records = [
      {
        id: "P1",
        status: "working",
        subagents: [{ id: "S1", status: "active" }],
      },
      {
        id: "P2",
        status: "waiting",
        subagents: [{ id: "S2", status: "active" }],
      },
    ];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(2);

    const p1 = cards.find((c) => c.id === "P1");
    const p2 = cards.find((c) => c.id === "P2");
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();

    expect(p1.subagents).toHaveLength(1);
    expect(p1.subagents[0]).toEqual({ id: "S1", status: "active" });

    expect(p2.subagents).toHaveLength(1);
    expect(p2.subagents[0]).toEqual({ id: "S2", status: "active" });

    // No global subagents bucket on the view-model.
    expect(Array.isArray(cards.subagents)).toBe(false);
  });
});
