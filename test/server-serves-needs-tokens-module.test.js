import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("server serves /needs-tokens.js so the client import resolves", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("GET /needs-tokens.js returns 200", async () => {
    const res = await fetch(`${baseUrl}/needs-tokens.js`);
    expect(res.status).toBe(200);
  });

  it("GET /needs-tokens.js advertises a JavaScript Content-Type", async () => {
    const res = await fetch(`${baseUrl}/needs-tokens.js`);
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type") || "";
    // Bun.file infers a JavaScript MIME type from the .js extension. Accept
    // either of the two commonly-served forms; both signal "this is JS" to a
    // browser ESM loader.
    expect(/javascript|ecmascript/i.test(ct)).toBe(true);
  });

  it("GET /needs-tokens.js body contains the literal export tokensForNeed", async () => {
    const res = await fetch(`${baseUrl}/needs-tokens.js`);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
    expect(body.includes("tokensForNeed")).toBe(true);
    expect(body.includes("export")).toBe(true);
  });

  it("the previously-enumerated static files still resolve", async () => {
    // Belt-and-braces: adding a new entry to STATIC_FILES must not displace
    // any of the existing entries the dashboard already depends on.
    for (const path of [
      "/",
      "/index.html",
      "/app.js",
      "/styles.css",
      "/status-tokens.js",
      "/vendor/preact.module.js",
      "/vendor/htm.module.js",
    ]) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status).toBe(200);
    }
  });
});
