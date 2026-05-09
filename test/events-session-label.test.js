import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("POST /events session_label round-trip", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("stores session_label on the record when posted as a non-empty string", async () => {
    const postRes = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "sl001abc",
        id_raw: "host:pane:/cwd",
        status: "active",
        session_label: "my-tmux-session",
      }),
    });
    expect([200, 202]).toContain(postRes.status);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    expect(stateRes.status).toBe(200);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("sl001abc");
    expect(records[0].session_label).toBe("my-tmux-session");
  });

  it("does not set session_label on the record when omitted from the payload", async () => {
    const postRes = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "sl002abc",
        id_raw: "host:pane:/cwd",
        status: "active",
      }),
    });
    expect([200, 202]).toContain(postRes.status);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].session_label).toBeUndefined();
  });

  it("does not set session_label when the field is an empty string", async () => {
    const postRes = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "sl003abc",
        status: "active",
        session_label: "",
      }),
    });
    expect([200, 202]).toContain(postRes.status);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const records = await stateRes.json();
    expect(records).toHaveLength(1);
    expect(records[0].session_label).toBeUndefined();
  });
});
