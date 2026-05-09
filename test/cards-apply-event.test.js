import { describe, it, expect } from "bun:test";
import { applyEventToCards } from "../app.js";

describe("applyEventToCards", () => {
  it("appends a brand-new id as a new card", () => {
    const cards = [{ id: "aaa11111", status: "working" }];
    const next = applyEventToCards(cards, { id: "bbb22222", status: "waiting" });
    expect(next).toEqual([
      { id: "aaa11111", status: "working" },
      { id: "bbb22222", status: "waiting" },
    ]);
  });

  it("replaces a matching id in place without changing position or length", () => {
    const cards = [
      { id: "aaa11111", status: "working" },
      { id: "bbb22222", status: "waiting" },
      { id: "ccc33333", status: "idle" },
    ];
    const next = applyEventToCards(cards, { id: "bbb22222", status: "working" });
    expect(next).toHaveLength(3);
    expect(next.map((c) => c.id)).toEqual(["aaa11111", "bbb22222", "ccc33333"]);
    expect(next[1].status).toBe("working");
  });

  it("does not mutate the input array or its elements", () => {
    const cards = [
      { id: "aaa11111", status: "working" },
      { id: "bbb22222", status: "waiting" },
    ];
    const snapshot = JSON.parse(JSON.stringify(cards));
    applyEventToCards(cards, { id: "bbb22222", status: "idle" });
    applyEventToCards(cards, { id: "ccc33333", status: "working" });
    expect(cards).toEqual(snapshot);
  });
});
