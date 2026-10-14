import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { artVersions } from "./vite-plugins/artVersions.ts";
import { cssCacheBust } from "./vite-plugins/cssCacheBust.ts";

export default defineConfig({
  // cssCacheBust and artVersions: the editor container caches static files for hours; see the plugins.
  plugins: [react(), cssCacheBust(), artVersions()],
  // Verse8 serves the game from a sub-path; root-absolute URLs 404 there.
  base: "./",
  // Two React copies (SDK peer dep) cause "Invalid hook call"; pin one.
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: {
    include: ["@agent8/gameserver", "phaser", "react", "react-dom", "react/jsx-runtime"],
  },
  server: {
    watch: { ignored: ["**/.git/**", "**/node_modules/**", "**/dist/**", "**/.superpowers/**", "**/art-src/**"] },
  },
  build: { outDir: "dist", reportCompressedSize: false, chunkSizeWarningLimit: 5000 },
});
