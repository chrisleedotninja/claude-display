import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("served /app.js shape — keyed render and view-transition wiring", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("keys each mapped Card by id so Preact reconciles by id", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(/key=\$\{[^}]*id[^}]*\}/.test(body)).toBe(true);
  });

  it("references the withReorderTransition helper", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(body.includes("withReorderTransition")).toBe(true);
  });

  it("references the View Transitions API method startViewTransition", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(body.includes("startViewTransition")).toBe(true);
  });

  it("sets a per-card view-transition-name on the Card markup", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(body.includes("view-transition-name: card-")).toBe(true);
    expect(body.includes("style=")).toBe(true);
  });

  it("references the idSequence helper so mount() can gate transitions on no-op reorders", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // At minimum: the export declaration plus at least one call site inside
    // mount(). A single occurrence would mean idSequence is declared but
    // never wired through draw(), which is the bug this chore is fixing.
    const occurrences = body.split("idSequence").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});
