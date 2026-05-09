import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const readmePath = join(here, "..", "README.md");

describe("README documents the hook configuration", () => {
  const readme = readFileSync(readmePath, "utf8");

  it("contains a fenced ```json block referencing SessionStart", () => {
    // Find a fenced ```json ... ``` block.
    const jsonBlocks = [...readme.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]);
    expect(jsonBlocks.length).toBeGreaterThan(0);
    const sessionStartBlock = jsonBlocks.find((b) => b.includes("SessionStart"));
    expect(sessionStartBlock, "expected a ```json block containing 'SessionStart'").toBeDefined();
  });

  it("the json block references the hook script's repo-relative path", () => {
    const jsonBlocks = [...readme.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]);
    const sessionStartBlock = jsonBlocks.find((b) => b.includes("SessionStart"));
    expect(sessionStartBlock).toBeDefined();
    expect(sessionStartBlock).toContain("hook/heartbeat.sh");
  });

  it("mentions the CLAUDE_DISPLAY_URL env var so users can override the target", () => {
    expect(readme).toContain("CLAUDE_DISPLAY_URL");
  });
});
