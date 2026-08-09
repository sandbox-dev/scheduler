import { defineConfig } from "vitest/config";
import path from "path";

const rootDir = import.meta.dirname;

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
      // Outside Next's build, "server-only" throws unconditionally on import
      // (its whole job is to fail a client bundle) — alias it to the same
      // no-op stub Next itself uses for the server-side case.
      "server-only": path.resolve(rootDir, "./node_modules/server-only/empty.js"),
    },
  },
});
