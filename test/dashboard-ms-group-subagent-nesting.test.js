import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("Dashboard renders ms-group/ms-subs/ms-sub nesting structure with connectors and glyph pills", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("served app.js references ms-group class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("ms-group")).toBe(true);
  });

  it("served app.js references ms-subs class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("ms-subs")).toBe(true);
  });

  it("served app.js references ms-sub class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("ms-sub")).toBe(true);
  });

  it("served app.js contains the ├─ connector glyph", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("├─")).toBe(true);
  });

  it("served app.js contains the └─ connector glyph", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("└─")).toBe(true);
  });

  it("served app.js references glyph-pill class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("glyph-pill")).toBe(true);
  });

  it("served app.js references sub-label class string", async () => {
    const body = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(body.includes("sub-label")).toBe(true);
  });
});

describe("styles.css carries ms-group/ms-subs/ms-sub layout rules", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("contains a .ms-group rule", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(/\.ms-group\b/.test(body)).toBe(true);
  });

  it("contains a .ms-subs rule", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(/\.ms-subs\b/.test(body)).toBe(true);
  });

  it("contains a .ms-sub rule", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(/\.ms-sub\b/.test(body)).toBe(true);
  });

  it("contains a .connector rule", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(/\.connector\b/.test(body)).toBe(true);
  });

  it("contains a .glyph-pill rule", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(/\.glyph-pill\b/.test(body)).toBe(true);
  });

  it("contains a .sub-label rule", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(/\.sub-label\b/.test(body)).toBe(true);
  });

  it("contains a .sub-body rule", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    expect(/\.sub-body\b/.test(body)).toBe(true);
  });

  it(".ms-sub rule carries a grid-template-columns declaration", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    // Find the .ms-sub rule body
    const re = /\.ms-sub\b[^{]*\{([^}]*)\}/g;
    const blocks = [];
    let m;
    while ((m = re.exec(body)) !== null) blocks.push(m[1]);
    expect(blocks.length).toBeGreaterThan(0);
    const hasGrid = blocks.some((b) => /grid-template-columns/.test(b));
    expect(hasGrid).toBe(true);
  });

  it(".glyph-pill rule carries a width and height declaration (22px pill)", async () => {
    const body = await (await fetch(`${baseUrl}/styles.css`)).text();
    const re = /\.glyph-pill\b[^{]*\{([^}]*)\}/g;
    const blocks = [];
    let m;
    while ((m = re.exec(body)) !== null) blocks.push(m[1]);
    expect(blocks.length).toBeGreaterThan(0);
    const hasSize = blocks.some(
      (b) => /\bwidth\s*:/.test(b) && /\bheight\s*:/.test(b),
    );
    expect(hasSize).toBe(true);
  });
});
