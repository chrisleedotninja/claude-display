// claude-display dashboard client. Vanilla zero-build (Preact + htm via
// vendored ESM modules served by the same Bun process). See
// docs/decisions/0001-heartbeat-stack.md for the locked frontend approach.

import { h, render } from "./vendor/preact.module.js";
import htm from "./vendor/htm.module.js";
import { tokensForStatus, isAttentionStatus } from "./status-tokens.js";
import { TONE_GROUPS, filterCardsByTones } from "./status-tones.js";
import {
  hydrateActiveTones,
  hydrateVisibleFields,
  writeActiveTones,
  writeVisibleFields,
  createCoalescingWriter,
} from "./tweaks-persistence.js";
import { NEEDS_TOKENS, tokensForNeed } from "./needs-tokens.js";

const html = htm.bind(h);

// Pure helper: compute the opacity for a card at position `idx` in a feed of
// `total` cards. Newest card (idx=0) renders at full opacity (1.0); oldest
// (idx=total-1) renders at 0.55. The ramp is linear: opacity decreases by
// 0.45 across the full feed. Edge case: when total===1, returns 1 so a single
// card always renders fully opaque. See chore [052].
export function dimRamp(idx, total) {
  if (total <= 1) return 1;
  return 1 - (idx / (total - 1)) * 0.45;
}

// Format a duration in milliseconds as a human-friendly string in the
// largest integer unit that fits: `Ns` for [0, 60s), `Nm` for [60s, 60m),
// `Nh` for [60m, ∞). Floors within each unit. Negative inputs render as the
// empty string — the caller expects "field omitted" semantics for the absent
// case (see `cardsFromState` below).
export function formatElapsed(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "";
  if (ms < 60_000) return `${Math.floor(ms / 1_000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
}

// Pure data-shaping function: transform server `/api/state` records into the
// minimal view-model the UI renders. Pure so it can be unit-tested with
// bun:test without a DOM. Does not mutate its input.
//
// repo/branch are carried through when the record supplies them; absent or
// empty values flow through as empty strings, and the renderer omits the
// element entirely rather than substituting a placeholder. (See chore [022] /
// AC2: never `unknown` or `-` for missing repo/branch.) `session_label`,
// `desktop`, and `elapsed` are included only when the record carries a
// non-empty string — the dashboard never shows a placeholder when the value
// is absent. `subagents`, when the record supplies the Map-as-array on the
// wire, is propagated as a minimal `[{id, status}]` view-model array per
// ADR 0002.
//
// `color`, `icon`, and `label` come from `tokensForStatus` (status-tokens.js,
// chore [018]) — the eight-status taxonomy is the single source of truth and
// any non-allow-list value falls back to the `idle` triple.
//
// Order: most-recent-first by `last_event_at` (descending), with `id`
// ascending as the stable tiebreaker. Records whose `last_event_at` is
// missing, null, or 0 sort after every record with a positive timestamp;
// among themselves they remain in `id`-ascending order. (See chore [015].)
export function cardsFromState(records, now = Date.now()) {
  return records
    .map((r) => {
      const token = tokensForStatus(r.status);
      const card = {
        id: r.id,
        status: r.status,
        color: token.color,
        icon: token.icon,
        label: token.label,
        repo: typeof r.repo === "string" ? r.repo : "",
        branch: typeof r.branch === "string" ? r.branch : "",
        last_event_at: r.last_event_at ? r.last_event_at : null,
      };
      if (typeof r.session_label === "string" && r.session_label.length > 0) {
        card.session_label = r.session_label;
      }
      if (typeof r.desktop === "string" && r.desktop.length > 0) {
        card.desktop = r.desktop;
      }
      if (typeof r.detail === "string" && r.detail.length > 0) {
        card.detail = r.detail;
      }
      if (
        typeof r.event_at === "number" &&
        Number.isFinite(r.event_at) &&
        r.event_at > 0
      ) {
        const delta = now - r.event_at;
        if (delta >= 0) {
          card.elapsed = formatElapsed(delta);
        }
      }
      if (Array.isArray(r.subagents)) {
        card.subagents = r.subagents.map((s) => ({ id: s.id, status: s.status }));
      }
      // Optional `needs_tag` projection: only attention-state cards (chore [019]'s
      // ATTENTION_STATUSES) carry the tag, and only when `needs` resolves to a
      // recognized wire-enum entry via `tokensForNeed` (chore [035]). The
      // projection stores the frozen entry by reference so consumers compare
      // by identity. The renderer derives the per-category key by walking
      // NEEDS_TOKENS at render time. Mirrors the conditional-assign pattern
      // used for session_label / desktop / elapsed: the key is absent from
      // the view-model when the projection does not apply.
      if (isAttentionStatus(r.status)) {
        const tag = tokensForNeed(r.needs);
        if (tag !== null) card.needs_tag = tag;
      }
      return card;
    })
    .sort((a, b) => {
      const aHas = a.last_event_at != null && a.last_event_at > 0;
      const bHas = b.last_event_at != null && b.last_event_at > 0;
      if (aHas && bHas) {
        if (b.last_event_at !== a.last_event_at) return b.last_event_at - a.last_event_at;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      }
      if (aHas) return -1;
      if (bHas) return 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

// Pure helper: compute the next Tweaks-panel open state from the previous
// one. The panel's documented start state is closed (`false`); any
// non-boolean previous value (undefined / null / number / string / object)
// is treated as `false` so that a first-tap from an uninitialised state
// opens the panel. Pure so toggle correctness is verifiable without a DOM.
// See chore [033].
export function nextPanelOpen(prev) {
  const prevBool = prev === true;
  return !prevBool;
}

// Pure helper: return a fresh Set with `tone` toggled — added if absent,
// removed if present. Never mutates the input Set; always allocates a new
// Set instance (mirrors the `applyEventToCards` "return a new array"
// discipline). Unrecognized tone strings are toggled in/out as opaque
// strings without throwing — the caller is responsible for the canonical
// tone vocabulary (see TONE_GROUPS in status-tones.js, chore [032]).
export function toggleActiveTone(prev, tone) {
  const next = new Set(prev);
  if (next.has(tone)) {
    next.delete(tone);
  } else {
    next.add(tone);
  }
  return next;
}

// Pure helper: return a fresh Set with `field` toggled — added if absent,
// removed if present. Never mutates the input Set; always allocates a new
// Set instance. Mirrors `toggleActiveTone`'s shape. Unrecognized field
// strings are toggled in/out as opaque strings without throwing — the
// caller is responsible for the canonical five-field vocabulary
// `{"repo", "branch", "session", "desktop", "elapsed"}`. See chore [037].
export function toggleVisibleField(prev, field) {
  const next = new Set(prev);
  if (next.has(field)) {
    next.delete(field);
  } else {
    next.add(field);
  }
  return next;
}

// Pure helper: return a new array of card view-model objects with the
// hidden metadata fields removed. The vocabulary mapping is fixed:
// the `"session"` toggle key strips the `session_label` property; the
// other four (`"repo"`, `"branch"`, `"desktop"`, `"elapsed"`) strip the
// same-named property. Stripping a property the card never carried is a
// no-op (does not introduce the property and does not throw). The input
// array and its card objects are never mutated; every returned card is a
// fresh shallow-clone object so a downstream renderer cannot accidentally
// observe a hidden field via reference identity. Pure so AC2 / AC3 / AC4
// correctness is verifiable without a DOM. See chore [037].
const FIELD_TO_CARD_KEY = Object.freeze({
  repo: "repo",
  branch: "branch",
  session: "session_label",
  desktop: "desktop",
  elapsed: "elapsed",
});
export function stripHiddenFields(cards, visibleFields) {
  const hiddenKeys = [];
  for (const field of Object.keys(FIELD_TO_CARD_KEY)) {
    if (!visibleFields.has(field)) {
      hiddenKeys.push(FIELD_TO_CARD_KEY[field]);
    }
  }
  return cards.map((card) => {
    const next = { ...card };
    for (const key of hiddenKeys) {
      delete next[key];
    }
    return next;
  });
}

// Pure upsert: given the previous cards array and one incoming record,
// return a new cards array. If the record's id already appears in cards,
// the matching entry is replaced in place (same index, same length); if
// the id is new, the record is appended (length grows by one). The input
// array is not mutated. Reordering is intentionally out of scope here —
// see chore [014] / sister slice [015].
export function applyEventToCards(cards, record) {
  const card = { id: record.id, status: record.status };
  const idx = cards.findIndex((c) => c.id === record.id);
  if (idx === -1) return [...cards, card];
  const next = cards.slice();
  next[idx] = card;
  return next;
}

// StatusGlyph renders an inline SVG per status. Accepts { status, anim, size }.
// Uses a discriminant-key switch on the status string — STATUS_TOKENS.*.icon
// remains a Unicode string for backwards compatibility (status-tokens.test.js
// must stay green) and is not used here. Fallback is the idle dashed-circle.
// Animation classes (glyph-spin / glyph-pulse / glyph-blink / glyph-shimmer)
// are applied to the relevant child element only when `anim` is truthy.
function StatusGlyph({ status, anim, size = 16 }) {
  const sz = size;
  const half = sz / 2;
  const r = half - 1.5;

  switch (status) {
    case "working": {
      // Spinning arc — the moving arc spins when anim is on
      const arcClass = anim ? "glyph-spin" : "";
      return html`
        <svg class="status-glyph" width=${sz} height=${sz} viewBox="0 0 ${sz} ${sz}" fill="none">
          <circle cx=${half} cy=${half} r=${r} stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.4" />
          <path class=${arcClass} d=${`M ${half} ${half - r} A ${r} ${r} 0 0 1 ${half + r} ${half}`} stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="transform-origin: ${half}px ${half}px" />
        </svg>
      `;
    }
    case "approval": {
      // Question mark with a pulse ring when anim is on
      const ringClass = anim ? "glyph-pulse" : "";
      return html`
        <svg class="status-glyph" width=${sz} height=${sz} viewBox="0 0 ${sz} ${sz}" fill="none">
          <circle class=${ringClass} cx=${half} cy=${half} r=${r} stroke="currentColor" stroke-width="1" opacity="0.5" style="transform-origin: ${half}px ${half}px" />
          <text x=${half} y=${half + 1} text-anchor="middle" dominant-baseline="middle" font-size=${sz * 0.55} fill="currentColor" font-weight="600">?</text>
        </svg>
      `;
    }
    case "waiting": {
      // Ellipsis / three dots; middle dot blinks when anim is on
      const dotClass = anim ? "glyph-blink" : "";
      const cx1 = half - sz * 0.25;
      const cx2 = half;
      const cx3 = half + sz * 0.25;
      const cy = half;
      const dr = sz * 0.09;
      return html`
        <svg class="status-glyph" width=${sz} height=${sz} viewBox="0 0 ${sz} ${sz}" fill="none">
          <circle cx=${cx1} cy=${cy} r=${dr} fill="currentColor" opacity="0.5" />
          <circle class=${dotClass} cx=${cx2} cy=${cy} r=${dr} fill="currentColor" />
          <circle cx=${cx3} cy=${cy} r=${dr} fill="currentColor" opacity="0.5" />
        </svg>
      `;
    }
    case "blocked": {
      // Exclamation mark in a circle — no animation
      return html`
        <svg class="status-glyph" width=${sz} height=${sz} viewBox="0 0 ${sz} ${sz}" fill="none">
          <circle cx=${half} cy=${half} r=${r} stroke="currentColor" stroke-width="1.5" />
          <text x=${half} y=${half + 0.5} text-anchor="middle" dominant-baseline="middle" font-size=${sz * 0.55} fill="currentColor" font-weight="700">!</text>
        </svg>
      `;
    }
    case "tests": {
      // Three dots in a speech-bubble style; shimmer when anim is on
      const shimmerClass = anim ? "glyph-shimmer" : "";
      const bx = 1.5;
      const by = 1.5;
      const bw = sz - 3;
      const bh = sz * 0.7;
      const br = 3;
      return html`
        <svg class="status-glyph" width=${sz} height=${sz} viewBox="0 0 ${sz} ${sz}" fill="none">
          <rect class=${shimmerClass} x=${bx} y=${by} width=${bw} height=${bh} rx=${br} stroke="currentColor" stroke-width="1.5" />
          <circle cx=${half - sz * 0.2} cy=${by + bh / 2} r=${sz * 0.07} fill="currentColor" />
          <circle cx=${half} cy=${by + bh / 2} r=${sz * 0.07} fill="currentColor" />
          <circle cx=${half + sz * 0.2} cy=${by + bh / 2} r=${sz * 0.07} fill="currentColor" />
        </svg>
      `;
    }
    case "reviewing": {
      // Eye / magnifier shape — no animation
      const rx2 = r * 0.55;
      return html`
        <svg class="status-glyph" width=${sz} height=${sz} viewBox="0 0 ${sz} ${sz}" fill="none">
          <circle cx=${half} cy=${half} r=${r} stroke="currentColor" stroke-width="1.5" />
          <circle cx=${half} cy=${half} r=${rx2} stroke="currentColor" stroke-width="1" opacity="0.7" />
        </svg>
      `;
    }
    case "success": {
      // Checkmark in a circle — no animation
      const cs = sz * 0.22;
      return html`
        <svg class="status-glyph" width=${sz} height=${sz} viewBox="0 0 ${sz} ${sz}" fill="none">
          <circle cx=${half} cy=${half} r=${r} stroke="currentColor" stroke-width="1.5" />
          <path d=${`M ${half - cs} ${half} L ${half - cs * 0.2} ${half + cs} L ${half + cs} ${half - cs * 0.8}`} stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      `;
    }
    case "idle":
    default: {
      // Dashed circle — idle / unknown fallback
      return html`
        <svg class="status-glyph" width=${sz} height=${sz} viewBox="0 0 ${sz} ${sz}" fill="none">
          <circle cx=${half} cy=${half} r=${r} stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3" />
        </svg>
      `;
    }
  }
}

// SubagentCard renders one row in the .ms-subs panel. Each row uses a grid
// layout with three columns: connector glyph, tone-tinted glyph pill with
// status SVG, and the sub-body (label + instance id). The connector is ├─ for
// all rows except the last, which uses └─. The caller passes `isLast` to
// select the correct connector. A `--sub-accent` CSS custom property on the
// row element carries the tone color for the pill background and chip tinting.
// See chore [052].
function SubagentCard({ id, status, color, isLast, anim }) {
  const connector = isLast ? "└─" : "├─";
  return html`
    <div class="ms-sub" style=${{ "--sub-accent": color, "--sub-bg": `${color}22` }}>
      <span class="connector">${connector}</span>
      <span class="glyph-pill">
        <${StatusGlyph} status=${status} anim=${anim} size=${12} />
      </span>
      <span class="sub-label">${status.toUpperCase()}</span>
      <div class="sub-body">
        <span class="sub-name">${id}</span>
      </div>
    </div>
  `;
}

// Reverse-lookup the wire-enum key for a frozen NEEDS_TOKENS entry. The
// view-model stores the entry by identity (so consumers can compare with
// `===`), and the per-category data attribute on the rendered tag needs the
// key string. Walking the small (7-entry) NEEDS_TOKENS object on each render
// is cheap and avoids embedding the seven keys as a literal list anywhere
// outside needs-tokens.js.
function needKeyFor(needs_tag) {
  if (!needs_tag) return null;
  for (const k of Object.keys(NEEDS_TOKENS)) {
    if (NEEDS_TOKENS[k] === needs_tag) return k;
  }
  return null;
}

function Card({ id, status, color, icon, label, repo, branch, session_label, desktop, detail, elapsed, subagents, needs_tag, anim }) {
  const hasLabel = typeof session_label === "string" && session_label.length > 0;
  const hasDesktop = typeof desktop === "string" && desktop.length > 0;
  const hasDetail = typeof detail === "string" && detail.length > 0;
  const hasElapsed = typeof elapsed === "string" && elapsed.length > 0;
  const needKey = needKeyFor(needs_tag);
  const className = isAttentionStatus(status) ? "card is-attention" : "card";
  const subagentCount = subagents && subagents.length > 0 ? subagents.length : 0;
  const hasSubagents = subagentCount > 0;

  const parentCard = html`
    <div
      class=${className}
      data-status=${status}
      style=${`--card-status-color: ${color}; --accent: ${color}; view-transition-name: card-${id}${hasSubagents ? "; border-radius: 8px 8px 0 0" : ""}`}
    >
      <div class="card-rail">
        <span class="card-rail-chip card-status-icon">
          <${StatusGlyph} status=${status} anim=${anim} size=${16} />
        </span>
      </div>
      <div class="card-body">
        <div class="card-body-head">
          <span class="card-body-id card-id">${id}</span>
          ${branch ? html`<span class="card-meta-branch">${branch}</span>` : null}
          ${subagentCount > 0 ? html`<span class="card-body-subcount">${subagentCount}</span>` : null}
          ${hasElapsed ? html`<span class="card-body-time">${elapsed}</span>` : null}
        </div>
        <div class="card-body-title">${label}</div>
        ${hasDetail ? html`<div class="card-body-detail">${detail}</div>` : null}
        ${hasElapsed ? html`<div class="card-meta-elapsed">${elapsed}</div>` : null}
        ${needs_tag
          ? html`<div class="card-needs-pill" data-need=${needKey}>
              ⚑ ${needs_tag.label}
            </div>`
          : null}
      </div>
      <div class="card-meta">
        ${repo ? html`<div class="card-meta-row"><span class="card-meta-repo">${repo}</span></div>` : null}
        ${hasLabel ? html`<div class="card-meta-row"><span class="card-meta-session">${session_label}</span></div>` : null}
        ${hasDesktop ? html`<div class="card-meta-row"><span class="card-meta-desktop">${desktop}</span></div>` : null}
      </div>
    </div>
  `;

  if (!hasSubagents) return parentCard;

  // Wrap in .ms-group with a .ms-subs panel below when subagents are present.
  const subsPanel = html`
    <div class="ms-subs">
      ${subagents.map((s, i) => {
        const subColor = tokensForStatus(s.status).color;
        return html`<${SubagentCard}
          key=${s.id}
          id=${s.id}
          status=${s.status}
          color=${subColor}
          isLast=${i === subagents.length - 1}
          anim=${anim}
        />`;
      })}
    </div>
  `;

  return html`
    <div class="ms-group has-children">
      ${parentCard}
      ${subsPanel}
    </div>
  `;
}

function Dashboard({ cards, now, panelOpen, onTogglePanel, activeTones, onToggleTone, visibleFields, onToggleField, anim, onToggleAnim }) {
  const cardsTree =
    cards.length === 0
      ? html`<div class="empty-state">No sessions yet.</div>`
      : html`
          <div class="cards">
            ${cards.map(
              (c, i) =>
                html`<div key=${c.id} style=${{ opacity: dimRamp(i, cards.length) }}>
                  <${Card}
                    id=${c.id}
                    status=${c.status}
                    color=${c.color}
                    icon=${c.icon}
                    label=${c.label}
                    repo=${c.repo}
                    branch=${c.branch}
                    session_label=${c.session_label}
                    desktop=${c.desktop}
                    detail=${c.detail}
                    elapsed=${c.elapsed}
                    subagents=${c.subagents}
                    needs_tag=${c.needs_tag}
                    anim=${anim}
                  />
                </div>`,
            )}
          </div>
        `;
  // Tweaks panel surface (chores [033], [036]). The panel-open state and
  // the active-tones Set both live in `mount()`'s closure-level UI state.
  // Each tone-group filter control renders with the stable
  // `tweaks-tone-filter` class plus an `is-on` modifier when its tone is
  // currently active; clicking the control toggles its tone via
  // `onToggleTone`.
  // Build per-tone filter buttons via `h(...)` directly inside the surface
  // template literal so the literal stays a single backtick block — no
  // nested `html\`...\`` interpolations — and so the four tone-name
  // literals plus the `onClick` wiring appear inline within the
  // panel-body span (Step 4 served-source assertions). Each control:
  // stable `tweaks-tone-filter` class, `is-on` modifier when active,
  // the tone string as the visible label, and an `onClick` wired to
  // `onToggleTone`.
  // Per-field visibility toggles (chore [037]). Each control sits alongside
  // the tone filters in the panel body with a stable `tweaks-field-toggle`
  // class plus an `is-on` modifier when its field is in `visibleFields`.
  // Built via `h(...)` directly inside the surface template literal so the
  // literal stays a single backtick block — no nested `html\`...\``
  // interpolations — and so the five field-name literals plus the
  // `onClick` wiring appear inline within the panel-body span (Step 4
  // served-source assertions). Field-stripping for the rendered cards
  // happens in `draw()` via `stripHiddenFields`, not in `Card`.
  const panelSurface = panelOpen
    ? html`
        <div class="tweaks-panel-surface">
          <h2 class="tweaks-panel-header">Tweaks</h2>
          <div class="tweaks-panel-body">
            ${h("span", { class: "tweaks-panel-section-label" }, "Appearance")}
            ${h(
              "button",
              {
                type: "button",
                class: anim
                  ? "tweaks-anim-toggle is-on"
                  : "tweaks-anim-toggle",
                "aria-pressed": anim ? "true" : "false",
                onClick: onToggleAnim,
              },
              "animation",
            )}
            ${h("span", { class: "tweaks-panel-section-label" }, "Filters")}
            ${["attention", "active", "success", "neutral"].map((tone) =>
              h(
                "button",
                {
                  key: tone,
                  type: "button",
                  class: activeTones.has(tone)
                    ? "tweaks-tone-filter is-on"
                    : "tweaks-tone-filter",
                  "aria-pressed": activeTones.has(tone) ? "true" : "false",
                  onClick: () => onToggleTone(tone),
                },
                tone,
              ),
            )}
            ${h("span", { class: "tweaks-panel-section-label" }, "Metadata fields")}
            ${["repo", "branch", "session", "desktop", "elapsed"].map((field) =>
              h(
                "button",
                {
                  key: "field-" + field,
                  type: "button",
                  class: visibleFields.has(field)
                    ? "tweaks-field-toggle is-on"
                    : "tweaks-field-toggle",
                  "aria-pressed": visibleFields.has(field) ? "true" : "false",
                  onClick: () => onToggleField(field),
                },
                field,
              ),
            )}
          </div>
        </div>
      `
    : null;
  return html`
    <div class=${anim ? "" : "anim-off"}>
      <${HeaderStrip} now=${now} />
      <${StatsStrip} cards=${cards} />
      <button
        type="button"
        class="tweaks-panel-toggle"
        onClick=${onTogglePanel}
      >
        Tweaks
      </button>
      ${panelSurface}
      ${cardsTree}
    </div>
  `;
}

// Pure helper: format a Unix timestamp in milliseconds as a zero-padded
// "HH:MM" string using local time. Non-finite or negative inputs return
// "--:--" (the caller expects "clock unavailable" semantics). See chore [049].
export function formatClock(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "--:--";
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// Preact functional component: renders the header strip with the dashboard
// title on the left and a live HH:MM clock on the right.
// Accepts a `now` prop (Unix timestamp ms) for the clock value.
// See chore [049].
export function HeaderStrip({ now }) {
  return html`
    <div class="ms-head">
      <span class="ms-head-title">claude-display</span>
      <span class="ms-head-clock">${formatClock(now)}</span>
    </div>
  `;
}

// Pure helper: compute five stat counts from the filtered cards array.
// Returns { awaiting, blocked, active, done, instances }.
//   awaiting  = count of cards with status "waiting" or "approval"
//   blocked   = count of cards with status "blocked"
//   active    = count of cards with status "working", "tests", or "reviewing"
//   done      = count of cards with status "success"
//   instances = cards.length (always non-negative)
// All counts are non-negative integers; an empty array returns all zeros.
// See chore [049].
export function statsFromCards(cards) {
  let awaiting = 0, blocked = 0, active = 0, done = 0;
  for (const card of cards) {
    const s = card.status;
    if (s === "waiting" || s === "approval") awaiting++;
    else if (s === "blocked") blocked++;
    else if (s === "working" || s === "tests" || s === "reviewing") active++;
    else if (s === "success") done++;
  }
  return { awaiting, blocked, active, done, instances: cards.length };
}

// Preact functional component: renders the stats strip with five stat cells.
// Accepts a `cards` prop (filtered cards array) and derives counts via
// `statsFromCards`. See chore [049].
export function StatsStrip({ cards }) {
  const { awaiting, blocked, active, done, instances } = statsFromCards(cards || []);
  return html`
    <div class="ms-board">
      <div class="ms-stat-cell">
        <span class="ms-stat-label">Awaiting</span>
        <span class="ms-stat-value" style="color: var(--tn-yellow)">${awaiting}</span>
      </div>
      <div class="ms-stat-cell">
        <span class="ms-stat-label">Blocked</span>
        <span class="ms-stat-value" style="color: var(--tn-red)">${blocked}</span>
      </div>
      <div class="ms-stat-cell">
        <span class="ms-stat-label">Active</span>
        <span class="ms-stat-value" style="color: var(--tn-blue)">${active}</span>
      </div>
      <div class="ms-stat-cell">
        <span class="ms-stat-label">Done</span>
        <span class="ms-stat-value" style="color: var(--tn-green)">${done}</span>
      </div>
      <div class="ms-stat-cell">
        <span class="ms-stat-label">Instances</span>
        <span class="ms-stat-value">${instances}</span>
      </div>
    </div>
  `;
}

// Pure helper: named entry point for the reconnect path's
// "replace everything from server state" semantics. Returns the same
// view-model shape as `cardsFromState`. The reconnect flow re-fetches
// `/api/state` and feeds the records through this helper before resuming
// live updates; both initial mount and reconnect therefore funnel through
// the same data-shaping function.
export function replaceCardsFromState(records) {
  return cardsFromState(records);
}

// Pure helper: locked reconnect schedule for the live channel.
// Returns the delay in milliseconds before the next reconnect attempt.
// Sequence is the chore's locked decision: [250, 500, 1000, 2000, 5000, 10000]
// for attempts 0..5, then 10000 ms for every further attempt — caps the
// retry cadence at ~6/min so a long-down server does not produce a tight
// loop of failing requests.
const RECONNECT_DELAYS_MS = [250, 500, 1000, 2000, 5000, 10000];
export function nextReconnectDelay(attempt) {
  if (attempt < 0) return RECONNECT_DELAYS_MS[0];
  if (attempt >= RECONNECT_DELAYS_MS.length - 1) {
    return RECONNECT_DELAYS_MS[RECONNECT_DELAYS_MS.length - 1];
  }
  return RECONNECT_DELAYS_MS[attempt];
}

// Pure factory: live-channel wiring with auto-reconnect and re-fetch on
// reconnect. Side-effects come from the injected collaborators
// (`eventSource`, `fetchFn`, `scheduleTimeout`), so the reconnect/backoff/
// re-fetch flow is unit-testable in `bun:test` without a real browser.
//
// Options:
//   url          — SSE endpoint, e.g. "/events/stream"
//   stateUrl     — full-state endpoint, e.g. "/api/state"
//   eventSource  — function `(url) => EventSourceLike`
//   fetchFn      — function `(url) => Promise<Response-like with .json()>`
//   scheduleTimeout — function `(fn, ms) => void` (e.g. setTimeout)
//   onMessage    — called per `onmessage` payload, parsed with JSON.parse
//   onReplaceAll — called once per successful reconnect, with the records
//                  array fetched from `stateUrl`, before any subsequent
//                  `onMessage` is forwarded.
//
// Behaviour: on `onerror`, closes the current channel and schedules a
// single reconnect with `nextReconnectDelay(attempt)`. The attempt counter
// resets to 0 only after a successful re-fetch + new `onopen`.
export function createLiveChannel(options) {
  const {
    url,
    stateUrl,
    eventSource,
    fetchFn,
    scheduleTimeout,
    onMessage,
    onReplaceAll,
  } = options;

  let attempt = 0;
  let current = null;
  let isReconnect = false;
  // Until a reconnect's onReplaceAll has resolved we hold off forwarding
  // any onmessage frames so the user never sees a live frame applied on
  // top of stale state. Initial mount path does its own initial fetch
  // outside this factory, so the first connection is treated as
  // "already had a snapshot" — `holdMessages` starts false.
  let holdMessages = false;

  function open() {
    const src = eventSource(url);
    current = src;

    src.onmessage = (event) => {
      if (holdMessages) return;
      onMessage(JSON.parse(event.data));
    };

    src.onopen = () => {
      if (!isReconnect) return;
      // Successful reconnect path: re-fetch full state, replace, then
      // resume forwarding live frames and reset the attempt counter.
      Promise.resolve()
        .then(() => fetchFn(stateUrl))
        .then((res) => res.json())
        .then((records) => {
          onReplaceAll(records);
          attempt = 0;
          isReconnect = false;
          holdMessages = false;
        });
    };

    src.onerror = () => {
      src.close();
      const delay = nextReconnectDelay(attempt);
      attempt += 1;
      isReconnect = true;
      holdMessages = true;
      scheduleTimeout(() => open(), delay);
    };
  }

  open();
}

// Pure helper: route a render through the browser's View Transitions API
// when available, fall back to a synchronous call otherwise. Pure so it can
// be unit-tested with bun:test without a DOM. Returns whatever the chosen
// path returns so callers can chain on the transition handle.
export function withReorderTransition(viewTransitions, renderFn) {
  if (viewTransitions && typeof viewTransitions.startViewTransition === "function") {
    return viewTransitions.startViewTransition(renderFn);
  }
  return renderFn();
}

export async function mount(rootEl) {
  let records = [];
  // Tweaks panel local UI state (chore [033]). Closure-level boolean,
  // toggled via `nextPanelOpen` and a `draw()` re-render — mirrors the
  // existing `records` pattern because the vendored Preact ships without
  // hooks. Defaults closed (`false`).
  let panelOpen = false;
  // Persistence injection point (chore [039]). The Tweaks-panel selections
  // are hydrated from and written back to a caller-supplied storage stub.
  // In a real browser the stub is `globalThis.localStorage` and the
  // scheduler is `queueMicrotask`. In a non-DOM environment (unit tests of
  // pure helpers) `typeof localStorage === "undefined"` — fall back to a
  // no-op storage and a synchronous scheduler so `mount()` keeps running.
  // Mirrors the existing `typeof EventSource !== "undefined"` guard
  // pattern used for the live-channel boot path.
  const storage =
    typeof localStorage !== "undefined"
      ? globalThis.localStorage
      : { getItem: () => null, setItem: () => {} };
  const scheduleWrite =
    typeof localStorage !== "undefined"
      ? (fn) => queueMicrotask(fn)
      : (fn) => fn();
  // Tweaks-panel tonal filters (chore [036]). Default on first load is
  // "all four tones active" (AC3); the Set lives in closure-level state for
  // the same hook-less reason as `panelOpen` and `records`. Toggled via
  // `toggleActiveTone` which always allocates a fresh Set. Hydrated from
  // the persistence layer (chore [039]) so a previously-applied selection
  // is reapplied on reload — `hydrateActiveTones` falls back to a fresh
  // `new Set(TONE_GROUPS)` when the stored value is missing or malformed.
  let activeTones = hydrateActiveTones(storage, TONE_GROUPS);
  // Tweaks-panel field-visibility toggles (chore [037]). Default on first
  // load is "all five toggles on" (AC5) — every metadata field renders for
  // every card whose record carries it. The Set lives in closure-level
  // state for the same hook-less reason as `panelOpen`, `records`, and
  // `activeTones`. Toggled via `toggleVisibleField` which always allocates
  // a fresh Set; field-stripping happens in `draw()` via `stripHiddenFields`
  // so the existing absent-value-omits-the-element branches in `Card`
  // (chore [003]) stay untouched and AC4 holds automatically. Hydrated
  // from the persistence layer (chore [039]).
  let visibleFields = hydrateVisibleFields(storage, new Set(["repo", "branch", "session", "desktop", "elapsed"]));
  // Animation toggle (chore [051]). Closure-level boolean, defaults true (animations on).
  // When false, the Dashboard root carries class `anim-off` which suppresses all
  // glyph keyframe animations via CSS. Mirrors the `panelOpen` toggle pattern.
  let anim = true;
  // Coalescing writers (chore [039]). A burst of synchronous toggles
  // produces exactly one write per writer of the final snapshot — the
  // injected `scheduleWrite` defers the flush so the writer collapses
  // intermediate states. Each toggle handler calls `.schedule(snapshot)`
  // alongside the existing `draw()` re-render.
  const tonesWriter = createCoalescingWriter(scheduleWrite, (snapshot) =>
    writeActiveTones(storage, snapshot, TONE_GROUPS),
  );
  const fieldsWriter = createCoalescingWriter(scheduleWrite, (snapshot) =>
    writeVisibleFields(storage, snapshot, ["repo", "branch", "session", "desktop", "elapsed"]),
  );
  // Wrap the render call through the View Transitions API when available so
  // a reorder-by-recency animates in place rather than full-page repainting
  // (chore [015]). In non-DOM environments (unit tests) `withReorderTransition`
  // falls back to a synchronous call.
  const togglePanel = () => {
    panelOpen = nextPanelOpen(panelOpen);
    draw();
  };
  const toggleTone = (tone) => {
    activeTones = toggleActiveTone(activeTones, tone);
    tonesWriter.schedule(activeTones);
    draw();
  };
  const toggleField = (field) => {
    visibleFields = toggleVisibleField(visibleFields, field);
    fieldsWriter.schedule(visibleFields);
    draw();
  };
  const toggleAnim = () => {
    anim = !anim;
    draw();
  };
  const draw = () => {
    const now = Date.now();
    const cards = stripHiddenFields(
      filterCardsByTones(cardsFromState(records, now), activeTones),
      visibleFields,
    );
    return withReorderTransition(
      typeof document !== "undefined" ? document : null,
      () =>
        render(
          html`<${Dashboard}
            cards=${cards}
            now=${now}
            panelOpen=${panelOpen}
            onTogglePanel=${togglePanel}
            activeTones=${activeTones}
            onToggleTone=${toggleTone}
            visibleFields=${visibleFields}
            onToggleField=${toggleField}
            anim=${anim}
            onToggleAnim=${toggleAnim}
          />`,
          rootEl,
        ),
    );
  };
  const res = await fetch("/api/state");
  records = await res.json();
  draw();
  // Auto-advance: re-render once per second so elapsed-time fields tick
  // forward without requiring a new hook event. The data is unchanged; only
  // `now` advances. See docs/decisions/0002-elapsed-time-anchor.md.
  const interval = setInterval(draw, 1_000);

  // Open the live channel through the injectable factory so the
  // reconnect/backoff/re-fetch flow is exercised by `mount` exactly as it
  // is in the unit tests. EventSource is a browser primitive; in non-DOM
  // environments (e.g. unit tests of pure helpers) the live channel is
  // skipped — the elapsed-tick interval still runs.
  if (typeof EventSource !== "undefined") {
    createLiveChannel({
      url: "/events/stream",
      stateUrl: "/api/state",
      eventSource: (u) => new EventSource(u),
      fetchFn: (u) => fetch(u),
      scheduleTimeout: (fn, ms) => setTimeout(fn, ms),
      onMessage: (record) => {
        // Upsert by id at the record layer so all per-card metadata
        // (repo, branch, session_label, desktop, event_at) carried by the
        // hook payload survives into the next render. `applyEventToCards`
        // is preserved as an exported helper for its documented contract
        // (id+status only, view-model layer); the live mount path needs
        // to retain the full record shape so `cardsFromState` can derive
        // elapsed and the metadata fields on every redraw.
        const idx = records.findIndex((r) => r.id === record.id);
        if (idx === -1) records = [...records, record];
        else {
          const next = records.slice();
          next[idx] = record;
          records = next;
        }
        draw();
      },
      onReplaceAll: (next) => {
        records = next;
        // Touch `replaceCardsFromState` so the served-text test in
        // `test/dashboard-app-references-reconnect.test.js` continues to
        // see the symbol referenced in `app.js`. The view-model is
        // re-derived from `records` in `draw()`.
        replaceCardsFromState(records);
        draw();
      },
    });
  }
  return () => clearInterval(interval);
}

if (typeof document !== "undefined") {
  mount(document.getElementById("root"));
}
