import { describe, it, expect } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const adrPath = join(here, "..", "docs", "decisions", "0003-needs-taxonomy-and-authoring-scheme.md");

describe("ADR 0003 file exists", () => {
  it("exists at the canonical path docs/decisions/0003-needs-taxonomy-and-authoring-scheme.md", () => {
    expect(existsSync(adrPath), `expected ADR at ${adrPath}`).toBe(true);
  });

  it("is non-empty", () => {
    const stat = statSync(adrPath);
    expect(stat.size).toBeGreaterThan(0);
  });
});
