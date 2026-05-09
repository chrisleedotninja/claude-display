// claude-display heartbeat server.
//
// Single-file Bun.serve script. State is an in-memory Map keyed by an opaque
// 8-char SHA-256 prefix supplied by the hook (see docs/decisions/0001).
//
// Exports `createServer({ port, hostname })` for tests; the bottom of the file
// boots the server on 127.0.0.1 when run directly via `bun run server.js`.

export function createServer({ port = 0, hostname = "127.0.0.1" } = {}) {
  /** @type {Map<string, { id_raw?: string, status: string, last_event_at: number }>} */
  const state = new Map();

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/api/state") {
        const records = Array.from(state.values());
        return Response.json(records);
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
