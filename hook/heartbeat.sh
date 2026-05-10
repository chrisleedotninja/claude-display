#!/usr/bin/env bash
# claude-display heartbeat hook.
#
# Reads Claude Code's hook stdin JSON payload, computes a stable per-session id
# from HOSTNAME + (TMUX_PANE | TTY | PPID-$PPID) + cwd, and POSTs an event to
# the local claude-display server. See docs/decisions/0001-heartbeat-stack.md.
#
# When the stdin JSON's `parent_tool_use_id` field is non-null, the hook is
# firing inside a Task-tool subagent (see docs/decisions/0002). The shell-
# derived id is then the *parent's* id; this hook's own id is derived from
# `(parent_id, parent_tool_use_id)` so each Task invocation gets a stable
# per-invocation subagent id under the same parent.
#
# Resilient: exits 0 if the server is unreachable so a missing server never
# blocks or errors the Claude Code session.

set -u

stdin_payload="$(cat)"

# Extract `cwd` and `parent_tool_use_id` from the hook's stdin JSON. Bun is
# the locked runtime dependency for this project, so we use `bun -e` rather
# than taking on `jq`. Each field is read by a separate invocation — combining
# fields into one capture is fragile because command substitution strips
# trailing newlines, which collapses an "absent second field" case.
extract_field() {
  local field="$1"
  printf '%s' "$stdin_payload" | bun -e '
    const field = process.argv[1];
    const buf = await Bun.stdin.text();
    let v = "";
    try {
      const obj = JSON.parse(buf);
      if (obj && typeof obj[field] === "string") v = obj[field];
    } catch {}
    process.stdout.write(v);
  ' "$field"
}
cwd="$(extract_field cwd)"
parent_tool_use_id="$(extract_field parent_tool_use_id)"
hook_event_name="$(extract_field hook_event_name)"

pane_or_tty="${TMUX_PANE:-${TTY:-PPID-$PPID}}"
shell_id_raw="${HOSTNAME}:${pane_or_tty}:${cwd}"
shell_id="$(printf '%s' "$shell_id_raw" | shasum -a 256 | cut -c1-8)"

# Derive repo (basename of git toplevel) and branch from cwd. Both are empty
# when cwd is not inside a git repo or git is unavailable — never a placeholder
# like "unknown" (the dashboard renders nothing in that case). git's stderr is
# suppressed so a missing/unhelpful git invocation never noises up the hook.
repo=""
branch=""
if [ -n "$cwd" ]; then
  toplevel="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$toplevel" ]; then
    repo="$(basename "$toplevel")"
    branch="$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    # "HEAD" indicates a detached HEAD without a named ref — emit empty rather
    # than a literal "HEAD" placeholder, consistent with the empty-fallback rule.
    if [ "$branch" = "HEAD" ]; then
      branch=""
    fi
  fi
fi

# Capture a human-readable session label at fire time so the dashboard never
# shells out to tmux/cmux when rendering. Prefer tmux's own `display-message`
# when running inside tmux; fall back to a CMUX_* env hint when not.
session_label=""
if [ -n "${TMUX_PANE:-}" ]; then
  session_label="$(tmux display-message -p -t "$TMUX_PANE" '#S' 2>/dev/null || true)"
elif [ -n "${CMUX_WORKSPACE_NAME:-}" ]; then
  session_label="$CMUX_WORKSPACE_NAME"
fi

url="${CLAUDE_DISPLAY_URL:-http://127.0.0.1:7878}/events"

if [ -n "$parent_tool_use_id" ]; then
  # Subagent fire — the shell-derived id is the parent's id; derive a
  # subagent id from `(parent_id, parent_tool_use_id)` per ADR 0002. The
  # subagent payload is minimal (id/id_raw/parent_id/status); the server
  # derives `last_event_at` itself for subagent records.
  parent_id="$shell_id"
  id_raw="${parent_id}:${parent_tool_use_id}"
  id="$(printf '%s' "$id_raw" | shasum -a 256 | cut -c1-8)"
  # SubagentStop hook event signals the subagent has finished — emit the
  # end-flavored payload (status: "idle") so the server removes the
  # subagent record. All other subagent fires are activity events.
  if [ "$hook_event_name" = "SubagentStop" ]; then
    sub_status="idle"
  else
    sub_status="active"
  fi
  body="$(bun -e '
    const [id, id_raw, parent_id, status] = process.argv.slice(1);
    process.stdout.write(JSON.stringify({ id, id_raw, parent_id, status }));
  ' "$id" "$id_raw" "$parent_id" "$sub_status")"
else
  # Top-level fire — capture full card metadata (elapsed-time anchor +
  # aerospace desktop) before building the payload.
  id="$shell_id"
  id_raw="$shell_id_raw"
  # Capture the elapsed-time anchor at fire time as integer milliseconds since
  # the Unix epoch. The hook owns this timestamp so the dashboard never has to
  # derive it later. See docs/decisions/0002-elapsed-time-anchor.md.
  event_at="$(bun -e 'process.stdout.write(String(Date.now()))')"
  # Capture the focused aerospace workspace at fire time (macOS-only WM). If
  # the binary is missing, slow, or errors, the value is empty and the field
  # is omitted from the payload — never a placeholder. The 500ms cap keeps the
  # hook well under its overall ~2s budget even if curl below also times out.
  desktop="$(bun -e '
    if (!Bun.which("aerospace")) { process.exit(0); }
    const proc = Bun.spawn(["aerospace", "list-workspaces", "--focused"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const killer = setTimeout(() => { try { proc.kill(); } catch {} }, 500);
    const exitCode = await proc.exited;
    clearTimeout(killer);
    if (exitCode !== 0) process.exit(0);
    const out = (await new Response(proc.stdout).text()).trim();
    if (out.length > 0) process.stdout.write(out);
  ')"

  body="$(bun -e '
    const [id, id_raw, status, repo, branch, session_label, desktop, event_at] = process.argv.slice(1);
    const payload = { id, id_raw, status, repo, branch, event_at: Number(event_at) };
    if (typeof session_label === "string" && session_label.length > 0) {
      payload.session_label = session_label;
    }
    if (typeof desktop === "string" && desktop.length > 0) {
      payload.desktop = desktop;
    }
    process.stdout.write(JSON.stringify(payload));
  ' "$id" "$id_raw" "active" "$repo" "$branch" "$session_label" "$desktop" "$event_at")"
fi

curl --silent --show-error \
  --max-time 1 --connect-timeout 1 \
  --fail \
  -H 'Content-Type: application/json' \
  -X POST \
  --data "$body" \
  "$url" >/dev/null 2>&1 || true

exit 0
