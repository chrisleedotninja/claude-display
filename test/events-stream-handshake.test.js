import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("GET /events/stream handshake", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("returns 200 with text/event-stream and stays open until the client cancels", async () => {
    const ac = new AbortController();
    const res = await fetch(`${baseUrl}/events/stream`, { signal: ac.signal });

    expect(res.status).toBe(200);
    const ctype = res.headers.get("content-type") || "";
    expect(ctype.toLowerCase().startsWith("text/event-stream")).toBe(true);

    // The body must remain open: a brief read with a timeout should yield no
    // end-of-stream signal. We race a short timer against a single read.
    const reader = res.body.getReader();
    const readPromise = reader.read();
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve("timeout"), 200),
    );
    const result = await Promise.race([
      readPromise.then((r) => (r.done ? "closed" : "open")),
      timeoutPromise,
    ]);

    // We expect the stream to still be open (timeout fires first, or a frame
    // arrives but the stream is not done). What we must NOT see is the stream
    // closing on its own immediately after the handshake.
    expect(result === "timeout" || result === "open").toBe(true);

    // Cleanup: cancel from the client side; this also drops the server-side
    // subscription via the ReadableStream's `cancel` callback.
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
    ac.abort();
  });
});
