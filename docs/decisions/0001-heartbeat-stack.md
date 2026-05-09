# 0001 — Heartbeat tech stack

Status: Accepted (2026-05-09)

Locks the implementation tech for the heartbeat slice ([002] subtree): server runtime, hook→server transport, per-session identity, frontend approach. Sibling chores [010]–[012] cite this document instead of re-deciding.

Parent constraints (from [002] PRD): localhost-only, near-real-time, single-machine, low-friction setup.

## Server runtime

- Options considered: Bun, Node.js, Python (stdlib `http.server` or FastAPI), Go.
- Chosen: **Bun** — single-file `Bun.serve` script, JavaScript.
- Rationale: ties to the **low-friction** setup constraint. One runtime, one file, no `node_modules`, no build step, sub-100 ms startup. Built-in `Bun.serve` covers HTTP today and SSE/WebSocket when [005] needs them, so the runtime decision doesn't have to be revisited later. Bun is already provisioned on the user's machine via nix-darwin.
