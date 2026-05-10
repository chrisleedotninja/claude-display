import { describe, it, expect } from "bun:test";
import { cardsFromState, withReorderTransition } from "../app.js";

describe("cardsFromState — last_event_at field", () => {
  it("includes last_event_at on each view-model when the source record carries it", () => {
    const records = [{ id: "a", status: "working", last_event_at: 7 }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("a");
    expect(cards[0].status).toBe("working");
    expect(cards[0].last_event_at).toBe(7);
  });

  it("represents a missing last_event_at as null on the view-model", () => {
    const records = [{ id: "a", status: "working" }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("a");
    expect(cards[0].status).toBe("working");
    expect(cards[0].last_event_at).toBe(null);
  });
});

describe("cardsFromState — sort order", () => {
  it("sorts by last_event_at descending (newest first)", () => {
    const records = [
      { id: "b", status: "s", last_event_at: 10 },
      { id: "a", status: "s", last_event_at: 20 },
    ];
    expect(cardsFromState(records).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("breaks ties on last_event_at by id ascending lexicographically", () => {
    const records = [
      { id: "b", status: "s", last_event_at: 5 },
      { id: "a", status: "s", last_event_at: 5 },
    ];
    expect(cardsFromState(records).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("places records with missing/null/zero last_event_at after any positive timestamp", () => {
    const records = [
      { id: "b", status: "s" }, // missing
      { id: "a", status: "s", last_event_at: 5 },
      { id: "c", status: "s", last_event_at: 0 },
      { id: "d", status: "s", last_event_at: null },
    ];
    expect(cardsFromState(records).map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps id-ascending order among records with missing/null/zero timestamps", () => {
    const records = [
      { id: "z", status: "s" },
      { id: "m", status: "s", last_event_at: 0 },
      { id: "a", status: "s", last_event_at: null },
    ];
    expect(cardsFromState(records).map((c) => c.id)).toEqual(["a", "m", "z"]);
  });

  it("does not mutate its input array when sorting", () => {
    const records = [
      { id: "b", status: "s", last_event_at: 10 },
      { id: "a", status: "s", last_event_at: 20 },
    ];
    const snapshot = JSON.parse(JSON.stringify(records));
    cardsFromState(records);
    expect(records).toEqual(snapshot);
  });
});

describe("withReorderTransition", () => {
  it("invokes renderFn directly and returns its result when viewTransitions is null", () => {
    let calls = 0;
    const renderFn = () => {
      calls++;
      return "rendered";
    };
    const result = withReorderTransition(null, renderFn);
    expect(calls).toBe(1);
    expect(result).toBe("rendered");
  });

  it("invokes renderFn directly when viewTransitions has no startViewTransition method", () => {
    let calls = 0;
    const renderFn = () => {
      calls++;
      return "rendered";
    };
    const result = withReorderTransition({}, renderFn);
    expect(calls).toBe(1);
    expect(result).toBe("rendered");
  });

  it("invokes startViewTransition with renderFn when the method exists, and does not call renderFn directly", () => {
    let renderCalls = 0;
    const renderFn = () => {
      renderCalls++;
    };
    let receivedFn = null;
    let spyCalls = 0;
    const viewTransitions = {
      startViewTransition(fn) {
        spyCalls++;
        receivedFn = fn;
        return "transition-handle";
      },
    };
    const result = withReorderTransition(viewTransitions, renderFn);
    expect(spyCalls).toBe(1);
    expect(receivedFn).toBe(renderFn);
    expect(renderCalls).toBe(0);
    expect(result).toBe("transition-handle");
  });
});
