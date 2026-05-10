import { describe, it, expect } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NEEDS_TOKENS } from "../needs-tokens.js";

const here = dirname(fileURLToPath(import.meta.url));
const readmePath = join(here, "..", "README.md");
const scriptPath = join(here, "..", "hook", "needs-walkthrough.sh");

// The seven-value `needs` enum locked in
// docs/decisions/0003-needs-taxonomy-and-authoring-scheme.md.
const NEEDS_ENUM = [
  "approve-tool",
  "answer-question",
  "provide-input",
  "pick-option",
  "confirm-destructive",
  "resolve-conflict",
  "review-diff",
];

// Extract the body of the `## Validation walkthrough: needs tag` section: from
// the heading up to (but not including) the next `## ` heading or end-of-file.
// Mirrors test/quickstart-doc.test.js's extractor.
function extractWalkthrough(readme) {
  const match = readme.match(
    /^## Validation walkthrough: needs tag\b[\s\S]*?(?=^## |\z)/m,
  );
  return match ? match[0] : null;
}

describe("README documents the needs-tag validation walkthrough", () => {
  const readme = readFileSync(readmePath, "utf8");
  const section = extractWalkthrough(readme);

  it("has a top-level `## Validation walkthrough: needs tag` section", () => {
    expect(
      section,
      "expected a `## Validation walkthrough: needs tag` heading in README.md",
    ).not.toBeNull();
  });

  it("names every one of the seven locked labels verbatim from needs-tokens.js", () => {
    expect(section).not.toBeNull();
    // Pull each label directly from the frozen tokens table so the test stays
    // honest if a label ever changes there.
    for (const key of NEEDS_ENUM) {
      const label = NEEDS_TOKENS[key].label;
      expect(
        section,
        `expected walkthrough section to name locked label '${label}' for needs '${key}'`,
      ).toContain(label);
    }
  });

  it("names both negative cases distinctly with dashboard-observable confirmations", () => {
    expect(section).not.toBeNull();
    // Negative case 1: attention-state card with no needs value renders with
    // no tag and no placeholder. Anchor on the "no tag" / "no placeholder"
    // wording the spec uses.
    expect(
      section,
      "expected negative case 1 (attention-state, no needs → no tag / no placeholder)",
    ).toMatch(/no\s+tag/i);
    expect(section, "expected negative case 1 to mention 'no placeholder'").toMatch(
      /no\s+placeholder/i,
    );
    // Negative case 2: non-attention-state card with needs payload still
    // renders no tag. Anchor on "non-attention" wording.
    expect(
      section,
      "expected negative case 2 (non-attention-state with needs payload)",
    ).toMatch(/non[-\s]?attention/i);
  });

  it("cites the helper script path `hook/needs-walkthrough.sh`", () => {
    expect(section).not.toBeNull();
    expect(section).toContain("hook/needs-walkthrough.sh");
  });

  it("has a checklist of exactly nine items mapping one-to-one to nine steps", () => {
    expect(section).not.toBeNull();
    const checklistItems = [...section.matchAll(/^- \[[ xX]\] (.+)$/gm)].map(
      (m) => m[1],
    );
    expect(
      checklistItems.length,
      "expected nine checklist items in walkthrough section",
    ).toBe(9);

    // One-to-one: seven anchors for the seven categories, plus the two
    // negative cases. Each anchor must land on a distinct checklist item.
    const anchors = [
      ...NEEDS_ENUM.map((key) => new RegExp(NEEDS_TOKENS[key].label, "i")),
      /no\s+tag/i, // negative case 1
      /non[-\s]?attention/i, // negative case 2
    ];
    const matched = anchors.map((a) => checklistItems.findIndex((i) => a.test(i)));
    for (let i = 0; i < anchors.length; i++) {
      expect(
        matched[i],
        `expected one checklist item to match ${anchors[i]}`,
      ).toBeGreaterThanOrEqual(0);
    }
    const unique = new Set(matched);
    expect(
      unique.size,
      "expected each of the nine anchors to land on a distinct checklist item",
    ).toBe(9);
  });

  it("cross-references docs/decisions/0003-needs-taxonomy-and-authoring-scheme.md", () => {
    expect(section).not.toBeNull();
    expect(section).toContain(
      "docs/decisions/0003-needs-taxonomy-and-authoring-scheme.md",
    );
  });
});

describe("hook/needs-walkthrough.sh driver script", () => {
  it("exists and is executable", () => {
    let stat;
    try {
      stat = statSync(scriptPath);
    } catch (err) {
      throw new Error(`expected ${scriptPath} to exist: ${err.message}`);
    }
    // Owner-executable bit (mode & 0o100). Mirrors the executable check in
    // test/start-command.test.js.
    expect(
      (stat.mode & 0o100) !== 0,
      `expected ${scriptPath} to have the owner-executable bit set (mode=${stat.mode.toString(8)})`,
    ).toBe(true);
  });

  it("uses bash with `set -u` discipline, mirroring hook/heartbeat.sh", () => {
    const script = readFileSync(scriptPath, "utf8");
    expect(script).toMatch(/^#!\/usr\/bin\/env bash/m);
    expect(script).toMatch(/^set -u/m);
  });

  it("references every one of the seven CLAUDE_DISPLAY_NEEDS enum values", () => {
    const script = readFileSync(scriptPath, "utf8");
    for (const value of NEEDS_ENUM) {
      expect(
        script,
        `expected driver script to reference needs value '${value}'`,
      ).toContain(value);
    }
  });

  it("invokes hook/heartbeat.sh and does not curl /events directly", () => {
    const script = readFileSync(scriptPath, "utf8");
    expect(
      script,
      "expected driver to invoke hook/heartbeat.sh (not bypass it)",
    ).toContain("heartbeat.sh");
    // The walkthrough must route through the production hook (ADR 0003 +
    // chore [034] allow-list). A direct curl POST to /events would bypass
    // both the hook's authoring-scheme path and the server's allow-list.
    expect(
      /curl[^\n]*\/events/.test(script),
      "expected driver NOT to curl /events directly — route through hook/heartbeat.sh",
    ).toBe(false);
  });

  it("exercises negative case 1 (an attention-state fire with no CLAUDE_DISPLAY_NEEDS)", () => {
    const script = readFileSync(scriptPath, "utf8");
    // The script must invoke the hook in attention-state at least once
    // without setting CLAUDE_DISPLAY_NEEDS for that fire. We assert by
    // explicit case marker so the structure is greppable from the script
    // itself: the script tags each fire with `step <N>:` per the chore plan,
    // and the negative cases are step 8 and step 9.
    expect(
      script,
      "expected the driver to label the no-needs negative case as step 8",
    ).toMatch(/step\s+8\s*:/i);
  });

  it("exercises negative case 2 (a non-attention CLAUDE_DISPLAY_STATUS with CLAUDE_DISPLAY_NEEDS set)", () => {
    const script = readFileSync(scriptPath, "utf8");
    // The non-attention statuses (working, tests, reviewing, success, idle)
    // strip needs in both the hook and the server. The driver must set one
    // of these at least once while CLAUDE_DISPLAY_NEEDS is also set.
    expect(
      script,
      "expected the driver to label the non-attention negative case as step 9",
    ).toMatch(/step\s+9\s*:/i);
    // And it must actually set CLAUDE_DISPLAY_STATUS to a non-attention
    // value somewhere in the script (otherwise the negative case is not
    // exercised at all). Anchor on `working` since that's the obvious
    // non-attention default in the heartbeat hook static map.
    expect(
      script,
      "expected the driver to set CLAUDE_DISPLAY_STATUS to a non-attention value",
    ).toMatch(/CLAUDE_DISPLAY_STATUS=(working|tests|reviewing|success|idle)/);
  });
});
