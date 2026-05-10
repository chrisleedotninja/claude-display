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

describe("ADR 0002 no deferred-content markers", () => {
  const adr = readFileSync(adrPath, "utf8");

  it("has no TBD / TODO / FIXME / to be decided / to be determined markers", () => {
    const markers = ["TBD", "TODO", "FIXME", "to be decided", "to be determined"];
    for (const marker of markers) {
      const re = new RegExp(`\\b${marker.replace(/ /g, "\\s+")}\\b`, "i");
      expect(adr, `expected no '${marker}' marker in ADR`).not.toMatch(re);
    }
  });
});

describe("ADR 0002 orphan rule", () => {
  const adr = readFileSync(adrPath, "utf8");

  it("identifies the three options (top-level, drop, buffer) explicitly", () => {
    expect(adr).toMatch(/top[- ]level/i);
    expect(adr).toMatch(/\bdrop(s|ped|ping|\b)/i);
    expect(adr).toMatch(/\bbuffer(s|ed|ing|\b)/i);
  });

  it("locks the choice as render at top level (option (a))", () => {
    // The chosen line must explicitly cite top-level rendering as the chosen option.
    expect(adr).toMatch(/Chosen:\s*\*?\*?A\*?\*?[\s\S]{0,200}?top[- ]level/i);
  });

  it("ties rationale to ADR 0001's in-memory-server constraint", () => {
    expect(adr).toMatch(/in[- ]memory/i);
    expect(adr).toMatch(/ADR\s*0001|0001/);
  });

  it("ties rationale to [007]'s `subagent without a known parent does not crash` AC", () => {
    expect(adr).toMatch(/\[007\]/);
    expect(adr).toMatch(/(does\s+not\s+crash|without\s+(?:a\s+)?known\s+parent)/i);
  });
});

describe("ADR 0002 parent_id and subagent id", () => {
  const adr = readFileSync(adrPath, "utf8");

  it("names `parent_id` as the payload field carrying the parent instance's identifier", () => {
    expect(adr).toMatch(/`parent_id`/);
  });

  it("derives `parent_id` identically to ADR 0001's identity hash", () => {
    // Must contain the literal derivation expression from [011]/ADR-0001.
    expect(adr).toContain("HOSTNAME");
    expect(adr).toContain("TMUX_PANE");
    expect(adr).toContain("TTY");
    expect(adr).toContain("PPID");
    expect(adr).toContain("cwd");
    // The 8-char SHA-256 prefix shape.
    expect(adr).toMatch(/sha256[\s\S]{0,200}?\[0:8\]/i);
  });

  it("states the derivation runs in the subagent's process", () => {
    expect(adr).toMatch(/subagent['s ]+process/i);
  });

  it("names the subagent's own id as sha256(parent_id:parent_tool_use_id)[0:8]", () => {
    expect(adr).toMatch(/id\s*=\s*sha256\("?\$?\{?parent_id\}?:\$?\{?parent_tool_use_id\}?"?\)\[0:8\]/);
  });

  it("names the subagent's `id_raw` as parent_id:parent_tool_use_id", () => {
    expect(adr).toMatch(/id_raw\s*=\s*"?\$?\{?parent_id\}?:\$?\{?parent_tool_use_id\}?"?/);
  });
});

describe("ADR 0002 end event", () => {
  const adr = readFileSync(adrPath, "utf8");

  it("names `SubagentStop` as the Claude Code hook event marking subagent finished", () => {
    expect(adr).toMatch(/SubagentStop/);
    // Must be paired with a "finished" / "end" / "stop" semantic phrasing.
    expect(adr).toMatch(/SubagentStop[\s\S]{0,300}?(finish|end|stop|completes?|done)/i);
  });

  it("rejects the timeout-based alternative explicitly", () => {
    expect(adr).toMatch(/timeout/i);
  });

  it("rejects the main-agent-`Stop`-based alternative explicitly", () => {
    // Match phrases like "main agent's Stop", "main-agent Stop", "Stop hook of the main agent", "parent's Stop", etc.
    expect(adr).toMatch(/(main[ -]agent|parent)[\s\S]{0,80}?\bStop\b|\bStop\b[\s\S]{0,80}?(main[ -]agent|parent)/);
  });
});

describe("ADR 0002 activity event set", () => {
  const adr = readFileSync(adrPath, "utf8");

  it("states the subagent activity events are the same set as [020]'s top-level mapping", () => {
    // Look for the [020] reference paired with "same set" / "same as" / "identical" wording.
    expect(adr).toMatch(/\[020\]/);
    expect(adr).toMatch(/(same\s+(?:set|as)|identical)[\s\S]{0,80}?\[020\]|\[020\][\s\S]{0,80}?(same\s+(?:set|as)|identical)/i);
  });

  it("ties the rationale to [007]'s nested-card visibility requirement", () => {
    expect(adr).toMatch(/\[007\]/);
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
