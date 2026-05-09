#!/usr/bin/env bash
# claude-display heartbeat hook.
#
# Reads Claude Code's hook stdin JSON payload, computes a stable per-session id
# from HOSTNAME + (TMUX_PANE | TTY | PPID-$PPID) + cwd, and POSTs an event to
# the local claude-display server. See docs/decisions/0001-heartbeat-stack.md.
#
# Resilient: exits 0 if the server is unreachable so a missing server never
# blocks or errors the Claude Code session.

set -u

stdin_payload="$(cat)"

# Extract `cwd` from the hook's stdin JSON. Bun is the locked runtime
# dependency for this project, so we use `bun -e` rather than taking on `jq`.
cwd="$(printf '%s' "$stdin_payload" | bun -e '
  const buf = await Bun.stdin.text();
  let cwd = "";
  try {
    const obj = JSON.parse(buf);
    if (obj && typeof obj.cwd === "string") cwd = obj.cwd;
  } catch {}
  process.stdout.write(cwd);
')"

pane_or_tty="${TMUX_PANE:-${TTY:-PPID-$PPID}}"
id_raw="${HOSTNAME}:${pane_or_tty}:${cwd}"
id="$(printf '%s' "$id_raw" | shasum -a 256 | cut -c1-8)"

url="${CLAUDE_DISPLAY_URL:-http://127.0.0.1:7878}/events"

# Capture the focused aerospace workspace at fire time (macOS-only WM). If the
# binary is missing, slow, or errors, the value is empty and the field is
# omitted from the payload — never a placeholder. The 500ms cap keeps the hook
# well under its overall ~2s budget even if curl below also times out.
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
  const [id, id_raw, status, desktop] = process.argv.slice(1);
  const payload = { id, id_raw, status };
  if (typeof desktop === "string" && desktop.length > 0) payload.desktop = desktop;
  process.stdout.write(JSON.stringify(payload));
' "$id" "$id_raw" "active" "$desktop")"

curl --silent --show-error \
  --max-time 1 --connect-timeout 1 \
  --fail \
  -H 'Content-Type: application/json' \
  -X POST \
  --data "$body" \
  "$url" >/dev/null 2>&1 || true

exit 0
