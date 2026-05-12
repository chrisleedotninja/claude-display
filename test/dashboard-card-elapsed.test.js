import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("served Card source references card-elapsed", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js source contains the literal class name card-meta-elapsed", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.includes("card-meta-elapsed")).toBe(true);
  });

  it("served /app.js source guards the card-meta-elapsed element on elapsed being present", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // Same structural-source check pattern as dashboard-card-session-label:
    // a guard mentioning `elapsed` precedes the class-name string.
    const guardThenClass = /elapsed[^]*?card-meta-elapsed/;
    expect(guardThenClass.test(body)).toBe(true);
  });

  it("served /app.js source uses no placeholder fallback for elapsed", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(/["']unknown["']/.test(body)).toBe(false);
    expect(/["']-["']/.test(body)).toBe(false);
  });

  it("served /app.js schedules a re-render via setInterval", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(/setInterval\s*\(/.test(body)).toBe(true);
  });

  it("served /styles.css defines a .card-meta-elapsed rule", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(/\.card-meta-elapsed\b/.test(body)).toBe(true);
  });

  // Chore 076 Step 5 — the elapsed value renders exactly once: via the
  // meta column's Elapsed K/V row. The previous in-body
  // `<div class="card-meta-elapsed">${elapsed}</div>` rendering is gone.
  it("Card's body mentions the card-meta-elapsed class string exactly once (076 Step 5)", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    // Walk to Card's function body and count occurrences of the class.
    const sigRe = /\bfunction\s+Card\s*\(/;
    const m = body.match(sigRe);
    expect(m).not.toBeNull();
    let i = m.index + m[0].length;
    let depth = 1;
    while (i < body.length && depth > 0) {
      const c = body[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      i++;
    }
    while (i < body.length && /\s/.test(body[i])) i++;
    expect(body[i]).toBe("{");
    const openIdx = i;
    depth = 1;
    let closeIdx = -1;
    for (let j = openIdx + 1; j < body.length; j++) {
      const c = body[j];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          closeIdx = j;
          break;
        }
      }
    }
    expect(closeIdx).toBeGreaterThan(openIdx);
    const inner = body.slice(openIdx + 1, closeIdx);
    const occurrences = inner.split("card-meta-elapsed").length - 1;
    expect(occurrences).toBe(1);
  });
});
