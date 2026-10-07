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
        // Everything the app needs is precached, so it works offline after the first visit.
        globPatterns: ["**/*.{js,css,html,svg,png,wasm}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      }
    })
  ],
  test: {
    include: ["tests/**/*.test.ts"]
  }
});
