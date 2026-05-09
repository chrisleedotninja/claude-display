import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("POST /events status allow-list", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  const ALLOWED = [
    "approval",
    "waiting",
    "blocked",
    "working",
    "tests",
    "reviewing",
    "success",
    "idle",
  ];

  it("round-trips every allow-list value verbatim", async () => {
    for (let i = 0; i < ALLOWED.length; i++) {
      const status = ALLOWED[i];
      const id = `id${String(i).padStart(6, "0")}`;
      const postRes = await fetch(`${baseUrl}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          id_raw: `host:pane:/${status}`,
          status,
        }),
      });
      expect([200, 202]).toContain(postRes.status);
    }

    const stateRes = await fetch(`${baseUrl}/api/state`);
    expect(stateRes.status).toBe(200);
    const records = await stateRes.json();
    expect(records).toHaveLength(ALLOWED.length);

    const byId = new Map(records.map((r) => [r.id, r]));
    for (let i = 0; i < ALLOWED.length; i++) {
      const id = `id${String(i).padStart(6, "0")}`;
      const status = ALLOWED[i];
      const rec = byId.get(id);
      expect(rec).toBeDefined();
      expect(rec.status).toBe(status);
    }
  });

  it("collapses an out-of-list status to idle and accepts the event", async () => {
    const postRes = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "lol12345",
        id_raw: "host:pane:/lolwut",
        status: "lolwut",
      }),
    });
    expect([200, 202]).toContain(postRes.status);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    expect(stateRes.status).toBe(200);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("lol12345");
    expect(records[0].status).toBe("idle");
  });

  it("only exposes allow-list values on GET /api/state after a mixed sequence", async () => {
    const post = (body) =>
      fetch(`${baseUrl}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    await post({ id: "valid001", id_raw: "host:pane:/a", status: "working" });
    await post({ id: "bogus001", id_raw: "host:pane:/b", status: "lolwut" });
    await post({ id: "valid002", id_raw: "host:pane:/c", status: "approval" });
    await post({ id: "bogus002", id_raw: "host:pane:/d", status: "FUTURE_STATE" });
    await post({ id: "valid003", id_raw: "host:pane:/e", status: "success" });

    const stateRes = await fetch(`${baseUrl}/api/state`);
    expect(stateRes.status).toBe(200);
    const records = await stateRes.json();
    expect(records).toHaveLength(5);
    for (const rec of records) {
      expect(ALLOWED).toContain(rec.status);
    }
  });

  it("rejects a missing or non-string status with 4xx and records nothing", async () => {
    const post = (body) =>
      fetch(`${baseUrl}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const missing = await post({ id: "miss0001", id_raw: "host:pane:/m" });
    expect(missing.status).toBeGreaterThanOrEqual(400);
    expect(missing.status).toBeLessThan(500);

    const numeric = await post({ id: "num00001", id_raw: "host:pane:/n", status: 42 });
    expect(numeric.status).toBeGreaterThanOrEqual(400);
    expect(numeric.status).toBeLessThan(500);

    const nullish = await post({ id: "nul00001", id_raw: "host:pane:/x", status: null });
    expect(nullish.status).toBeGreaterThanOrEqual(400);
    expect(nullish.status).toBeLessThan(500);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    expect(stateRes.status).toBe(200);
    const records = await stateRes.json();
    expect(records).toHaveLength(0);
  });
});
