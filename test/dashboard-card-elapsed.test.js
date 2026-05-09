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

  it("served /app.js source contains the literal class name card-elapsed", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.includes("card-elapsed")).toBe(true);
  });

  it("served /app.js source guards the card-elapsed element on elapsed being present", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // Same structural-source check pattern as dashboard-card-session-label:
    // a guard mentioning `elapsed` precedes the class-name string.
    const guardThenClass = /elapsed[^]*?card-elapsed/;
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

  it("served /styles.css defines a .card-elapsed rule", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(/\.card-elapsed\b/.test(body)).toBe(true);
  });
});
