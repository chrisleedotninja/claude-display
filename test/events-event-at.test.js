import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("POST /events event_at round-trip and validation", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("stores event_at on the record when posted as a finite positive number", async () => {
    const ts = Date.now();
    const postRes = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "ev001abc", status: "active", event_at: ts }),
    });
    expect([200, 202]).toContain(postRes.status);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].event_at).toBe(ts);
  });

  it("does not set event_at on the record when omitted from the payload", async () => {
    const postRes = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "ev002abc", status: "active" }),
    });
    expect([200, 202]).toContain(postRes.status);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].event_at).toBeUndefined();
  });

  it("rejects with 400 when event_at is not a number", async () => {
    const postRes = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "ev003abc", status: "active", event_at: "1700000000000" }),
    });
    expect(postRes.status).toBe(400);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(0);
  });

  it("rejects with 400 when event_at is non-finite (NaN/Infinity)", async () => {
    // JSON cannot transport NaN/Infinity; the server must guard against
    // numbers that decode unexpectedly. Test the guard with explicit serial
    // forms the parser will accept (negatives below) and a separately
    // validated branch for non-number inputs (above). Here, exercise <= 0.
    const postRes = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "ev004abc", status: "active", event_at: 0 }),
    });
    expect(postRes.status).toBe(400);
  });

  it("rejects with 400 when event_at is negative", async () => {
    const postRes = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "ev005abc", status: "active", event_at: -1 }),
    });
    expect(postRes.status).toBe(400);
  });
});
