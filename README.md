# Frame Puzzle

A calm jigsaw puzzle app for young children on iPad. A parent picks a picture, the app cuts it into jigsaw pieces, and the child drags the pieces into an empty frame. Finishing a picture earns stars, which the child trades for real gifts that the parents add themselves.

It is a Progressive Web App: it installs from Safari to the iPad home screen, runs full screen and works offline. No App Store, no TestFlight, no Apple Developer account and no re-signing.

## Install on the iPad

1. Open the app's link in **Safari** on the iPad.
2. Tap **Share** (the square with an arrow, top right).
3. Tap **Add to Home Screen**, keep "Open as Web App" on, then tap **Add**.

The first launch needs the internet; after that it works offline and updates itself when online. The children's data lives inside the installed app, so do not remove the icon.

## Develop

Requires Node 22. Everything works on Linux.

```sh
npm install
npm run dev        # http://localhost:5173, also reachable from the iPad on the same Wi-Fi
npm test           # unit tests
npm run typecheck
npm run build      # production build in dist/
npm run preview    # serve the build (service worker included)
```

The UI is laid out at iPad size (1194x834 stage units) and scaled to fill the screen, see `src/ui/stage.ts`.

## Deploy

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main`. One-time setup: repository **Settings > Pages > Source: GitHub Actions**. GitHub Pages on a private repository needs a paid GitHub plan; otherwise make the repository public or host `dist/` on any static host (Cloudflare Pages, Netlify).

## Design

The product design, UI, data model and plan were agreed before coding. The plan has six milestones:

| Milestone | Content |
|---|---|
| M1 | Project skeleton, PWA install and offline, screen navigation, CI and deploy |
| M2 | SQLite database, children, pictures, jigsaw engine and unit tests |
| M3 | Puzzle screen with drag and drop |
| M4 | Stars and the "Well done" celebration |
| M5 | Gifts, "My gifts" and the parent area |
| M6 | Sound, voice, polish and end-to-end tests |
