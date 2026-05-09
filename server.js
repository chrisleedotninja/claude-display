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

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/api/state") {
        // Materialize each record's subagents Map as an array on the wire.
        // The internal storage uses a Map for replace-on-duplicate semantics;
        // the JSON shape is a plain array so existing consumers see a stable
        // top-level record shape with an additive `subagents` array.
        const records = Array.from(state.values()).map((rec) => ({
          ...rec,
          subagents: Array.from(rec.subagents.values()),
        }));
        return Response.json(records);
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
        // Optional `parent_id` (subagent linkage, ADR 0002): when present, it
        // must be a non-empty string. Wrong-type values are 4xx with no state
        // mutation. Absence is still legal — top-level events have no
        // parent_id at all.
        if (
          Object.hasOwn(payload, "parent_id") &&
          (typeof payload.parent_id !== "string" || payload.parent_id.length === 0)
        ) {
          return new Response("invalid parent_id", { status: 400 });
        }
        const now = Date.now();
        const subagentRecord = {
          id: payload.id,
          id_raw: typeof payload.id_raw === "string" ? payload.id_raw : undefined,
          status: payload.status,
          last_event_at: now,
        };
        // Subagent linkage: if the event names a known parent, nest under it
        // and do not create a top-level slot for the subagent. Orphan handling
        // (parent_id present but unknown) is locked separately by ADR 0002 and
        // covered by a later step.
        if (typeof payload.parent_id === "string" && state.has(payload.parent_id)) {
          const parent = state.get(payload.parent_id);
          parent.subagents.set(payload.id, subagentRecord);
          return new Response(null, { status: 202 });
        }
        const record = {
          id: payload.id,
          id_raw: subagentRecord.id_raw,
          status: payload.status,
          last_event_at: now,
          subagents: state.get(payload.id)?.subagents ?? new Map(),
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
