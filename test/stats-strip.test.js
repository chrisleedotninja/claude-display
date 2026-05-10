import { describe, it, expect } from "bun:test";
import { statsFromCards, StatsStrip } from "../app.js";

describe("statsFromCards", () => {
  it("returns all zeros for an empty array", () => {
    const result = statsFromCards([]);
    expect(result).toEqual({ awaiting: 0, blocked: 0, active: 0, done: 0, instances: 0 });
  });

  it("counts awaiting: waiting and approval statuses", () => {
    const cards = [
      { status: "waiting" },
      { status: "approval" },
      { status: "working" },
    ];
    expect(statsFromCards(cards).awaiting).toBe(2);
  });

  it("counts blocked: blocked status", () => {
    const cards = [
      { status: "blocked" },
      { status: "blocked" },
      { status: "success" },
    ];
    expect(statsFromCards(cards).blocked).toBe(2);
  });

  it("counts active: working, tests, and reviewing statuses", () => {
    const cards = [
      { status: "working" },
      { status: "tests" },
      { status: "reviewing" },
      { status: "blocked" },
    ];
    expect(statsFromCards(cards).active).toBe(3);
  });

  it("counts done: success status", () => {
    const cards = [
      { status: "success" },
      { status: "success" },
      { status: "working" },
    ];
    expect(statsFromCards(cards).done).toBe(2);
  });

  it("counts instances as cards.length", () => {
    const cards = [
      { status: "working" },
      { status: "blocked" },
      { status: "success" },
    ];
    expect(statsFromCards(cards).instances).toBe(3);
  });

  it("returns correct counts for a mixed set", () => {
    const cards = [
      { status: "waiting" },
      { status: "approval" },
      { status: "blocked" },
      { status: "working" },
      { status: "tests" },
      { status: "reviewing" },
      { status: "success" },
      { status: "idle" }, // not counted in any named bucket
    ];
    expect(statsFromCards(cards)).toEqual({
      awaiting: 2,
      blocked: 1,
      active: 3,
      done: 1,
      instances: 8,
    });
  });
});

describe("StatsStrip export", () => {
  it("is exported from app.js", () => {
    expect(typeof StatsStrip).toBe("function");
  });
});
