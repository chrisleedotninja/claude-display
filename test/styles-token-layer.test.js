import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("styles.css token layer — :root contains full token set and old-var aliases", () => {
  let handle;
  let baseUrl;
  let body;

  beforeEach(async () => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
    const res = await fetch(`${baseUrl}/styles.css`);
    body = await res.text();
  });

  afterEach(() => {
    handle.stop();
  });

  it("has Google Fonts @import for Inter Tight and JetBrains Mono at the top", () => {
    expect(body).toContain("fonts.googleapis.com");
    expect(body).toContain("Inter+Tight");
    expect(body).toContain("JetBrains+Mono");
    // @import must appear before :root
    const importIdx = body.indexOf("@import");
    const rootIdx = body.indexOf(":root");
    expect(importIdx).toBeGreaterThanOrEqual(0);
    expect(importIdx).toBeLessThan(rootIdx);
  });

  it(":root declares --font-sans and --font-mono variables", () => {
    expect(body).toContain("--font-sans");
    expect(body).toContain("--font-mono");
  });

  it(":root declares Tokyo Night Storm --tn-* base palette vars", () => {
    expect(body).toContain("--tn-bg:");
    expect(body).toContain("--tn-bg-dark:");
    expect(body).toContain("--tn-bg-darker:");
    expect(body).toContain("--tn-surface:");
    expect(body).toContain("--tn-surface-2:");
    expect(body).toContain("--tn-rule:");
    expect(body).toContain("--tn-fg:");
    expect(body).toContain("--tn-muted:");
    expect(body).toContain("--tn-faint:");
    expect(body).toContain("--tn-faintest:");
  });

  it(":root declares Tokyo Night Storm --tn-* accent vars", () => {
    expect(body).toContain("--tn-red:");
    expect(body).toContain("--tn-orange:");
    expect(body).toContain("--tn-yellow:");
    expect(body).toContain("--tn-green:");
    expect(body).toContain("--tn-teal:");
    expect(body).toContain("--tn-cyan:");
    expect(body).toContain("--tn-blue:");
    expect(body).toContain("--tn-purple:");
    expect(body).toContain("--tn-magenta:");
  });

  it(":root declares --c-* status mapping vars", () => {
    expect(body).toContain("--c-attention:");
    expect(body).toContain("--c-danger:");
    expect(body).toContain("--c-active:");
    expect(body).toContain("--c-success:");
    expect(body).toContain("--c-neutral:");
    expect(body).toContain("--c-attention-bg:");
    expect(body).toContain("--c-danger-bg:");
    expect(body).toContain("--c-active-bg:");
    expect(body).toContain("--c-success-bg:");
    expect(body).toContain("--c-neutral-bg:");
  });

  it(":root preserves backward-compat aliases for old vars (--bg, --fg, --muted, --accent, --border)", () => {
    expect(body).toContain("--bg:");
    expect(body).toContain("--fg:");
    expect(body).toContain("--muted:");
    expect(body).toContain("--accent:");
    expect(body).toContain("--border:");
  });
});

describe("styles.css token layer — body uses var(--font-sans) and no longer hardcodes -apple-system", () => {
  let handle;
  let baseUrl;
  let body;

  beforeEach(async () => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
    const res = await fetch(`${baseUrl}/styles.css`);
    body = await res.text();
  });

  afterEach(() => {
    handle.stop();
  });

  it("body rule declares font-family: var(--font-sans)", () => {
    expect(body).toContain("font-family: var(--font-sans)");
  });

  it("body rule does not hardcode -apple-system", () => {
    // Extract just the body rule block to avoid false positives in comments
    const bodyMatch = body.match(/\bbody\s*\{([^}]+)\}/);
    expect(bodyMatch).not.toBeNull();
    expect(bodyMatch[1]).not.toContain("-apple-system");
  });
});
