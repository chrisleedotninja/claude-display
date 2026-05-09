import { describe, it, expect } from "bun:test";
import { cardsFromState } from "../app.js";

describe("dashboard auto-advance via cardsFromState(now)", () => {
  it("the same record produces a different elapsed string at two now values, with no new event", () => {
    const T0 = 1_700_000_000_000;
    const record = { id: "aa001abc", status: "active", event_at: T0 };
    const cardsAt12 = cardsFromState([record], T0 + 12_000);
    const cardsAt13 = cardsFromState([record], T0 + 13_000);
    expect(cardsAt12[0].elapsed).toBe("12s");
    expect(cardsAt13[0].elapsed).toBe("13s");
  });

  it("the elapsed string crosses unit boundaries (s → m → h) as now advances", () => {
    const T0 = 1_700_000_000_000;
    const record = { id: "aa002abc", status: "active", event_at: T0 };
    expect(cardsFromState([record], T0 + 59_000)[0].elapsed).toBe("59s");
    expect(cardsFromState([record], T0 + 60_000)[0].elapsed).toBe("1m");
    expect(cardsFromState([record], T0 + 3_600_000)[0].elapsed).toBe("1h");
  });
});
