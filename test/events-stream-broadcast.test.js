import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

// Read SSE frames out of a fetched response body, returning at most `count`
// parsed JSON payloads from `data:` lines. Resolves once `count` frames are
// seen, or rejects on timeout (defensive against a hang).
async function readFrames(res, count, timeoutMs = 2000) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const frames = [];

  const deadline = Date.now() + timeoutMs;
  while (frames.length < count) {
    const remain = deadline - Date.now();
    if (remain <= 0) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      throw new Error(
        `readFrames: timed out after ${timeoutMs}ms with ${frames.length}/${count} frames`,
      );
    }
    const readP = reader.read();
    const timeoutP = new Promise((resolve) =>
      setTimeout(() => resolve({ __timeout: true }), remain),
    );
    const result = await Promise.race([readP, timeoutP]);
    if (result.__timeout) continue;
    if (result.done) break;
    buf += decoder.decode(result.value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      // Pull `data:` lines out of the block; ignore comments (`:` lines)
      // and any other field. Concatenate multi-line `data:` per SSE spec.
      const dataLines = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).replace(/^ /, ""));
        }
      }
      if (dataLines.length > 0) {
        frames.push(JSON.parse(dataLines.join("\n")));
        if (frames.length >= count) break;
      }
    }
  }
  try {
    await reader.cancel();
  } catch {
    // ignore
  }
  return frames;
}

async function postEvent(baseUrl, body) {
  const res = await fetch(`${baseUrl}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  expect([200, 202]).toContain(res.status);
  return res;
}

describe("POST /events broadcasts over GET /events/stream", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("delivers a single posted event to a connected subscriber as a parsable record frame", async () => {
    const subRes = await fetch(`${baseUrl}/events/stream`);
    expect(subRes.status).toBe(200);

    // Tiny delay so the subscriber controller is registered before POST.
    await new Promise((r) => setTimeout(r, 50));

    await postEvent(baseUrl, {
      id: "abc12345",
      id_raw: "host:pane:/cwd",
      status: "working",
    });

    const [frame] = await readFrames(subRes, 1);
    expect(frame.id).toBe("abc12345");
    expect(frame.id_raw).toBe("host:pane:/cwd");
    expect(frame.status).toBe("working");
    expect(typeof frame.last_event_at).toBe("number");
  });

  it("delivers two posted events to two concurrent subscribers in server-side arrival order", async () => {
    const sub1 = await fetch(`${baseUrl}/events/stream`);
    const sub2 = await fetch(`${baseUrl}/events/stream`);
    expect(sub1.status).toBe(200);
    expect(sub2.status).toBe(200);

    // Wait for both subscriber controllers to register before POSTing.
    await new Promise((r) => setTimeout(r, 50));

    await postEvent(baseUrl, { id: "aaaaaaaa", id_raw: "host:pane:/a", status: "working" });
    await postEvent(baseUrl, { id: "bbbbbbbb", id_raw: "host:pane:/b", status: "waiting" });

    const [framesA, framesB] = await Promise.all([
      readFrames(sub1, 2),
      readFrames(sub2, 2),
    ]);

    expect(framesA.map((f) => f.id)).toEqual(["aaaaaaaa", "bbbbbbbb"]);
    expect(framesB.map((f) => f.id)).toEqual(["aaaaaaaa", "bbbbbbbb"]);
    expect(framesA[0].status).toBe("working");
    expect(framesA[1].status).toBe("waiting");
    expect(framesB[0].status).toBe("working");
    expect(framesB[1].status).toBe("waiting");
  });
});
