import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

// Relative base so the same build works at any path (GitHub Pages serves it under /frame-puzzle/).
export default defineConfig({
  base: "./",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["icons/apple-touch-icon.png", "icons/favicon.svg"],
      manifest: {
        name: "Frame Puzzle",
        short_name: "Frame Puzzle",
        description: "Calm jigsaw puzzles for young children. Finish a picture, earn stars, trade them for gifts.",
        lang: "en",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "landscape",
        background_color: "#F6F3EE",
        theme_color: "#F6F3EE",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        // A new version takes over as soon as it is downloaded (src/ui/update.ts then reloads at a
        // safe moment). The plugin only turns these on for autoUpdate when it injects the register
        // code itself; without them a new version waits until every tab of the app is closed.
        skipWaiting: true,
        clientsClaim: true,
        // Everything the app needs is precached, so it works offline after the first visit.
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,wasm}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      }
    })
  ],
  test: {
    include: ["tests/**/*.test.ts"]
  }
});
