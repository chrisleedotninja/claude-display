import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cardsFromState } from "../app.js";
import { createServer } from "../server.js";

describe("cardsFromState carries repo and branch", () => {
  it("preserves repo and branch when records carry them", () => {
    const records = [
      { id: "aaa11111", status: "working", repo: "claude-display", branch: "main" },
    ];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].repo).toBe("claude-display");
    expect(cards[0].branch).toBe("main");
  });

  it("produces a view-model where repo/branch are absent or empty when records lack them", () => {
    const records = [{ id: "bbb22222", status: "waiting" }];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    const c = cards[0];
    expect(c.repo === undefined || c.repo === "").toBe(true);
    expect(c.branch === undefined || c.branch === "").toBe(true);
  });
});

describe("served /app.js carries the locked repo/branch silhouette", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("references card-meta-repo and card-meta-branch class names and uses no placeholder fallback", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body.includes("card-meta-repo")).toBe(true);
    expect(body.includes("card-meta-branch")).toBe(true);

    // The render path must not fall back to "unknown" or a literal "-" stand-in
    // for the repo/branch value. (Substring check — the file is small enough
    // that a stray match against unrelated tokens is the kind of false positive
    // we'd notice immediately.)
    expect(/["']unknown["']/.test(body)).toBe(false);
    // A literal lone "-" used as a placeholder string. Allow "-" inside class
    // names (e.g. "card-meta-repo") by checking only quoted forms.
    expect(/["']-["']/.test(body)).toBe(false);
  });

  it("served /styles.css defines .card-meta-repo and .card-meta-branch rules", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(/\.card-meta-repo\b/.test(body)).toBe(true);
    expect(/\.card-meta-branch\b/.test(body)).toBe(true);
  });
});
