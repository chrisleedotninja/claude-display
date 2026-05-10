import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer } from "../server.js";

describe("served /app.js wires the live channel through createLiveChannel", () => {
  let handle;
  let baseUrl;

  beforeEach(() => {
    handle = createServer({ port: 0, hostname: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${handle.server.port}`;
  });

  afterEach(() => {
    handle.stop();
  });

  it("references the createLiveChannel factory, the nextReconnectDelay helper, and replaceCardsFromState", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.includes("createLiveChannel")).toBe(true);
    expect(body.includes("nextReconnectDelay")).toBe(true);
    expect(body.includes("replaceCardsFromState")).toBe(true);
  });
});
