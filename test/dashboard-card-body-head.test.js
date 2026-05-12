import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("served Card source's head-row .card-body-time binds to relative_time", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js source contains the literal class name card-body-time", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.includes("card-body-time")).toBe(true);
  });

  it("served /app.js source guards the card-body-time element on relative_time being present", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // Structural-source check: a guard mentioning `relative_time` precedes
    // the class-name string. Mirrors the pattern used by
    // dashboard-card-elapsed.test.js for the `elapsed` guard.
    const guardThenClass = /relative_time[^]*?card-body-time/;
    expect(guardThenClass.test(body)).toBe(true);
  });

  it("served /app.js source's .card-body-time element interpolates ${relative_time} (not ${elapsed})", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // Locate the card-body-time element template and require its inner
    // interpolation references `relative_time`. Mirrors the structural-
    // source assertion pattern used by the head-row `.card-body-id`
    // instance/id fallback test.
    const bodyTimePattern = /card-body-time"[^>]*>\$\{([^}]*)\}/;
    const match = body.match(bodyTimePattern);
    expect(match).not.toBeNull();
    expect(/relative_time/.test(match[1])).toBe(true);
  });

  it("served /app.js source has no .card-body-time element whose interpolation is ${elapsed}", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // AC4 negative assertion: the previous head-row binding of
    // `${elapsed}` is gone. The .card-meta-elapsed body element (sibling
    // slice 076's removal target) is unaffected — only the head-row
    // `card-body-time` element is asserted here.
    expect(/card-body-time"[^>]*>\$\{elapsed\}/.test(body)).toBe(false);
  });
});

describe("served Card source threads relative_time through Card props and Dashboard", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served /app.js lists relative_time in Card's destructured prop signature", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    // Locate the `function Card({ ... })` destructure and require it
    // mentions `relative_time` so the prop is threaded through.
    const cardSig = body.match(/function Card\(\{([^}]*)\}\)/);
    expect(cardSig).not.toBeNull();
    expect(/\brelative_time\b/.test(cardSig[1])).toBe(true);
  });

  it("served /app.js Dashboard map binds relative_time=${c.relative_time} on the <${Card}> call site", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(/relative_time=\$\{c\.relative_time\}/.test(body)).toBe(true);
  });

  it("served /app.js preserves head-row element order: card-body-id, card-meta-branch, card-body-subcount, card-body-time", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    const headIdIdx = body.indexOf("card-body-id");
    const branchIdx = body.indexOf("card-meta-branch");
    const subcountIdx = body.indexOf("card-body-subcount");
    const bodyTimeIdx = body.indexOf("card-body-time");
    expect(headIdIdx).toBeGreaterThanOrEqual(0);
    expect(branchIdx).toBeGreaterThanOrEqual(0);
    expect(subcountIdx).toBeGreaterThanOrEqual(0);
    expect(bodyTimeIdx).toBeGreaterThanOrEqual(0);
    expect(branchIdx).toBeGreaterThan(headIdIdx);
    expect(subcountIdx).toBeGreaterThan(branchIdx);
    expect(bodyTimeIdx).toBeGreaterThan(subcountIdx);
  });
});
