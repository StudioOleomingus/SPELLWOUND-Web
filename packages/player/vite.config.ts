import { defineConfig, searchForWorkspaceRoot } from "vite";

export default defineConfig({
  // Relative asset paths so dist/index.html also works when opened from disk.
  base: "./",
  server: {
    fs: {
      // Allow serving @spellwound/core sources and /levels from the monorepo root.
      allow: [searchForWorkspaceRoot(process.cwd())],
    },
  },
  build: {
    target: "es2020",
  },
});
