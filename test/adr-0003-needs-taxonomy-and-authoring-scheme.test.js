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

describe("ADR 0003 override env var — CLAUDE_DISPLAY_NEEDS", () => {
  const adr = readFileSync(adrPath, "utf8");

  it("names `CLAUDE_DISPLAY_NEEDS` as the override env var", () => {
    expect(adr).toContain("CLAUDE_DISPLAY_NEEDS");
  });

  it("states that a valid enum value wins verbatim", () => {
    expect(adr).toMatch(/verbatim/i);
  });

  it("uses the phrase 'fall through' or 'fall-through'", () => {
    expect(adr).toMatch(/fall[\s-]through/i);
  });

  it("names `unset` as one fall-through case", () => {
    expect(adr).toMatch(/\bunset\b/i);
  });

  it("names `empty` as one fall-through case", () => {
    expect(adr).toMatch(/\bempty\b/i);
  });

  it("references the seven-value enum as the validation set", () => {
    expect(adr).toMatch(/seven[- ](?:value|string)/i);
  });

  it("states that no error is raised on unset/empty/invalid", () => {
    expect(adr).toMatch(/no\s+error/i);
  });
});

describe("ADR 0003 per-event auto-derivation table", () => {
  const adr = readFileSync(adrPath, "utf8");
  const wiredEvents = [
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PreCompact",
    "Notification",
    "Stop",
    "SubagentStop",
    "SessionEnd",
  ];

  for (const event of wiredEvents) {
    it(`names the wired Claude Code hook event \`${event}\``, () => {
      expect(adr, `expected event '${event}' in ADR per-event table`).toContain(event);
    });
  }

  it("maps Notification with `permission` (case-insensitive) to `approve-tool`", () => {
    // The Notification + permission row must resolve to approve-tool in close proximity.
    expect(adr).toMatch(/Notification[\s\S]{0,400}?permission[\s\S]{0,200}?`?approve-tool`?/i);
  });

  it("uses an unambiguous 'no needs value is auto-emitted' phrasing for non-Notification events", () => {
    // The exact canonical phrasing locked by the chore plan.
    expect(adr).toMatch(/no\s+needs\s+value\s+is\s+auto[- ]emitted/i);
  });
});
