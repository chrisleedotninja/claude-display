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

url="${CLAUDE_DISPLAY_URL:-http://127.0.0.1:7878}/events"

if [ -n "$parent_tool_use_id" ]; then
  # Subagent fire — the shell-derived id is the parent's id; derive a
  # subagent id from `(parent_id, parent_tool_use_id)` per ADR 0002.
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
  # Top-level fire — preserve existing behavior exactly.
  id="$shell_id"
  id_raw="$shell_id_raw"
  body="$(bun -e '
    const [id, id_raw, status] = process.argv.slice(1);
    process.stdout.write(JSON.stringify({ id, id_raw, status }));
  ' "$id" "$id_raw" "active")"
fi

curl --silent --show-error \
  --max-time 1 --connect-timeout 1 \
  --fail \
  -H 'Content-Type: application/json' \
  -X POST \
  --data "$body" \
  "$url" >/dev/null 2>&1 || true

exit 0
