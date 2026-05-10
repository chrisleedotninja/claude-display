import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
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

describe("ADR 0003 no deferred-content markers and is Accepted", () => {
  const adr = readFileSync(adrPath, "utf8");

  it("has no TBD / TODO / FIXME / to be decided / to be determined markers", () => {
    const markers = ["TBD", "TODO", "FIXME", "to be decided", "to be determined"];
    for (const marker of markers) {
      const re = new RegExp(`\\b${marker.replace(/ /g, "\\s+")}\\b`, "i");
      expect(adr, `expected no '${marker}' marker in ADR`).not.toMatch(re);
    }
  });

  it("contains a `Status: Accepted` line", () => {
    expect(adr).toMatch(/Status:\s*Accepted/);
  });
});
