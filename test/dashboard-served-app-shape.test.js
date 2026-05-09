import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("served /app.js shape — keyed render and view-transition wiring", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("keys each mapped Card by id so Preact reconciles by id", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(/key=\$\{[^}]*id[^}]*\}/.test(body)).toBe(true);
  });
});
