import { describe, it, expect } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "..", "server.js");

describe("server.js routes all runtime output through the logger", () => {
  const source = readFileSync(serverPath, "utf8");

  it("contains no console.log calls", () => {
    expect(source).not.toMatch(/console\.log\b/);
  });

  it("contains no console.error calls", () => {
    expect(source).not.toMatch(/console\.error\b/);
  });

  it("contains no console.warn calls", () => {
    expect(source).not.toMatch(/console\.warn\b/);
  });
});
