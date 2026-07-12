import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname, "src/client"),
  publicDir: false,
  build: {
    outDir: resolve(__dirname, "dist/client"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: resolve(__dirname, "src/client/index.html"),
      output: {
        manualChunks(id) {
          // Graph engine (React Flow + elkjs) and Mermaid are lazy route chunks.
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
