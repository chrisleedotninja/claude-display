import { describe, it, expect } from "bun:test";
import { cardsFromState } from "../app.js";

describe("cardsFromState elapsed", () => {
  it("carries `elapsed` formatted from now-event_at when event_at is a positive finite number", () => {
    const T0 = 1_700_000_000_000;
    const records = [{ id: "ee001abc", status: "active", event_at: T0 }];
    const cards = cardsFromState(records, T0 + 12_000);
    expect(cards).toHaveLength(1);
    expect(cards[0].elapsed).toBe("12s");
  });

  it("omits `elapsed` when the record has no event_at", () => {
    const records = [{ id: "ee002abc", status: "active" }];
    const cards = cardsFromState(records, Date.now());
    expect(cards).toHaveLength(1);
    expect("elapsed" in cards[0]).toBe(false);
  });

  it("omits `elapsed` when event_at is not a number", () => {
    const records = [{ id: "ee003abc", status: "active", event_at: "1700000000000" }];
    const cards = cardsFromState(records, Date.now());
    expect("elapsed" in cards[0]).toBe(false);
  });

  it("omits `elapsed` when event_at is non-finite", () => {
    const records = [
      { id: "ee004abc", status: "active", event_at: Number.NaN },
      { id: "ee005abc", status: "active", event_at: Number.POSITIVE_INFINITY },
    ];
    const cards = cardsFromState(records, Date.now());
    expect("elapsed" in cards[0]).toBe(false);
    expect("elapsed" in cards[1]).toBe(false);
  });

  it("omits `elapsed` when now - event_at is negative (clock skew)", () => {
    const T0 = 1_700_000_000_000;
    const records = [{ id: "ee006abc", status: "active", event_at: T0 + 5_000 }];
    const cards = cardsFromState(records, T0);
    expect("elapsed" in cards[0]).toBe(false);
  });

  it("does not mutate its input", () => {
    const T0 = 1_700_000_000_000;
    const records = [{ id: "ee007abc", status: "active", event_at: T0 }];
    const snapshot = JSON.parse(JSON.stringify(records));
    cardsFromState(records, T0 + 1_000);
    expect(records).toEqual(snapshot);
  });
});
