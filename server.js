// claude-display heartbeat server.
//
// Single-file Bun.serve script. State is an in-memory Map keyed by an opaque
// 8-char SHA-256 prefix supplied by the hook (see docs/decisions/0001).
//
// Exports `createServer({ port, hostname })` for tests; the bottom of the file
// boots the server on 127.0.0.1 when run directly via `bun run server.js`.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Static paths the server serves. Enumerated explicitly — no directory
// traversal: any GET path under /vendor/ outside this map returns 404.
const STATIC_FILES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/app.js": "app.js",
  "/styles.css": "styles.css",
  "/vendor/preact.module.js": "vendor/preact.module.js",
  "/vendor/htm.module.js": "vendor/htm.module.js",
};

export function createServer({ port = 0, hostname = "127.0.0.1" } = {}) {
  /** @type {Map<string, { id_raw?: string, status: string, last_event_at: number }>} */
  const state = new Map();

  /** @type {Set<ReadableStreamDefaultController>} */
  const subscribers = new Set();
  const sseEncoder = new TextEncoder();

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/api/state") {
        const records = Array.from(state.values());
        return Response.json(records);
      }

      if (req.method === "GET" && url.pathname === "/events/stream") {
        let registered;
        const stream = new ReadableStream({
          start(controller) {
            // Flush an initial SSE comment so the client sees the response
            // headers and the channel is observably open. The colon-prefix is
            // an SSE comment per the spec — clients ignore it.
            controller.enqueue(sseEncoder.encode(":\n\n"));
            registered = controller;
            subscribers.add(controller);
          },
          cancel() {
            if (registered) subscribers.delete(registered);
          },
        });
        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      if (req.method === "GET" && Object.hasOwn(STATIC_FILES, url.pathname)) {
        const file = Bun.file(join(here, STATIC_FILES[url.pathname]));
        if (await file.exists()) {
          return new Response(file);
        }
        return new Response("not found", { status: 404 });
      }

      if (req.method === "POST" && url.pathname === "/events") {
        let payload;
        try {
          payload = await req.json();
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        if (
          !payload ||
          typeof payload.id !== "string" ||
          typeof payload.status !== "string" ||
          payload.id.length === 0 ||
          payload.status.length === 0
        ) {
          return new Response("missing required fields", { status: 400 });
        }
        const record = {
          id: payload.id,
          id_raw: typeof payload.id_raw === "string" ? payload.id_raw : undefined,
          status: payload.status,
          last_event_at: Date.now(),
        };
        state.set(payload.id, record);

        // Broadcast synchronously to every connected SSE subscriber, in
        // insertion order, before responding. This is what guarantees that
        // every subscriber sees events in the same order — server-side
        // arrival order is the iteration order through `subscribers`.
        const frame = sseEncoder.encode(`data: ${JSON.stringify(record)}\n\n`);
        for (const controller of subscribers) {
          try {
            controller.enqueue(frame);
          } catch {
            // Subscriber's stream is no longer accepting writes; drop it.
            subscribers.delete(controller);
          }
        }

        return new Response(null, { status: 202 });
      }

      return new Response("not found", { status: 404 });
    },
  });

  return {
    server,
    stop() {
      return server.stop(true);
    },
  };
}

if (import.meta.main) {
  const port = Number(process.env.CLAUDE_DISPLAY_PORT) || 7878;
  const { server } = createServer({ port, hostname: "127.0.0.1" });
  console.log(`claude-display listening on http://${server.hostname}:${server.port}`);
}
