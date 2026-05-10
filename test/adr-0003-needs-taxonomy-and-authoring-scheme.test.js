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

describe("ADR 0003 wire enum (seven values)", () => {
  const adr = readFileSync(adrPath, "utf8");
  const wireEnum = [
    "approve-tool",
    "answer-question",
    "provide-input",
    "pick-option",
    "confirm-destructive",
    "resolve-conflict",
    "review-diff",
  ];

  for (const value of wireEnum) {
    it(`names the wire-enum value \`${value}\``, () => {
      expect(adr, `expected wire-enum value '${value}' in ADR`).toContain(value);
    });
  }
});

describe("ADR 0003 authoring scheme — hybrid chosen, alternatives rejected", () => {
  const adr = readFileSync(adrPath, "utf8");

  it("identifies the pure-auto-from-stdin alternative", () => {
    expect(adr).toMatch(/pure\s+auto/i);
  });

  it("identifies the pure-explicit-signal alternative", () => {
    expect(adr).toMatch(/pure\s+explicit/i);
  });

  it("identifies the hybrid alternative and chooses it", () => {
    expect(adr).toMatch(/\bhybrid\b/i);
    // Chosen-line: explicitly picks hybrid in an unambiguous chosen/decision context.
    expect(adr).toMatch(/(chosen|chose|choose|pick|selected|decision)[\s\S]{0,80}?\bhybrid\b/i);
  });

  it("references the precedent ADR 0002-hook-status-mapping.md", () => {
    expect(adr).toContain("0002-hook-status-mapping.md");
  });
});
