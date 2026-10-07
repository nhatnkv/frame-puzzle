# Frame Puzzle

A calm jigsaw puzzle app for young children on iPad. A parent picks a picture, the app cuts it into jigsaw pieces, and the child drags the pieces into an empty frame. Finishing a picture earns stars, which the child trades for real gifts that the parents add themselves.

It is a Progressive Web App: it installs from Safari to the iPad home screen, runs full screen and works offline. No App Store, no TestFlight, no Apple Developer account and no re-signing.

## What it does

- **Who is playing?** The app opens on a picker with a big circle per child (photo or initial). No password. Each child has their own stars and gifts; pictures and the gift list are shared by the family.
- **Choose a picture.** Import from Photos or take a photo, reuse earlier pictures or delete them (two taps). Pick one of 12 piece counts, from 2 to 49 (4 by default, remembered per child).
- **Play.** The frame shows every jigsaw slot outlined on plain gray. Loose pieces sit around it and never overlap. A piece can go in any slot; a taken slot swaps the two pieces; a piece dropped outside goes back to the side. The picture is done only when every piece is in its own slot. The light bulb lights up a slot for one piece. Leaving needs a 2 second hold on the close button.
- **Well done!** Stars are saved at once (2 per piece). Pastel confetti, the picture pops in with a shine, stars fly to the counter, a chime and a spoken "Well done!". Reduce Motion in iPad settings turns the animations off.
- **Gifts.** The child trades stars for gifts the parents added. "My gifts" shows a green tick and "Received" once a parent has handed the gift out.
- **Parents** (gear on Home, with a red count of gifts to hand out): add, edit and delete gifts with your own picture, mark gifts as given for every child, add or remove stars by hand, and turn sound on or off.

## Install on the iPad

1. Open the app's link in **Safari** on the iPad.
2. Tap **Share** (the square with an arrow, top right).
3. Tap **Add to Home Screen**, keep "Open as Web App" on, then tap **Add**.

The first launch needs the internet; after that it works offline. New versions download in the background and switch over the next time the app is back on "Who is playing?" or closed, never in the middle of a puzzle.

### Where the data lives

Everything (children, pictures, stars, gifts) is stored on the iPad only, inside the installed app: a SQLite database (sql.js) saved to IndexedDB, with image files in their own IndexedDB store. Nothing is uploaded. Apps added to the Home Screen are not subject to Safari's automatic clean-up of website data, and the app asks iPadOS to keep its storage. Removing the app's icon from the Home Screen deletes its data; there is no backup.

## Develop

Requires Node 22. Everything works on Linux.

```sh
npm install
npm run dev        # http://localhost:5173, also reachable from the iPad on the same Wi-Fi
npm test           # unit tests (Vitest)
npm run e2e        # end-to-end tests (Playwright) against the production build
npm run typecheck
npm run build      # production build in dist/
npm run preview    # serve the build (service worker included)
```

`npm run e2e` runs in Chromium locally. CI also runs it in WebKit as an 11-inch iPad (Safari's engine); set `E2E_WEBKIT=1` to do the same locally once WebKit is installed with `npx playwright install webkit`.

The UI is laid out at iPad size (1194x834 stage units) and scaled to fill the screen inside the iPad's safe area, see `src/ui/stage.ts`.

### Layout

| Path | What |
|---|---|
| `src/puzzle/` | Jigsaw engine: piece shapes, layout around the frame, drop and swap rules (pure, unit tested) |
| `src/db/` | SQLite wrapper, schema migrations, IndexedDB storage for the database file and images |
| `src/data/` | Children, pictures, stars, gifts and settings queries |
| `src/screens/` | One module per screen |
| `src/ui/` | Stage scaling, navigation, sounds, app updates, small DOM helpers |
| `tests/` | Unit tests |
| `e2e/` | End-to-end tests |

## Deploy

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main`, or when run by hand from the Actions tab. One-time setup: repository **Settings > Pages > Source: GitHub Actions**. GitHub Pages on a private repository needs a paid GitHub plan; otherwise make the repository public (the code holds no family data) or host `dist/` on any static host (Cloudflare Pages, Netlify).

## Design and milestones

The product design, UI, data model and plan were agreed before coding, then built one milestone at a time:

| Milestone | Content | Status |
|---|---|---|
| M1 | Project skeleton, PWA install and offline, screen navigation, CI and deploy | Done |
| M2 | SQLite database, children, pictures, jigsaw engine and unit tests | Done |
| M3 | Puzzle screen with drag and drop | Done |
| M4 | Stars and the "Well done" celebration | Done |
| M5 | Gifts, "My gifts" and the parent area | Done |
| M6 | Sound and voice polish, safe updates, end-to-end tests | Done; testing on the real iPad is next |
