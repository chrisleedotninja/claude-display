import { describe, it, expect } from "bun:test";
import { cardsFromState } from "../app.js";

describe("cardsFromState handles parents with no subagents and orphan-rendered subagents", () => {
  it("returns one top-level entry with no nested children when the parent has an empty subagents array", () => {
    const records = [{ id: "P1", status: "working", subagents: [] }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("P1");
    expect(cards[0].status).toBe("working");
    // The plan accepts either an empty array OR absent — both render identically.
    const sub = cards[0].subagents;
    expect(sub === undefined || (Array.isArray(sub) && sub.length === 0)).toBe(true);
  });

  it("surfaces an orphan-rendered top-level subagent record as an ordinary top-level entry — no special branch", () => {
    // Per ADR 0002 the server places an orphan subagent at top level, so it
    // arrives in the records array as an ordinary record. cardsFromState must
    // be agnostic to whether a top-level record originated as a parent or as
    // an orphaned subagent.
    const records = [{ id: "Sx", status: "active", subagents: [] }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("Sx");
    expect(cards[0].status).toBe("active");
    const sub = cards[0].subagents;
    expect(sub === undefined || (Array.isArray(sub) && sub.length === 0)).toBe(true);
  });
});
