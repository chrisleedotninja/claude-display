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
  // Boot block — wired up in Step 6.
}
