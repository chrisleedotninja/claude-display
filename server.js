// claude-display heartbeat server.
//
// Single-file Bun.serve script. State is an in-memory Map keyed by an opaque
// 8-char SHA-256 prefix supplied by the hook (see docs/decisions/0001).
//
// Exports `createServer({ port, hostname })` for tests; the bottom of the file
// boots the server on 127.0.0.1 when run directly via `bun run server.js`.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "./logger.js";

const here = dirname(fileURLToPath(import.meta.url));

// The eight allowed status values. Settled in parent specs [001] and [004];
// see also chore [017]. Anything outside this set is coerced to "idle" at
// ingest so the read endpoint never surfaces an arbitrary string.
const ALLOWED_STATUSES = Object.freeze(
  new Set([
    "approval",
    "waiting",
    "blocked",
    "working",
    "tests",
    "reviewing",
    "success",
    "idle",
  ]),
);

// The seven allowed `needs` values. Wire enum settled in parent spec [006]
// and ADR sibling [031]. Anything outside this set (wrong type, empty
// string, unknown value) is dropped silently at ingest — the record stores
// no `needs` key in that case rather than 4xx-rejecting the whole event,
// so a hook that sends a typo never blocks the rest of the payload from
// updating the card. This is the *opposite* of `parent_id` validation.
const ALLOWED_NEEDS = Object.freeze(
  new Set([
    "approve-tool",
    "answer-question",
    "provide-input",
    "pick-option",
    "confirm-destructive",
    "resolve-conflict",
    "review-diff",
  ]),
);

// Static paths the server serves. Enumerated explicitly — no directory
// traversal: any GET path under /vendor/ outside this map returns 404.
const STATIC_FILES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/app.js": "app.js",
  "/styles.css": "styles.css",
  "/status-tokens.js": "status-tokens.js",
  "/status-tones.js": "status-tones.js",
  "/tweaks-persistence.js": "tweaks-persistence.js",
  "/needs-tokens.js": "needs-tokens.js",
  "/vendor/preact.module.js": "vendor/preact.module.js",
  "/vendor/htm.module.js": "vendor/htm.module.js",
};

export function createServer({ port = 0, hostname = "127.0.0.1", logger = null } = {}) {
  /** @type {Map<string, { id_raw?: string, status: string, event_at?: number }>} */
  const state = new Map();

  /** @type {Set<ReadableStreamDefaultController>} */
  const subscribers = new Set();
  const sseEncoder = new TextEncoder();

  // Inner handler factored so the outer Bun.serve `fetch` can wrap the
  // response with one summary log line per request (method, path, status).
  async function handle(req) {
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
            if (logger) logger.log(`sse connect (subscribers=${subscribers.size})`);
          },
          cancel() {
            if (registered) subscribers.delete(registered);
            if (logger) logger.log(`sse disconnect (subscribers=${subscribers.size})`);
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
        if (!payload || typeof payload !== "object") {
          return new Response("missing required fields", { status: 400 });
        }
        // Pre-registration branch (chore [068], sibling [067]). The hook
        // announces a subagent's existence before it has any activity to
        // report — most importantly so the server's record carries the
        // `instance` field by the time the eventual first activity POST
        // (which does not re-send `instance`) merges onto it. Short-circuits
        // before the existing `status` required-fields gate because
        // pre-registration carries no `status` at all.
        if (payload.kind === "pre-register") {
          if (
            typeof payload.id !== "string" ||
            payload.id.length === 0 ||
            typeof payload.parent_id !== "string" ||
            payload.parent_id.length === 0
          ) {
            return new Response("missing required fields", { status: 400 });
          }
          const subRecord = {
            id: payload.id,
            id_raw: typeof payload.id_raw === "string" ? payload.id_raw : undefined,
          };
          if (
            typeof payload.instance === "string" &&
            payload.instance.length > 0
          ) {
            subRecord.instance = payload.instance;
          }
          let parent = state.get(payload.parent_id);
          if (!parent) {
            // Orphan rule (ADR 0002): create a placeholder top-level record
            // so the pre-registered subagent has somewhere to nest. No scalar
            // fields populated because the pre-register payload sent none.
            parent = {
              id: payload.parent_id,
              subagents: new Map(),
              last_event_at: Date.now(),
            };
            state.set(payload.parent_id, parent);
          }
          parent.subagents.set(payload.id, subRecord);
          return new Response(null, { status: 202 });
        }
        if (
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
        // Optional repo/branch must be strings when present. Absent or empty
        // is fine — the dashboard renders nothing rather than a placeholder.
        if (
          (payload.repo !== undefined && typeof payload.repo !== "string") ||
          (payload.branch !== undefined && typeof payload.branch !== "string")
        ) {
          return new Response("invalid repo or branch", { status: 400 });
        }
        // Optional event_at must be a finite positive number when present.
        // The hook captures it at fire time as integer ms since the Unix
        // epoch; see docs/decisions/0002-elapsed-time-anchor.md.
        if (
          payload.event_at !== undefined &&
          (typeof payload.event_at !== "number" ||
            !Number.isFinite(payload.event_at) ||
            payload.event_at <= 0)
        ) {
          return new Response("invalid event_at", { status: 400 });
        }
        // End-event branch (ADR 0002, [020]): when `parent_id` is present and
        // `status === "idle"`, the event is a SubagentStop signal — remove the
        // subagent record from the named parent rather than upserting. Orphan
        // posture for end events is "tolerated, no state mutation": if either
        // the parent or the subagent is unknown, the call is a no-op.
        if (
          typeof payload.parent_id === "string" &&
          payload.status === "idle"
        ) {
          const parent = state.get(payload.parent_id);
          if (parent) {
            parent.subagents.delete(payload.id);
          }
          return new Response(null, { status: 202 });
        }
        // Subagent activity: nest under the named parent when known. Orphan
        // (parent_id present but unknown) falls through to the top-level
        // record path per ADR 0002. Subagent records carry a server-derived
        // `last_event_at` (chores 027–029 contract); the top-level path uses
        // the payload-supplied `event_at` instead.
        if (typeof payload.parent_id === "string" && state.has(payload.parent_id)) {
          const parent = state.get(payload.parent_id);
          const now = Date.now();
          // Merge over any prior subagent record under the same id (notably
          // one created by the pre-register branch carrying `instance`)
          // rather than building from scratch — the activity post does not
          // re-send `instance`, so wholesale replace would drop it. The
          // freshly-built fields (status, last_event_at, id_raw) overlay the
          // prior values; previously-set optional fields survive the merge.
          const prior = parent.subagents.get(payload.id);
          const subRecord = {
            ...(prior ?? {}),
            id: payload.id,
            id_raw: typeof payload.id_raw === "string" ? payload.id_raw : prior?.id_raw,
            status: payload.status,
            last_event_at: now,
          };
          // Optional `needs`: silent-drop on any invalid value (wrong type,
          // empty string, value outside the frozen allow-list). Identical
          // posture to the top-level path's `needs` block below — the
          // record simply has no `needs` key in that case rather than a 4xx.
          if (
            typeof payload.needs === "string" &&
            ALLOWED_NEEDS.has(payload.needs)
          ) {
            subRecord.needs = payload.needs;
          }
          parent.subagents.set(payload.id, subRecord);
          // Bump the parent's own `last_event_at` so the most-recent-first
          // sort in `cardsFromState` (chore [015]) ranks the parent at the
          // top, carrying its nested subagents along (chore [030]).
          parent.last_event_at = now;
          return new Response(null, { status: 202 });
        }
        const record = {
          id: payload.id,
          id_raw: typeof payload.id_raw === "string" ? payload.id_raw : undefined,
          status: ALLOWED_STATUSES.has(payload.status) ? payload.status : "idle",
          session_label:
            typeof payload.session_label === "string" && payload.session_label.length > 0
              ? payload.session_label
              : undefined,
          subagents: state.get(payload.id)?.subagents ?? new Map(),
          last_event_at: Date.now(),
        };
        if (typeof payload.repo === "string") record.repo = payload.repo;
        if (typeof payload.branch === "string") record.branch = payload.branch;
        if (typeof payload.desktop === "string" && payload.desktop.length > 0) {
          record.desktop = payload.desktop;
        }
        if (typeof payload.instance === "string" && payload.instance.length > 0) {
          record.instance = payload.instance;
        }
        if (typeof payload.title === "string" && payload.title.length > 0) {
          record.title = payload.title;
        }
        if (typeof payload.detail === "string" && payload.detail.length > 0) {
          record.detail = payload.detail;
        }
        if (
          typeof payload.event_at === "number" &&
          Number.isFinite(payload.event_at) &&
          payload.event_at > 0
        ) {
          record.event_at = payload.event_at;
        }
        // Optional `needs`: drop silently on any invalid value (wrong type,
        // empty string, value outside the frozen allow-list). The record
        // simply has no `needs` key in that case — mirrors the
        // repo/branch/desktop/event_at conditional-assign pattern above.
        if (
          typeof payload.needs === "string" &&
          ALLOWED_NEEDS.has(payload.needs)
        ) {
          record.needs = payload.needs;
        }
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
  }

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req) {
      const url = new URL(req.url);
      const res = await handle(req);
      if (logger) {
        logger.log(`${req.method} ${url.pathname} ${res.status}`);
      }
      return res;
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
  const logPath = process.env.CLAUDE_DISPLAY_LOG_PATH || "/tmp/claude-display.log";
  const logger = createLogger({ path: logPath });
  const { server } = createServer({ port, hostname: "127.0.0.1", logger });
  logger.log(`claude-display listening on http://${server.hostname}:${server.port}`);
}
