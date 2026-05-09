import { describe, it, expect } from "bun:test";
import { nextReconnectDelay, replaceCardsFromState, cardsFromState } from "../app.js";

describe("nextReconnectDelay — locked schedule", () => {
  it("returns 250 ms for attempt 0", () => {
    expect(nextReconnectDelay(0)).toBe(250);
  });

  it("returns the locked sequence [250, 500, 1000, 2000, 5000, 10000] for attempts 0..5", () => {
    const sequence = [0, 1, 2, 3, 4, 5].map((a) => nextReconnectDelay(a));
    expect(sequence).toEqual([250, 500, 1000, 2000, 5000, 10000]);
  });

  it("caps at 10000 ms for attempts >= 5", () => {
    expect(nextReconnectDelay(5)).toBe(10000);
    expect(nextReconnectDelay(6)).toBe(10000);
    expect(nextReconnectDelay(50)).toBe(10000);
    expect(nextReconnectDelay(500)).toBe(10000);
  });

  it("is monotonically non-decreasing across attempts 0..20", () => {
    let prev = -1;
    for (let a = 0; a <= 20; a++) {
      const d = nextReconnectDelay(a);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});

describe("replaceCardsFromState — reconnect-path entry point", () => {
  it("returns the same view-model array as cardsFromState for the same input", () => {
    const records = [
      { id: "b", status: "working", last_event_at: 10 },
      { id: "a", status: "idle", last_event_at: 20 },
      { id: "c", status: "done" },
    ];
    expect(replaceCardsFromState(records)).toEqual(cardsFromState(records));
  });

  it("returns an empty array for an empty input", () => {
    expect(replaceCardsFromState([])).toEqual([]);
  });

  it("does not mutate its input array", () => {
    const records = [
      { id: "b", status: "s", last_event_at: 10 },
      { id: "a", status: "s", last_event_at: 20 },
    ];
    const snapshot = JSON.parse(JSON.stringify(records));
    replaceCardsFromState(records);
    expect(records).toEqual(snapshot);
  });
});
