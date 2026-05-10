import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createServer } from "../server.js";

describe("GET /api/state with no events", () => {
  let handle;
  let baseUrl;

  beforeAll(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterAll(() => {
    handle.stop();
  });

  it("returns 200 with an empty JSON array", async () => {
    const res = await fetch(`${baseUrl}/api/state`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([]);
  });
});
