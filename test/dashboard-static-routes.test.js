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
});
