import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("POST /events with a desktop field", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  const post = (body) =>
    fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("round-trips a non-empty desktop string through GET /api/state", async () => {
    const res = await post({
      id: "ddd44444",
      id_raw: "host:pane:/d",
      status: "active",
      desktop: "code",
    });
    expect([200, 202]).toContain(res.status);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("ddd44444");
    expect(records[0].desktop).toBe("code");
  });

  it("omits desktop on the record when the payload has no desktop field", async () => {
    const res = await post({
      id: "eee55555",
      id_raw: "host:pane:/e",
      status: "active",
    });
    expect([200, 202]).toContain(res.status);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].desktop).toBeUndefined();
  });

  it("omits desktop on the record when the payload has an empty-string desktop", async () => {
    const res = await post({
      id: "fff66666",
      id_raw: "host:pane:/f",
      status: "active",
      desktop: "",
    });
    expect([200, 202]).toContain(res.status);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].desktop).toBeUndefined();
  });
});
