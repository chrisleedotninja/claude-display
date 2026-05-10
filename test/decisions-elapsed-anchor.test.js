import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const adrPath = join(here, "..", "docs", "decisions", "0002-elapsed-time-anchor.md");

describe("decisions ADR 0002 — elapsed-time anchor", () => {
  it("the file exists at docs/decisions/0002-elapsed-time-anchor.md", () => {
    expect(existsSync(adrPath)).toBe(true);
  });

  it("references the keyword event_at", () => {
    const body = readFileSync(adrPath, "utf8");
    expect(body).toContain("event_at");
  });

  it("references the phrase `most recent event`", () => {
    const body = readFileSync(adrPath, "utf8");
    expect(body).toMatch(/most recent event/i);
  });

  it("references the wire-format unit `milliseconds`", () => {
    const body = readFileSync(adrPath, "utf8");
    expect(body).toMatch(/milliseconds/i);
  });

  it("names the rejected interpretation (session start)", () => {
    const body = readFileSync(adrPath, "utf8");
    expect(body).toMatch(/session start/i);
  });
});
