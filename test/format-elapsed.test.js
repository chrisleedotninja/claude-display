import { describe, it, expect } from "bun:test";
import { formatElapsed } from "../app.js";

describe("formatElapsed", () => {
  it("renders sub-minute durations as `Ns` flooring to whole seconds", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(999)).toBe("0s");
    expect(formatElapsed(1_000)).toBe("1s");
    expect(formatElapsed(12_345)).toBe("12s");
    expect(formatElapsed(59_999)).toBe("59s");
  });

  it("renders sub-hour durations as `Nm` flooring to whole minutes", () => {
    expect(formatElapsed(60_000)).toBe("1m");
    expect(formatElapsed(60_999)).toBe("1m");
    expect(formatElapsed(120_000)).toBe("2m");
    expect(formatElapsed(3_599_999)).toBe("59m");
  });

  it("renders hour-and-up durations as `Nh` flooring to whole hours", () => {
    expect(formatElapsed(3_600_000)).toBe("1h");
    expect(formatElapsed(3_600_001)).toBe("1h");
    expect(formatElapsed(7_200_000)).toBe("2h");
    expect(formatElapsed(86_400_000)).toBe("24h");
  });

  it("renders negative inputs as the empty string", () => {
    expect(formatElapsed(-1)).toBe("");
    expect(formatElapsed(-1_000)).toBe("");
  });
});
