// VARIATION — Mission board, Tokyo Night Storm palette.
// Big colored rail per item, station-board feel, deep navy surfaces.

function VariationMission({ events, now, fields, anim }) {
  const total = events.length;

  return (
    <div className="var-mission">
      <style>{`
        .var-mission {
          background: var(--tn-bg);
          color: var(--tn-fg);
          font-family: var(--font-sans);
          padding: 36px 48px 64px;
          min-height: 100%;
        }
        .ms-head {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 24px;
          align-items: end;
          margin-bottom: 24px;
        }
        .ms-head h1 {
          margin: 0;
          font-size: 13px; font-weight: 600;
          font-family: var(--font-mono);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--tn-muted);
        }
        .ms-head h1 .accent { color: var(--tn-cyan); }
        .ms-head .clock {
          font-family: var(--font-mono);
          font-size: 26px;
          font-weight: 500;
          letter-spacing: -0.01em;
          color: var(--tn-fg);
          font-variant-numeric: tabular-nums;
        }
        .ms-board {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 12px;
          padding: 14px 16px;
          background: var(--tn-bg-dark);
          border: 1px solid var(--tn-rule);
          border-radius: 8px;
          margin-bottom: 22px;
        }
        .ms-board .stat { display: flex; flex-direction: column; gap: 4px; }
        .ms-board .stat .lbl {
          font-size: 10px;
          font-family: var(--font-mono);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--tn-faint);
        }
        .ms-board .stat .val {
          font-family: var(--font-mono);
          font-size: 24px;
          font-weight: 500;
          font-variant-numeric: tabular-nums;
          color: var(--tn-fg);
        }
        .ms-board .stat.attention .val { color: var(--tn-yellow); }
        .ms-board .stat.danger    .val { color: var(--tn-red); }
        .ms-board .stat.active    .val { color: var(--tn-blue); }
        .ms-board .stat.success   .val { color: var(--tn-green); }

        .ms-feed { display: flex; flex-direction: column; gap: 10px; }
        .ms-row {
          display: grid;
          grid-template-columns: 88px 1fr 240px;
          background: var(--tn-surface);
          border: 1px solid var(--tn-rule);
          border-radius: 8px;
          overflow: hidden;
          position: relative;
        }
        .ms-row .rail {
          background: var(--accent);
          color: var(--tn-bg-darker);
          padding: 14px 12px;
          display: flex; flex-direction: column;
          justify-content: space-between;
          gap: 10px;
        }
        .ms-row .rail .glyph-wrap {
          width: 28px; height: 28px;
          border-radius: 6px;
          background: rgba(26, 27, 38, 0.25);
          display: inline-flex; align-items: center; justify-content: center;
          color: var(--tn-bg-darker);
        }
        .ms-row .rail .label {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 700;
          line-height: 1.25;
        }
        .ms-row .body { padding: 14px 18px; min-width: 0; }
        .ms-row .body .head {
          display: flex; align-items: center; gap: 10px; margin-bottom: 6px;
          font-size: 12px;
          color: var(--tn-muted);
          flex-wrap: wrap;
        }
        .ms-row .body .instance {
          font-family: var(--font-mono);
          font-weight: 600;
          color: var(--tn-cyan);
          font-size: 13px;
        }
        .ms-row .body .when {
          color: var(--tn-faint);
          margin-left: auto;
          font-family: var(--font-mono);
          font-size: 11px;
        }
        .ms-row .body h3 {
          margin: 0 0 4px;
          font-size: 15px;
          font-weight: 500;
          line-height: 1.4;
          letter-spacing: -0.005em;
          color: var(--tn-fg);
        }
        .ms-row .body p {
          margin: 0;
          font-size: 13px;
          color: var(--tn-muted);
          line-height: 1.5;
        }
        .ms-row .body .needs {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 10px;
          padding: 4px 10px 4px 8px;
          border-radius: 4px;
          background: var(--accent-bg);
          color: var(--accent);
          font-size: 11px;
          font-weight: 600;
          font-family: var(--font-mono);
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        .ms-row .body .needs::before { content: '⚑'; }

        .ms-row .meta {
          padding: 14px 16px;
          background: var(--tn-bg-dark);
          border-left: 1px solid var(--tn-rule);
          display: flex; flex-direction: column; gap: 4px;
          font-family: var(--font-mono);
          font-size: 11px;
        }
        .ms-row .meta .line { display: flex; gap: 10px; }
        .ms-row .meta .k {
          color: var(--tn-faint);
          width: 56px;
          flex-shrink: 0;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-size: 9px;
          padding-top: 1px;
        }
        .ms-row .meta .v {
          color: var(--tn-fg);
          font-weight: 500;
          overflow-wrap: anywhere;
        }

        .ms-row.attention {
          box-shadow: 0 0 0 1px var(--accent), 0 8px 24px -10px var(--accent);
        }

        /* Subagent group: parent + nested children share a card-like container */
        .ms-group { display: flex; flex-direction: column; }
        .ms-group .ms-row { border-radius: 8px 8px 0 0; }
        .ms-group.has-children .ms-row { border-bottom: 0; }

        .ms-subs {
          background: var(--tn-bg-dark);
          border: 1px solid var(--tn-rule);
          border-top: 0;
          border-radius: 0 0 8px 8px;
          padding: 8px 16px 10px 28px;
          display: flex; flex-direction: column; gap: 2px;
          position: relative;
        }
        .ms-subs::before {
          content: '';
          position: absolute;
          left: 22px; top: 0; bottom: 12px;
          width: 1px;
          background: var(--tn-faintest);
        }
        .ms-sub {
          display: grid;
          grid-template-columns: 22px 22px auto 1fr auto;
          gap: 10px;
          align-items: center;
          padding: 8px 4px 8px 0;
          border-bottom: 1px dashed var(--tn-rule);
          position: relative;
          font-size: 12px;
        }
        .ms-sub:last-child { border-bottom: 0; }
        .ms-sub .connector {
          font-family: var(--font-mono);
          color: var(--tn-faintest);
          font-size: 13px;
          text-align: center;
          line-height: 1;
        }
        .ms-sub .glyph-pill {
          width: 22px; height: 22px;
          border-radius: 5px;
          background: var(--sub-bg);
          color: var(--sub-accent);
          display: inline-flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .ms-sub .sub-label {
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--sub-accent);
          white-space: nowrap;
        }
        .ms-sub .sub-body { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .ms-sub .sub-name {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--tn-cyan);
          font-weight: 500;
        }
        .ms-sub .sub-title {
          font-size: 13px;
          color: var(--tn-fg);
          line-height: 1.4;
          font-weight: 500;
          letter-spacing: -0.005em;
        }
        .ms-sub .sub-detail {
          font-size: 12px;
          color: var(--tn-muted);
          line-height: 1.45;
          margin-top: 2px;
          max-width: 70ch;
        }
        .ms-sub .sub-needs {
          display: inline-block;
          margin-top: 4px;
          padding: 2px 8px;
          border-radius: 3px;
          background: var(--sub-bg);
          color: var(--sub-accent);
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .ms-sub .sub-meta {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--tn-faint);
          text-align: right;
          white-space: nowrap;
          align-self: start;
          padding-top: 2px;
        }
      `}</style>

      <header className="ms-head">
        <h1><span className="accent">▍</span> claude code · mission board</h1>
        <div className="clock">{fmtClock(now)}</div>
      </header>

      <div className="ms-board">
        <div className="stat attention">
          <span className="lbl">Awaiting you</span>
          <span className="val">{events.filter(e => ['waiting','approval'].includes(e.status)).length}</span>
        </div>
        <div className="stat danger">
          <span className="lbl">Blocked</span>
          <span className="val">{events.filter(e => e.status === 'blocked').length}</span>
        </div>
        <div className="stat active">
          <span className="lbl">Active</span>
          <span className="val">{events.filter(e => ['working','tests','reviewing'].includes(e.status)).length}</span>
        </div>
        <div className="stat success">
          <span className="lbl">Done</span>
          <span className="val">{events.filter(e => e.status === 'success').length}</span>
        </div>
        <div className="stat">
          <span className="lbl">Instances</span>
          <span className="val">{new Set(events.map(e => e.instance)).size}</span>
        </div>
      </div>

      <div className="ms-feed">
        {groupWithSubagents(events).map(([e, children], i, groups) => {
          const total = groups.length;
          const meta = STATUS_META[e.status];
          const tone = meta.tone;
          const isAttention = tone === 'attention' || tone === 'danger';
          const accent = `var(--c-${tone})`;
          const accentBg = `var(--c-${tone}-bg)`;

          return (
            <div
              key={e.id}
              className={`ms-group ${children.length ? 'has-children' : ''}`}
              style={{ opacity: dimRamp(i, total) }}
            >
              <article
                className={`ms-row ${isAttention ? 'attention' : ''}`}
                style={{
                  '--accent': accent,
                  '--accent-bg': accentBg,
                }}
              >
                <div className="rail">
                  <span className="glyph-wrap"><StatusGlyph status={e.status} size={16} anim={anim && i < 3} color="var(--tn-bg-darker)" /></span>
                  <span className="label">{meta.label}</span>
                </div>
                <div className="body">
                  <div className="head">
                    <span className="instance">{e.instance}</span>
                    {fields.branch && <span>· {e.branch}</span>}
                    {children.length > 0 && (
                      <span style={{ color: 'var(--tn-purple)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        · {children.length} subagent{children.length === 1 ? '' : 's'}
                      </span>
                    )}
                    <span className="when">{fmtRelative(e.ts, now)}</span>
                  </div>
                  <h3>{e.title}</h3>
                  <p>{e.detail}</p>
                  {e.needs && <div className="needs">{e.needs}</div>}
                </div>
                <div className="meta">
                  {fields.repo    && <div className="line"><span className="k">Repo</span><span className="v">{e.repo}</span></div>}
                  {fields.session && <div className="line"><span className="k">Tmux</span><span className="v">{e.session}</span></div>}
                  {fields.desktop && <div className="line"><span className="k">Desk</span><span className="v">{e.desktop}</span></div>}
                  {fields.elapsed && <div className="line"><span className="k">Elapsed</span><span className="v">{e.elapsed}</span></div>}
                  <div className="line"><span className="k">At</span><span className="v">{fmtClock(e.ts)}</span></div>
                </div>
              </article>

              {children.length > 0 && (
                <div className="ms-subs">
                  {children.map((c, ci) => {
                    const cMeta = STATUS_META[c.status];
                    const cTone = cMeta.tone;
                    const isLast = ci === children.length - 1;
                    return (
                      <div
                        key={c.id}
                        className="ms-sub"
                        style={{
                          '--sub-accent': `var(--c-${cTone})`,
                          '--sub-bg':     `var(--c-${cTone}-bg)`,
                        }}
                      >
                        <span className="connector">{isLast ? '└─' : '├─'}</span>
                        <span className="glyph-pill"><StatusGlyph status={c.status} size={12} anim={anim} color={`var(--c-${cTone})`} /></span>
                        <span className="sub-label">{cMeta.label}</span>
                        <div className="sub-body">
                          <span className="sub-name">{c.instance}</span>
                          <span className="sub-title">{c.title}</span>
                          {c.detail && <span className="sub-detail">{c.detail}</span>}
                          {c.needs && <span className="sub-needs">⚡ {c.needs}</span>}
                        </div>
                        <span className="sub-meta">
                          {c.elapsed && <>{c.elapsed}<br/></>}
                          {fmtRelative(c.ts, now)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.VariationMission = VariationMission;
