import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("served /styles.css contains header and stats strip class rules", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("contains .ms-head class rule", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    const body = await res.text();
    expect(body.includes(".ms-head")).toBe(true);
  });

  it("contains .ms-board class rule", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    const body = await res.text();
    expect(body.includes(".ms-board")).toBe(true);
  });

  it("contains .ms-stat-cell class rule", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    const body = await res.text();
    expect(body.includes(".ms-stat-cell")).toBe(true);
  });
});

describe("served /app.js references HeaderStrip, StatsStrip, statsFromCards, formatClock", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("references statsFromCards", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(body.includes("statsFromCards")).toBe(true);
  });

  it("references formatClock", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(body.includes("formatClock")).toBe(true);
  });

  it("references HeaderStrip", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(body.includes("HeaderStrip")).toBe(true);
  });

  it("references StatsStrip", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(body.includes("StatsStrip")).toBe(true);
  });

  it("references .ms-head class string", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(body.includes("ms-head")).toBe(true);
  });

  it("references .ms-board class string", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(body.includes("ms-board")).toBe(true);
  });

  it("Dashboard receives a now prop", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    const body = await res.text();
    expect(body.includes("now=")).toBe(true);
  });
});
