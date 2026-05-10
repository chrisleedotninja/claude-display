import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  STATUS_TOKENS,
  ATTENTION_STATUSES,
  isAttentionStatus,
} from "../status-tokens.js";
import { createServer } from "../server.js";

describe("ATTENTION_STATUSES set and isAttentionStatus predicate", () => {
  it("ATTENTION_STATUSES contains exactly approval, waiting, blocked", () => {
    const keys = [...ATTENTION_STATUSES].sort();
    expect(keys).toEqual(["approval", "blocked", "waiting"]);
  });

  it("ATTENTION_STATUSES is frozen", () => {
    expect(Object.isFrozen(ATTENTION_STATUSES)).toBe(true);
  });

  it("isAttentionStatus returns true for each of approval, waiting, blocked", () => {
    expect(isAttentionStatus("approval")).toBe(true);
    expect(isAttentionStatus("waiting")).toBe(true);
    expect(isAttentionStatus("blocked")).toBe(true);
  });

  it("isAttentionStatus returns false for the five non-attention allow-list statuses", () => {
    expect(isAttentionStatus("working")).toBe(false);
    expect(isAttentionStatus("tests")).toBe(false);
    expect(isAttentionStatus("reviewing")).toBe(false);
    expect(isAttentionStatus("success")).toBe(false);
    expect(isAttentionStatus("idle")).toBe(false);
  });

  it("isAttentionStatus returns false for unknown / non-string / undefined / null inputs", () => {
    expect(isAttentionStatus("not-a-status")).toBe(false);
    expect(isAttentionStatus("")).toBe(false);
    expect(isAttentionStatus(undefined)).toBe(false);
    expect(isAttentionStatus(null)).toBe(false);
    expect(isAttentionStatus(42)).toBe(false);
  });
});

describe("served /app.js Card adds is-attention class only for attention statuses", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js imports isAttentionStatus from ./status-tokens.js", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(
      body.includes('from "./status-tokens.js"') ||
        body.includes("from './status-tokens.js'"),
    ).toBe(true);
    expect(body.includes("isAttentionStatus")).toBe(true);
  });

  it("served /app.js mentions the is-attention class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("is-attention")).toBe(true);
  });

  it("served /app.js does not hard-code the three attention status keys as a literal list in markup", async () => {
    // Belt-and-braces: the conditional class should reuse isAttentionStatus,
    // not restate the three status keys as a sibling literal in the JSX.
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Reject any literal that lists all three attention keys consecutively
    // separated by JSON-array syntax in the Card source.
    expect(
      /\["approval"\s*,\s*"waiting"\s*,\s*"blocked"\]/.test(body) ||
        /\['approval'\s*,\s*'waiting'\s*,\s*'blocked'\]/.test(body),
    ).toBe(false);
  });
});
