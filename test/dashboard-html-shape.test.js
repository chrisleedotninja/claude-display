import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("served dashboard HTML shape", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("contains exactly one <div id=\"root\"></div> mount point", async () => {
    const res = await fetch(`${baseUrl}/`);
    const body = await res.text();
    const matches = body.match(/<div\s+id=["']root["']\s*>\s*<\/div>/g) || [];
    expect(matches.length).toBe(1);
  });

  it("references /app.js with type=\"module\" exactly once", async () => {
    const res = await fetch(`${baseUrl}/`);
    const body = await res.text();
    const matches =
      body.match(/<script\s+type=["']module["']\s+src=["']\/app\.js["']\s*>\s*<\/script>/g) || [];
    expect(matches.length).toBe(1);
  });

  it("references /styles.css via <link rel=\"stylesheet\"> exactly once", async () => {
    const res = await fetch(`${baseUrl}/`);
    const body = await res.text();
    const matches =
      body.match(/<link\s+rel=["']stylesheet["']\s+href=["']\/styles\.css["']\s*\/?>/g) || [];
    expect(matches.length).toBe(1);
  });

  it("references no remote URLs (no http://, https://, no //cdn)", async () => {
    const res = await fetch(`${baseUrl}/`);
    const body = await res.text();
    expect(/https?:\/\//.test(body)).toBe(false);
    expect(/\/\/cdn/.test(body)).toBe(false);
  });
});
