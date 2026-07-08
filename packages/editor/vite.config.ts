import { defineConfig, searchForWorkspaceRoot } from "vite";

export default defineConfig({
  // Relative asset paths so dist/index.html also works when opened from disk.
  base: "./",
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd())],
    },
  },
  build: {
    target: "es2021",
  },
});
