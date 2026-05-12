import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";
import { cardsFromState, composeSubagentLabel } from "../app.js";

describe("SubagentCard composes parent-instance and subagent-instance", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js source: SubagentCard accepts an `instance` prop and a `parentInstance` prop", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    // Locate the SubagentCard function literal by its declaration prefix and
    // extract its parameter list (same scanning technique used by the
    // dashboard-subagent-card-needs test for the SubagentCard prop check).
    const declIdx = body.indexOf("function SubagentCard(");
    expect(declIdx).toBeGreaterThanOrEqual(0);
    const slice = body.slice(declIdx);
    const parenOpen = slice.indexOf("(");
    let depth = 0;
    let parenEnd = -1;
    for (let k = parenOpen; k < slice.length; k++) {
      const ch = slice[k];
      if (ch === "(") depth += 1;
      else if (ch === ")") {
        depth -= 1;
        if (depth === 0) {
          parenEnd = k;
          break;
        }
      }
    }
    expect(parenEnd).toBeGreaterThan(parenOpen);
    const params = slice.slice(parenOpen, parenEnd + 1);
    expect(params.includes("instance")).toBe(true);
    expect(params.includes("parentInstance")).toBe(true);
  });

  it("served /app.js source contains the › glyph (composed-label separator)", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(body.includes("›")).toBe(true);
  });

  it("served /app.js source: the subagents .map(...) inside Card forwards parentInstance from the enclosing card.instance", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // The wiring at the SubagentCard call site references both
    // `parentInstance` and the enclosing card's instance prop. We accept any
    // htm-style binding that places `instance` on the right-hand side.
    expect(/parentInstance=\$\{instance\}/.test(body)).toBe(true);
  });

  it("served /app.js source: the subagents .map(...) inside Card forwards instance from each s entry", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(body.includes("instance=${s.instance}")).toBe(true);
  });
});

describe("cardsFromState propagates subagent instance", () => {
  it("includes instance on the subagent view-model when the subagent record carries a non-empty string", () => {
    const records = [
      {
        id: "P1",
        status: "working",
        instance: "cc-payments",
        subagents: [{ id: "S1", status: "active", instance: "audit-deps" }],
      },
    ];
    const cards = cardsFromState(records);
    expect(cards).toHaveLength(1);
    expect(cards[0].subagents).toHaveLength(1);
    expect(cards[0].subagents[0].instance).toBe("audit-deps");
  });

  it("omits instance on the subagent view-model when the subagent record has no instance key", () => {
    const records = [
      {
        id: "P1",
        status: "working",
        instance: "cc-payments",
        subagents: [{ id: "S1", status: "active" }],
      },
    ];
    const cards = cardsFromState(records);
    expect(cards[0].subagents[0].instance).toBeUndefined();
  });

  it("omits instance on the subagent view-model when the subagent record has an empty-string instance", () => {
    const records = [
      {
        id: "P1",
        status: "working",
        instance: "cc-payments",
        subagents: [{ id: "S1", status: "active", instance: "" }],
      },
    ];
    const cards = cardsFromState(records);
    expect(cards[0].subagents[0].instance).toBeUndefined();
  });
});

describe("pure projection and Tokyo Night Storm token reuse", () => {
  it("cardsFromState does not mutate its input across the subagent-instance projection", () => {
    const records = [
      {
        id: "P1",
        status: "working",
        instance: "cc-payments",
        subagents: [
          { id: "S1", status: "active", instance: "audit-deps" },
          { id: "S2", status: "approval", needs: "approve-tool" },
          { id: "S3", status: "active", instance: "" },
          { id: "S4", status: "active" },
        ],
      },
      {
        id: "P2",
        status: "working",
        subagents: [{ id: "S5", status: "active", instance: "lint-bot" }],
      },
    ];
    const snapshot = JSON.parse(JSON.stringify(records));
    cardsFromState(records);
    expect(records).toEqual(snapshot);
  });

  describe("served-source invariants", () => {
    let handle;
    let baseUrl;

    beforeEach(() => {
      handle = createServer({ port: 0, hostname: "127.0.0.1" });
      baseUrl = `http://127.0.0.1:${handle.server.port}`;
    });

    afterEach(() => {
      handle.stop();
    });

    it("served /app.js reuses the existing .sub-name class — does not introduce a new class for the composed label", async () => {
      const res = await fetch(`${baseUrl}/app.js`);
      const body = await res.text();
      // Composed label lives inside the existing `.sub-name` slot.
      expect(body.includes('class="sub-name"')).toBe(true);
      // No ad-hoc new class name introduced for the composed label.
      expect(body.includes("sub-name-instance")).toBe(false);
      expect(body.includes("sub-instance-label")).toBe(false);
    });

    it("served /styles.css does not introduce a new selector for the composed label", async () => {
      const res = await fetch(`${baseUrl}/styles.css`);
      const body = await res.text();
      // No new selector layer for the composed label. The existing .sub-name
      // rule (font-family: var(--font-mono); color: var(--tn-cyan)) must
      // remain the only governing rule for the rendered text.
      expect(body.includes("sub-name-instance")).toBe(false);
      expect(body.includes("sub-instance-label")).toBe(false);
    });

    it("served /styles.css keeps .sub-name carrying Tokyo Night Storm tokens (var(--font-mono), var(--tn-cyan))", async () => {
      const res = await fetch(`${baseUrl}/styles.css`);
      const body = await res.text();
      const re = /\.sub-name\b[^{]*\{([^}]*)\}/g;
      const blocks = [];
      let m;
      while ((m = re.exec(body)) !== null) blocks.push(m[1]);
      expect(blocks.length).toBeGreaterThan(0);
      const ok = blocks.some(
        (b) =>
          /var\(--font-mono\)/.test(b) && /var\(--tn-cyan\)/.test(b),
      );
      expect(ok).toBe(true);
    });

    it("served /app.js does not read any new SSE-shape wire keys off subagent records beyond the chore [079] allow-list (no scope creep)", async () => {
      const res = await fetch(`${baseUrl}/app.js`);
      const body = await res.text();
      // The subagent projection inside cardsFromState references s.id,
      // s.status, s.needs, and (chore [070]) s.instance, plus (chore [079])
      // s.title, s.detail, s.event_at, s.last_event_at. No other s.* wire-key
      // reads should appear inside the cardsFromState body.
      const fnIdx = body.indexOf("export function cardsFromState(");
      expect(fnIdx).toBeGreaterThanOrEqual(0);
      // Walk balanced braces to find the function body end.
      const bodyStart = body.indexOf("{", fnIdx);
      let depth = 0;
      let endIdx = -1;
      for (let k = bodyStart; k < body.length; k++) {
        const ch = body[k];
        if (ch === "{") depth += 1;
        else if (ch === "}") {
          depth -= 1;
          if (depth === 0) {
            endIdx = k;
            break;
          }
        }
      }
      expect(endIdx).toBeGreaterThan(bodyStart);
      const fnBody = body.slice(bodyStart, endIdx + 1);
      // Collect every `s.<key>` reference in cardsFromState. The widened
      // allow-list (chore [079]) covers `id`, `status`, `needs`, `instance`,
      // `title`, `detail`, `event_at`, `last_event_at` — anything beyond that
      // would be a new wire-shape dependency.
      const sKeyRefs = new Set();
      const re2 = /\bs\.([A-Za-z_][A-Za-z0-9_]*)/g;
      let mm;
      while ((mm = re2.exec(fnBody)) !== null) {
        sKeyRefs.add(mm[1]);
      }
      const allowed = new Set([
        "id",
        "status",
        "needs",
        "instance",
        "title",
        "detail",
        "event_at",
        "last_event_at",
      ]);
      for (const key of sKeyRefs) {
        expect(allowed.has(key)).toBe(true);
      }
    });

  });
});

describe("parent without instance keeps subagent display (composeSubagentLabel)", () => {
  it("returns the bare subagent id when parentInstance is absent even if the subagent carries instance", () => {
    expect(composeSubagentLabel({ id: "S1", instance: "audit-deps" })).toBe(
      "S1",
    );
  });

  it("returns the bare subagent id when parentInstance is an empty string even if the subagent carries instance", () => {
    expect(
      composeSubagentLabel({
        id: "S1",
        instance: "audit-deps",
        parentInstance: "",
      }),
    ).toBe("S1");
  });

  it("never produces a leading-separator artefact (no `›` in the parent-without-instance path)", () => {
    const out = composeSubagentLabel({
      id: "S1",
      instance: "audit-deps",
    });
    expect(out.includes("›")).toBe(false);
  });

  it("returns the bare subagent id when both parentInstance and instance are absent", () => {
    expect(composeSubagentLabel({ id: "S1" })).toBe("S1");
  });
});

describe("subagent without instance falls back to bare id (composeSubagentLabel)", () => {
  it("returns the bare subagent id when the subagent has no instance, even if parent has instance", () => {
    expect(
      composeSubagentLabel({ id: "S1", parentInstance: "cc-payments" }),
    ).toBe("S1");
  });

  it("returns the bare subagent id when the subagent's instance is an empty string, even if parent has instance", () => {
    expect(
      composeSubagentLabel({
        id: "S1",
        instance: "",
        parentInstance: "cc-payments",
      }),
    ).toBe("S1");
  });

  it("never produces a trailing-separator artefact (no `›` in the bare-id fallback path)", () => {
    const out = composeSubagentLabel({
      id: "S1",
      parentInstance: "cc-payments",
    });
    expect(out.includes("›")).toBe(false);
  });
});

