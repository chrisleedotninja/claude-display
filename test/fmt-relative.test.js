import { describe, it, expect } from "bun:test";
import { fmtRelative } from "../app.js";

describe("fmtRelative", () => {
  const now = 1_700_000_000_000;

  it("renders sub-minute deltas as `just now`", () => {
    expect(fmtRelative(now, now)).toBe("just now");
    expect(fmtRelative(now - 30_000, now)).toBe("just now");
    expect(fmtRelative(now - 59_999, now)).toBe("just now");
  });

  it("renders minute-bucket deltas as `Nm ago` flooring to whole minutes", () => {
    expect(fmtRelative(now - 60_000, now)).toBe("1m ago");
    expect(fmtRelative(now - 119_999, now)).toBe("1m ago");
    expect(fmtRelative(now - 120_000, now)).toBe("2m ago");
    expect(fmtRelative(now - 3_540_000, now)).toBe("59m ago");
    expect(fmtRelative(now - 3_599_999, now)).toBe("59m ago");
  });

  it("renders hour-bucket deltas as `Nh ago` flooring to whole hours", () => {
    expect(fmtRelative(now - 3_600_000, now)).toBe("1h ago");
    expect(fmtRelative(now - 7_199_999, now)).toBe("1h ago");
    expect(fmtRelative(now - 7_200_000, now)).toBe("2h ago");
    expect(fmtRelative(now - 86_399_999, now)).toBe("23h ago");
  });

  it("renders day-bucket deltas as `Nd ago` flooring to whole days", () => {
    expect(fmtRelative(now - 86_400_000, now)).toBe("1d ago");
    expect(fmtRelative(now - 172_799_999, now)).toBe("1d ago");
    expect(fmtRelative(now - 172_800_000, now)).toBe("2d ago");
    expect(fmtRelative(now - 7 * 86_400_000, now)).toBe("7d ago");
  });

  it("returns `just now` for non-finite, non-number, negative, or future inputs", () => {
    expect(fmtRelative(NaN, now)).toBe("just now");
    expect(fmtRelative(Infinity, now)).toBe("just now");
    expect(fmtRelative(-Infinity, now)).toBe("just now");
    expect(fmtRelative(-1, now)).toBe("just now");
    expect(fmtRelative("oops", now)).toBe("just now");
    expect(fmtRelative(null, now)).toBe("just now");
    expect(fmtRelative(undefined, now)).toBe("just now");
    expect(fmtRelative(now + 60_000, now)).toBe("just now");
    expect(fmtRelative(now, NaN)).toBe("just now");
    expect(fmtRelative(now, "oops")).toBe("just now");
  });
});
