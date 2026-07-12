import { defineConfig } from "vite";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: resolve(__dirname, "src/client"),
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "dist/client"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: resolve(__dirname, "src/client/index.html"),
      output: {
        manualChunks(id) {
          // Graph engine, Mermaid, and replay stay as separate lazy chunks.
          if (
            id.includes("node_modules/@xyflow") ||
            id.includes("node_modules/elkjs") ||
            id.includes("/src/client/graph/")
          ) {
            return "graph";
          }
          if (
            id.includes("node_modules/mermaid") ||
            id.includes("/src/client/mermaid/")
          ) {
            return "mermaid";
          }
          if (id.includes("/src/client/features/replay/")) {
            return "replay";
          }
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
});
