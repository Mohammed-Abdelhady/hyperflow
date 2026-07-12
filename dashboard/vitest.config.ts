import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.{test,spec}.ts"],
    environment: "node",
    globals: false,
  },
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
      "@fixtures": resolve(__dirname, "tests/fixtures/golden"),
    },
  },
});
