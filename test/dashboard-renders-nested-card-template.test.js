import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("served /app.js wires the nested view-model into the render template", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("references subagents inside a .map( invocation and emits ms-sub class (updated chore [052])", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    expect(res.status).toBe(200);
    const body = await res.text();

    // The template iterates each parent's nested array — proves the renderer
    // consumes the extended view-model rather than ignoring it.
    expect(/subagents[^\n]*\.map\(/.test(body) || /subagents\.map\(/.test(body)).toBe(true);

    // The nested cards carry the ms-sub class (replaces old subagent-card).
    expect(body.includes("ms-sub")).toBe(true);

    // Existing checks stay green: cardsFromState reference and root mount.
    expect(body.includes("cardsFromState")).toBe(true);
    expect(
      body.includes("getElementById('root')") || body.includes('getElementById("root")'),
    ).toBe(true);
  });
});
