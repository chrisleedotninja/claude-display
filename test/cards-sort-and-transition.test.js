import { describe, it, expect } from "bun:test";
import { cardsFromState } from "../app.js";

describe("cardsFromState — last_event_at field", () => {
  it("includes last_event_at on each view-model when the source record carries it", () => {
    const records = [{ id: "a", status: "working", last_event_at: 7 }];
    expect(cardsFromState(records)).toEqual([
      { id: "a", status: "working", last_event_at: 7 },
    ]);
  });

  it("represents a missing last_event_at as null on the view-model", () => {
    const records = [{ id: "a", status: "working" }];
    expect(cardsFromState(records)).toEqual([
      { id: "a", status: "working", last_event_at: null },
    ]);
  });
});
