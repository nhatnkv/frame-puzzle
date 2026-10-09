# Frame Puzzle

A calm jigsaw puzzle app for young children on iPad. A parent picks a picture, the app cuts it into jigsaw pieces, and the child drags the pieces into an empty frame. Finishing a picture earns stars, which the child trades for real gifts that the parents add themselves.

It is a Progressive Web App: it installs from Safari to the iPad home screen, runs full screen and works offline. No App Store, no TestFlight, no Apple Developer account and no re-signing.

## What it does

- **Who is playing?** The app opens on a picker with a big circle per child (photo or initial). No password. Each child has their own stars and gifts; pictures and the gift list are shared by the family.
- **Choose a picture.** Many pictures come with the app, made with Figma AI, and cannot be deleted: animals, vehicles and real-looking landscapes, then categories that get harder in order, from dinosaurs, the ocean and anime to Greek and Norse myths, busy places, flowers and night lights (`src/pictures.ts` lists them; `scripts/thumbs.py` makes the small copies the choose screen shows). A menu in two columns shows all pictures or one category, or My photos, remembered per child; the pictures sit in one row of small copies that scrolls sideways. Import from Photos or take a photo, reuse earlier pictures or delete them (two taps). Pick a level, Easy, Medium, Hard, Extreme or Ultimate (Easy by default), and one of 12 piece counts: 2 to 49 (4 by default), or at Extreme and Ultimate only big puzzles, 30 to 70 (30 by default). The level and both counts are remembered per child.
- **Play.** The frame shows every jigsaw slot outlined on plain gray. Loose pieces sit around it and never overlap. A piece can go in any slot; a taken slot swaps the two pieces; a piece dropped outside goes back to the side. The picture is done only when every piece is in its own slot. At Medium, half the pieces start mirrored left to right and a tap flips a piece over. At Hard, at least half start turned and each tap turns a piece a quarter turn clockwise. From Hard up, the picture is cut into pieces two grid cells long, some lying and some standing, mixed at random, and how many of each is random too; a piece goes only into a slot of the shape it has the way it is turned, and a tap on a piece in the frame turns it a half turn, so it still fits. Flipped or turned pieces still fit any slot, but the picture is done only when every piece is also the right way round. Extreme and Ultimate turn pieces as at Hard, but a piece must be turned right before it goes in: one dropped into a slot that is not its own, or the wrong way round, sends every piece in the frame back out to the sides, and at Ultimate it also costs 1% of the child's stars, rounded up. A line under the level buttons says what the chosen level does. The child's stars show beside the close button while playing. The whole picture sits in the top-right corner; a tap shows it big in the middle of the screen and another tap shrinks it back. The light bulb lights up a slot for one piece and puts that piece the right way round. Hints are free at Easy and Medium; Hard allows 5 per picture, with the count beside the bulb; at Extreme they have no limit but cost 1%, 1%, 2%, 3%, 5% and so on (Fibonacci) of the child's stars, with the next price beside the bulb, and none while the child has no stars; Ultimate has none. Stars never go below zero: at Ultimate, losing the last star ends the puzzle, and Ultimate stays locked until the child earns more. Leaving needs a 2 second hold on the close button.
- **Well done!** Stars are saved at once: 2 per piece at Easy, and 3, 5, 10 and 15 times that at Medium (6), Hard (10), Extreme (20) and Ultimate (30). Pastel confetti, the picture pops in with a shine, stars fly to the counter, a chime and a spoken "Well done!". Reduce Motion in iPad settings turns the animations off.
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
| `src/puzzle/` | Jigsaw engine: piece shapes, layout around the frame, drop and swap rules, levels (pure, unit tested) |
| `src/db/` | SQLite wrapper, schema migrations, IndexedDB storage for the database file and images |
| `src/data/` | Children, pictures, stars, gifts and settings queries |
| `src/screens/` | One module per screen |
| `src/ui/` | Stage scaling, navigation, sounds, app updates, small DOM helpers |
| `tests/` | Unit tests |
| `e2e/` | End-to-end tests |

## Deploy

The app is live at https://nhatnkv.github.io/frame-puzzle/. `.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to the default branch, or when run by hand from the Actions tab. One-time setup (done): the repository is public (the code holds no family data) and **Settings > Pages > Source** is **GitHub Actions**.

The app is also published on Cloudflare Pages (https://frame-puzzle.pages.dev), where an API in `functions/` keeps the family's shared data in Cloudflare D1. In **Parents > Share with family**, one device starts sharing and shows a family code; other devices join with that code (their own data is replaced, with a copy kept on the device). Every device still keeps the whole database, so the app works offline: changed rows wait in an outbox and are swapped with the server a moment after each change, every 30 seconds while the app is open, and when the network comes back (`src/sync/sync.ts`, `functions/api/sync.ts`). Sharing needs the Cloudflare address; on GitHub Pages it cannot reach the server. `.github/workflows/deploy-cloudflare.yml` deploys every push (the default branch to production, other branches to a preview address) and creates the Pages project and the D1 database on its first run. One-time setup: repository secrets `CLOUDFLARE_API_TOKEN` (permissions Account > Cloudflare Pages: Edit and Account > D1: Edit) and `CLOUDFLARE_ACCOUNT_ID`; until they exist the workflow builds and skips the deploy. Run it locally with `npm run build && npx wrangler pages dev`, then open http://localhost:8788/api/health.

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
