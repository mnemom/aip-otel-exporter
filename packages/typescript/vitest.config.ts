import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    benchmark: {
      include: ["test/benchmarks/**/*.bench.ts"],
    },
  },
});
