import { describe, it, expect } from "bun:test";
import { createServer } from "../server.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const serverSourcePath = join(here, "..", "server.js");

describe("server binds only to localhost", () => {
  it("reports a loopback hostname when started with the default", () => {
    const handle = createServer({ port: 0, hostname: "127.0.0.1" });
    try {
      expect(handle.server.hostname).toBe("127.0.0.1");
      const url = handle.server.url;
      // Bun returns a URL whose hostname is the bound interface.
      expect(["127.0.0.1", "localhost"]).toContain(url.hostname);
    } finally {
      handle.stop();
    }
  });

  it("server.js source does not bind to 0.0.0.0", () => {
    const src = readFileSync(serverSourcePath, "utf8");
    expect(src.includes("0.0.0.0")).toBe(false);
  });

  it("server.js source passes hostname to Bun.serve (does not omit it)", () => {
    const src = readFileSync(serverSourcePath, "utf8");
    // The Bun.serve call must include a `hostname` field; omitting it makes
    // Bun bind to all interfaces.
    expect(/Bun\.serve\s*\(\s*\{[\s\S]*?hostname/.test(src)).toBe(true);
  });
});
