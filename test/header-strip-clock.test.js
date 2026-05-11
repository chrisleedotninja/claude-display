import { describe, it, expect } from "bun:test";
import { formatClock, HeaderStrip } from "../app.js";

describe("formatClock", () => {
  it("returns HH:MM for a finite ms input", () => {
    // 2024-01-15 at 09:07 local — use a fixed timestamp
    // Build a date at known local hours/minutes to make the assertion portable
    const d = new Date();
    d.setHours(9, 7, 0, 0);
    const result = formatClock(d.getTime());
    expect(result).toBe("09:07");
  });

  it("zero-pads hours and minutes", () => {
    const d = new Date();
    d.setHours(1, 3, 0, 0);
    expect(formatClock(d.getTime())).toBe("01:03");
  });

  it("returns '--:--' for non-finite input", () => {
    expect(formatClock(NaN)).toBe("--:--");
    expect(formatClock(Infinity)).toBe("--:--");
    expect(formatClock(-Infinity)).toBe("--:--");
  });

  it("returns '--:--' for negative input", () => {
    expect(formatClock(-1)).toBe("--:--");
  });

  it("returns '--:--' for non-number input", () => {
    expect(formatClock("hello")).toBe("--:--");
    expect(formatClock(null)).toBe("--:--");
    expect(formatClock(undefined)).toBe("--:--");
  });
});

describe("HeaderStrip export", () => {
  it("is exported from app.js", () => {
    expect(typeof HeaderStrip).toBe("function");
  });
});
