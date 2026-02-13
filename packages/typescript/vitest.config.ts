import { webcrypto } from "node:crypto";
import { defineConfig } from "vitest/config";

// Polyfill globalThis.crypto for Node 18 (Web Crypto API global added in Node 19)
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as Crypto;
}

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    benchmark: {
      include: ["test/benchmarks/**/*.bench.ts"],
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
    },
  },
});
