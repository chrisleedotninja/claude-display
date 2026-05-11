// Shared helpers + StatusGlyph (icon-mix per status type).
// Each glyph uses a different visual idiom — geometric, line, filled, animated —
// so the user gets variety while still being instantly readable.

const fmtRelative = (d, now) => {
  const diff = Math.round((now - d) / 60000);
  if (diff < 1)  return 'just now';
  if (diff < 60) return `${diff}m ago`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h ${diff % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const fmtClock = (d) =>
  d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

// ──────────────────────────────────────────────────────────────────
// StatusGlyph — variety mix, sized via `size` prop, animation gated
// by `anim` (so the Tweaks panel can quiet it down).
// ──────────────────────────────────────────────────────────────────
function StatusGlyph({ status, size = 16, anim = true, color }) {
  const s = size;
  const base = { width: s, height: s, display: 'inline-block', flexShrink: 0, color };

  switch (status) {
    case 'approval':
      // Filled diamond with attention-tone, gentle pulse ring
      return (
        <span style={{ ...base, position: 'relative' }}>
          <svg viewBox="0 0 16 16" width={s} height={s}>
            <rect x="3" y="3" width="10" height="10" transform="rotate(45 8 8)" fill="currentColor" />
          </svg>
          {anim && (
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              animation: 'pulseRing 1.6s ease-out infinite',
            }} />
          )}
        </span>
      );

    case 'waiting':
      // Speech-bubble line glyph, blinking caret
      return (
        <svg viewBox="0 0 16 16" width={s} height={s} style={base} fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M2.5 4.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7l-3 2.5V10.5H4.5a2 2 0 0 1-2-2v-4Z" />
          <line x1="8" y1="6.5" x2="8" y2="8.5" strokeLinecap="round"
            style={anim ? { animation: 'blink 1.1s steps(2) infinite' } : null} />
        </svg>
      );

    case 'blocked':
      // Filled red octagon
      return (
        <svg viewBox="0 0 16 16" width={s} height={s} style={base}>
          <polygon
            points="5,1.5 11,1.5 14.5,5 14.5,11 11,14.5 5,14.5 1.5,11 1.5,5"
            fill="currentColor"
          />
          <line x1="5" y1="8" x2="11" y2="8" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );

    case 'working':
      // Animated arc spinner
      return (
        <svg viewBox="0 0 16 16" width={s} height={s} style={{ ...base, animation: anim ? 'spin 1.2s linear infinite' : null }} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="8" cy="8" r="5.5" opacity="0.2" />
          <path d="M8 2.5 A 5.5 5.5 0 0 1 13.5 8" />
        </svg>
      );

    case 'tests':
      // Beaker / flask — line glyph with bubbles
      return (
        <svg viewBox="0 0 16 16" width={s} height={s} style={base} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2v4.2L2.7 12.5a1 1 0 0 0 .9 1.5h8.8a1 1 0 0 0 .9-1.5L10 6.2V2" />
          <line x1="5" y1="2" x2="11" y2="2" />
          <circle cx="6.5" cy="11" r="0.6" fill="currentColor" stroke="none"
            style={anim ? { animation: 'shimmer 1.4s ease-in-out infinite' } : null} />
          <circle cx="9" cy="12" r="0.5" fill="currentColor" stroke="none"
            style={anim ? { animation: 'shimmer 1.8s ease-in-out infinite 0.3s' } : null} />
        </svg>
      );

    case 'reviewing':
      // Magnifier glyph
      return (
        <svg viewBox="0 0 16 16" width={s} height={s} style={base} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="7" cy="7" r="4.2" />
          <line x1="10" y1="10" x2="13.5" y2="13.5" />
        </svg>
      );

    case 'success':
      // Filled green circle with checkmark
      return (
        <svg viewBox="0 0 16 16" width={s} height={s} style={base}>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          <path d="M5 8.2 L7.2 10.4 L11.2 6" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'idle':
      // Hollow circle, neutral
      return (
        <svg viewBox="0 0 16 16" width={s} height={s} style={base} fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="8" cy="8" r="5" strokeDasharray="2 2.5" />
        </svg>
      );

    default:
      return <span style={{ ...base, background: 'currentColor', borderRadius: '50%' }} />;
  }
}

// Pulse dot — used in compact variations
function PulseDot({ color, anim = true, size = 8 }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: color, animation: anim ? 'pulseDot 1.6s ease-in-out infinite' : null,
      flexShrink: 0,
    }} />
  );
}

// Compute opacity ramp — newer is brighter, older dims
function dimRamp(idx, total) {
  if (idx === 0) return 1;
  const t = idx / Math.max(1, total - 1);
  // ramp from 1.0 to 0.55
  return 1 - t * 0.45;
}

window.fmtRelative = fmtRelative;
window.fmtClock = fmtClock;
window.StatusGlyph = StatusGlyph;
window.PulseDot = PulseDot;
window.dimRamp = dimRamp;

// Group events into [parent, [children...]] tuples in feed order.
// Top-level events keep their original (newest-first) ordering;
// children are nested directly under their parent regardless of timestamp,
// sorted newest-first within the group.
function groupWithSubagents(events) {
  const childrenByParent = {};
  for (const e of events) {
    if (e.parent) {
      (childrenByParent[e.parent] ||= []).push(e);
    }
  }
  for (const k in childrenByParent) {
    childrenByParent[k].sort((a, b) => b.ts - a.ts);
  }
  return events
    .filter(e => !e.parent)
    .map(e => [e, childrenByParent[e.id] || []]);
}
window.groupWithSubagents = groupWithSubagents;
