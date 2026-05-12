import { describe, it, expect } from "bun:test";
import { cardsFromState, fmtRelative } from "../app.js";

describe("cardsFromState relative_time", () => {
  it("carries `relative_time` equal to fmtRelative(event_at, now) when event_at is a positive finite number ≤ now", () => {
    const T0 = 1_700_000_000_000;
    const records = [{ id: "rt001abc", status: "active", event_at: T0 }];
    const cards = cardsFromState(records, T0 + 30_000);
    expect(cards).toHaveLength(1);
    expect(cards[0].relative_time).toBe(fmtRelative(T0, T0 + 30_000));
    expect(cards[0].relative_time).toBe("just now");
  });

  it("carries `relative_time` in the minute bucket for 2m-old event_at", () => {
    const T0 = 1_700_000_000_000;
    const records = [{ id: "rt002abc", status: "active", event_at: T0 }];
    const cards = cardsFromState(records, T0 + 2 * 60_000);
    expect(cards[0].relative_time).toBe("2m ago");
  });

  it("omits `relative_time` when the record has no event_at", () => {
    const records = [{ id: "rt003abc", status: "active" }];
    const cards = cardsFromState(records, Date.now());
    expect(cards).toHaveLength(1);
    expect("relative_time" in cards[0]).toBe(false);
  });

  it("omits `relative_time` when event_at is not a number", () => {
    const records = [{ id: "rt004abc", status: "active", event_at: "1700000000000" }];
    const cards = cardsFromState(records, Date.now());
    expect("relative_time" in cards[0]).toBe(false);
  });

  it("omits `relative_time` when event_at is non-finite", () => {
    const records = [
      { id: "rt005abc", status: "active", event_at: Number.NaN },
      { id: "rt006abc", status: "active", event_at: Number.POSITIVE_INFINITY },
    ];
    const cards = cardsFromState(records, Date.now());
    expect("relative_time" in cards[0]).toBe(false);
    expect("relative_time" in cards[1]).toBe(false);
  });

  it("omits `relative_time` when now - event_at is negative (future timestamp)", () => {
    const T0 = 1_700_000_000_000;
    const records = [{ id: "rt007abc", status: "active", event_at: T0 + 5_000 }];
    const cards = cardsFromState(records, T0);
    expect("relative_time" in cards[0]).toBe(false);
  });

  it("does not mutate its input", () => {
    const T0 = 1_700_000_000_000;
    const records = [{ id: "rt008abc", status: "active", event_at: T0 }];
    const snapshot = JSON.parse(JSON.stringify(records));
    cardsFromState(records, T0 + 1_000);
    expect(records).toEqual(snapshot);
  });
});
