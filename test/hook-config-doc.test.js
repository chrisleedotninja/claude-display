import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const readmePath = join(here, "..", "README.md");

// Every Claude Code hook event the locked mapping in
// docs/decisions/0002-hook-status-mapping.md asks the hook to be wired up to.
// SessionEnd is intentionally excluded — the decision says no POST.
const REQUIRED_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PreCompact",
  "Notification",
  "Stop",
  "SubagentStop",
];

// The seven-value `needs` wire enum locked in
// docs/decisions/0003-needs-taxonomy-and-authoring-scheme.md. README must
// list each so a fresh setup can spell them correctly.
const NEEDS_ENUM = [
  "approve-tool",
  "answer-question",
  "provide-input",
  "pick-option",
  "confirm-destructive",
  "resolve-conflict",
  "review-diff",
];

describe("README documents the hook configuration", () => {
  const readme = readFileSync(readmePath, "utf8");
  const jsonBlocks = [...readme.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]);

  it("contains a fenced ```json block referencing every event in the locked mapping", () => {
    expect(jsonBlocks.length).toBeGreaterThan(0);
    // Find the first json block that contains 'hooks' — that's the settings.json snippet.
    const hooksBlock = jsonBlocks.find((b) => b.includes('"hooks"'));
    expect(hooksBlock, "expected a ```json block containing a 'hooks' object").toBeDefined();
    for (const eventName of REQUIRED_EVENTS) {
      expect(hooksBlock, `expected the hooks json block to wire ${eventName}`).toContain(
        `"${eventName}"`,
      );
    }
  });

  it("the hooks json block does NOT wire SessionEnd (decision: no POST)", () => {
    const hooksBlock = jsonBlocks.find((b) => b.includes('"hooks"'));
    expect(hooksBlock).toBeDefined();
    expect(hooksBlock, "the hooks json block must not wire SessionEnd").not.toContain(
      '"SessionEnd"',
    );
  });

  it("the hooks json block references the hook script's repo-relative path", () => {
    const hooksBlock = jsonBlocks.find((b) => b.includes('"hooks"'));
    expect(hooksBlock).toBeDefined();
    expect(hooksBlock).toContain("hook/heartbeat.sh");
  });

  it("mentions the CLAUDE_DISPLAY_URL env var so users can override the target", () => {
    expect(readme).toContain("CLAUDE_DISPLAY_URL");
  });

  it("mentions the CLAUDE_DISPLAY_STATUS env var so users can force any of the eight statuses", () => {
    expect(readme).toContain("CLAUDE_DISPLAY_STATUS");
  });

  it("references docs/decisions/0002-hook-status-mapping.md for the eight-value taxonomy", () => {
    expect(readme).toContain("docs/decisions/0002-hook-status-mapping.md");
  });

  it("mentions the CLAUDE_DISPLAY_NEEDS env var so users can force any of the seven needs values", () => {
    expect(readme).toContain("CLAUDE_DISPLAY_NEEDS");
  });

  it("references docs/decisions/0003-needs-taxonomy-and-authoring-scheme.md for the seven-value needs taxonomy", () => {
    expect(readme).toContain("docs/decisions/0003-needs-taxonomy-and-authoring-scheme.md");
  });

  it("names each of the seven needs enum values so a fresh setup can spell them correctly", () => {
    for (const needsValue of NEEDS_ENUM) {
      expect(readme, `expected README to name needs value '${needsValue}'`).toContain(needsValue);
    }
  });

  it("documents the attention-state-only filter on needs (names approval, waiting, blocked together with needs)", () => {
    // The README must communicate that needs is only attached on attention-state
    // events. Concretely: there is some prose region where the word "needs"
    // co-occurs with all three of "approval", "waiting", "blocked".
    const needsParagraph = readme
      .split(/\n\s*\n/)
      .find(
        (p) =>
          /needs/i.test(p) &&
          /\bapproval\b/.test(p) &&
          /\bwaiting\b/.test(p) &&
          /\bblocked\b/.test(p),
      );
    expect(
      needsParagraph,
      "expected a paragraph in README that names needs alongside approval/waiting/blocked",
    ).toBeDefined();
  });
});
