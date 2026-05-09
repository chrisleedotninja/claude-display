import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const adrPath = join(here, "..", "docs", "decisions", "0002-subagent-events-and-payload.md");

describe("ADR 0002 file exists", () => {
  it("exists at the canonical path docs/decisions/0002-subagent-events-and-payload.md", () => {
    expect(existsSync(adrPath), `expected ADR at ${adrPath}`).toBe(true);
  });

  it("is non-empty", () => {
    const stat = statSync(adrPath);
    expect(stat.size).toBeGreaterThan(0);
  });
});

describe("ADR 0002 subagent-context detection", () => {
  const adr = readFileSync(adrPath, "utf8");

  it("names `parent_tool_use_id` as the stdin field used to detect subagent context", () => {
    expect(adr).toContain("parent_tool_use_id");
  });

  it("states the rule that the field must be non-null to indicate subagent context", () => {
    // Match phrasings like "non-null", "is not null", "!= null".
    expect(adr).toMatch(/parent_tool_use_id[\s\S]{0,200}?(non-null|is not null|!= null|is non-null|not\s+null)/i);
  });

  it("gives rationale rejecting the session_id-comparison alternative", () => {
    expect(adr).toMatch(/session_id/);
  });

  it("gives rationale rejecting the explicit env-var alternative", () => {
    expect(adr).toMatch(/env(?:ironment)?[ -]?var/i);
  });
});
