import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const readmePath = join(here, "..", "README.md");

// Extract the body of the `## Quickstart` section: from the heading up to (but
// not including) the next `## ` heading or end-of-file.
function extractQuickstart(readme) {
  const match = readme.match(/^## Quickstart\b[\s\S]*?(?=^## |\z)/m);
  return match ? match[0] : null;
}

describe("README quickstart section", () => {
  const readme = readFileSync(readmePath, "utf8");
  const quickstart = extractQuickstart(readme);

  it("has a top-level `## Quickstart` section", () => {
    expect(quickstart, "expected a `## Quickstart` heading in README.md").not.toBeNull();
  });

  it("introduces numbered steps for `bun run vendor` then `bun run start` in order", () => {
    expect(quickstart).not.toBeNull();
    // Numbered list items containing the exact script names, in order.
    const vendorIdx = quickstart.search(/^\s*1\.[\s\S]*?bun run vendor/m);
    const startIdx = quickstart.search(/bun run start/);
    expect(vendorIdx, "expected `1. ... bun run vendor` numbered step").toBeGreaterThanOrEqual(0);
    expect(startIdx, "expected `bun run start` to appear in quickstart").toBeGreaterThanOrEqual(0);
    expect(startIdx).toBeGreaterThan(vendorIdx);
  });

  it("cites the dashboard URL `http://127.0.0.1:7878`", () => {
    expect(quickstart).toContain("http://127.0.0.1:7878");
  });

  it("instructs the operator to start the hook in two separate Claude Code sessions", () => {
    // The chore plan asserts two-distinct-cards (parent AC2) indirectly by
    // requiring the quickstart text to instruct the operator to run two
    // sessions. Match either "two ... session" wording or two separate shells.
    expect(quickstart).toMatch(/two\s+(?:Claude Code\s+)?(?:sessions|shells|panes)/i);
  });

  it("includes restart guidance for one of the two sessions", () => {
    expect(quickstart).toMatch(/restart/i);
    // Restart guidance is specifically about the same pane / cwd reusing the id.
    expect(quickstart).toMatch(/same\s+(?:pane|cwd)/i);
  });

  it("includes a six-item checklist mapping one-to-one to parent [002] AC list", () => {
    // Capture markdown checklist items: lines starting with `- [ ]` or `- [x]`
    // inside the quickstart section.
    const checklistItems = [...quickstart.matchAll(/^- \[[ xX]\] (.+)$/gm)].map((m) => m[1]);
    expect(checklistItems.length, "expected six checklist items in quickstart").toBe(6);

    // Each parent AC must be represented by a substring anchor unique to it.
    // Anchors are chosen to be present verbatim in both the parent spec text
    // and a faithful one-line restatement, so the checklist can use either.
    const parentAcAnchors = [
      /hook/i, // AC1: triggering a configured hook → card appears
      /two\s+(?:cards|sessions)|exactly\s+two/i, // AC2: two concurrent cards
      /identif(?:y|ier|ies)/i, // AC3: card identifies which session
      /status\s+indicator/i, // AC4: status indicator reflects latest event
      /restart/i, // AC5: restart updates existing card
      /localhost|127\.0\.0\.1|no\s+(?:external|auth)/i, // AC6: localhost-only, no auth
    ];

    for (const anchor of parentAcAnchors) {
      const hit = checklistItems.find((item) => anchor.test(item));
      expect(hit, `expected one checklist item to match ${anchor}`).toBeDefined();
    }

    // One-to-one: each anchor lands on a distinct item.
    const matched = parentAcAnchors.map((a) => checklistItems.findIndex((i) => a.test(i)));
    const unique = new Set(matched);
    expect(unique.size).toBe(6);
  });

  it("introduces no external URLs other than the loopback dashboard URL", () => {
    expect(quickstart).not.toBeNull();
    const urls = [...quickstart.matchAll(/https?:\/\/[^\s)`'"<>]+/g)].map((m) => m[0]);
    for (const u of urls) {
      expect(u, `unexpected non-loopback URL in quickstart: ${u}`).toMatch(/^http:\/\/127\.0\.0\.1(?::\d+)?(?:\/|$)/);
    }
  });

  it("contains no auth keywords inside the quickstart section", () => {
    expect(quickstart).not.toBeNull();
    expect(quickstart).not.toMatch(/\btoken\b/i);
    expect(quickstart).not.toMatch(/\bOAuth\b/i);
    expect(quickstart).not.toMatch(/apiKey/i);
    expect(quickstart).not.toMatch(/Authorization/i);
  });
});
