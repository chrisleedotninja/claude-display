import { describe, it, expect } from "bun:test";
import { dimRamp } from "../app.js";

describe("dimRamp pure helper — 1.0→0.55 opacity ramp", () => {
  it("returns 1 when total is 1 (single card, no ramp needed)", () => {
    expect(dimRamp(0, 1)).toBe(1);
  });

  it("returns 1.0 for the first card (idx=0) in a multi-card feed", () => {
    expect(dimRamp(0, 5)).toBe(1);
  });

  it("returns 0.55 for the last card (idx=total-1) in a multi-card feed", () => {
    expect(dimRamp(4, 5)).toBe(0.55);
  });

  it("returns a value between 0.55 and 1.0 for intermediate cards", () => {
    const v = dimRamp(2, 5);
    expect(v).toBeGreaterThanOrEqual(0.55);
    expect(v).toBeLessThanOrEqual(1.0);
    // Must be strictly between the extremes
    expect(v).toBeGreaterThan(0.55);
    expect(v).toBeLessThan(1.0);
  });

  it("returns 0.55 for idx=1 total=2 (last of two cards)", () => {
    expect(dimRamp(1, 2)).toBe(0.55);
  });

  it("returns 1.0 for idx=0 total=2 (first of two cards)", () => {
    expect(dimRamp(0, 2)).toBe(1);
  });
});

describe("Dashboard applies dimRamp opacity per card group position", () => {
  it("served app.js references dimRamp in the Dashboard render path", async () => {
    // Check that app.js source exports dimRamp and mentions it near the cards render
    const { createServer } = await import("../server.js");
    const handle = createServer({ port: 0, hostname: "127.0.0.1" });
    const baseUrl = `http://127.0.0.1:${handle.server.port}`;
    try {
      const body = await (await fetch(`${baseUrl}/app.js`)).text();
      expect(body.includes("dimRamp")).toBe(true);
      // dimRamp must appear in context that looks like an opacity assignment
      expect(/dimRamp/.test(body)).toBe(true);
      // The Dashboard component must reference dimRamp for opacity
      expect(/opacity.*dimRamp|dimRamp.*opacity/.test(body)).toBe(true);
    } finally {
      handle.stop();
    }
  });
});
