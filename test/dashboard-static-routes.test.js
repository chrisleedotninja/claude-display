import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("dashboard static routes", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("serves vendored Preact ESM module on GET /vendor/preact.module.js", async () => {
    const res = await fetch(`${baseUrl}/vendor/preact.module.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
    expect(body.includes("export")).toBe(true);
  });

  it("serves vendored htm ESM module on GET /vendor/htm.module.js", async () => {
    const res = await fetch(`${baseUrl}/vendor/htm.module.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
    expect(body.includes("export")).toBe(true);
  });

  it("serves index.html on GET /", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });

  it("serves index.html on GET /index.html", async () => {
    const res = await fetch(`${baseUrl}/index.html`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });

  it("serves app.js on GET /app.js", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });

  it("serves styles.css on GET /styles.css", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });

  it("returns 404 for an unknown path under /vendor/", async () => {
    const res = await fetch(`${baseUrl}/vendor/missing.js`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a /vendor/ traversal attempt", async () => {
    // The fetch URL parser will normalize ../, so build the request manually
    // by hitting a path that the explicit allowlist will reject.
    const res = await fetch(`${baseUrl}/vendor/..%2Fserver.js`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown top-level path", async () => {
    const res = await fetch(`${baseUrl}/nonsense`);
    expect(res.status).toBe(404);
  });

  it("served /app.js imports Preact and htm from /vendor/, references cardsFromState and the root mount", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(body.includes("/vendor/preact.module.js")).toBe(true);
    expect(body.includes("/vendor/htm.module.js")).toBe(true);
    expect(body.includes("cardsFromState")).toBe(true);
    expect(body.includes("getElementById('root')") || body.includes('getElementById("root")')).toBe(
      true,
    );
  });

  it("served /styles.css carries the locked silhouette: .card class and Inter Tight font", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    const body = await res.text();
    expect(/\.card\b/.test(body)).toBe(true);
    expect(body.includes("Inter Tight")).toBe(true);
  });
});
