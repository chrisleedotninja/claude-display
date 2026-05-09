import { describe, it, expect } from "bun:test";
import { cardsFromState } from "../app.js";

describe("cardsFromState", () => {
  it("returns an empty array when given no records", () => {
    expect(cardsFromState([])).toEqual([]);
  });

  it("returns one view-model per record, preserving id, status, and order", () => {
    const records = [
      { id: "aaa11111", status: "working" },
      { id: "bbb22222", status: "waiting" },
    ];
    expect(cardsFromState(records)).toEqual([
      { id: "aaa11111", status: "working" },
      { id: "bbb22222", status: "waiting" },
    ]);
  });

  it("does not mutate its argument", () => {
    const records = [
      { id: "aaa11111", status: "working" },
      { id: "bbb22222", status: "waiting" },
    ];
    const snapshot = JSON.parse(JSON.stringify(records));
    cardsFromState(records);
    expect(records).toEqual(snapshot);
  });
});
