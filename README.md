# Frame Puzzle

A calm jigsaw puzzle app for young children on iPad. A parent picks a picture, the app cuts it into jigsaw pieces, and the child drags the pieces into an empty frame. Finishing a picture earns stars, which the child trades for real gifts that the parents add themselves.

It is a Progressive Web App: it installs from Safari to the iPad home screen, runs full screen and works offline. No App Store, no TestFlight, no Apple Developer account and no re-signing.

## What it does

- **Who is playing?** The app opens on a picker with a big circle per child (photo or initial). No password. Each child has their own stars and gifts; pictures and the gift list are shared by the family.
- **Normal or Race.** Play first asks how to play. **Normal** has no timer. **Race** has a time limit, 1 to 30 minutes (5 by default), set with − and + under the Race card and remembered per child; a clock beside the stars counts down and turns red for the last 10 seconds. A picture finished in time earns its full stars. When time runs out the puzzle ends with "Time over!" and the child gets stars for each piece done the right way round in its own slot: the full picture's stars shared out over its pieces, rounded up (1 piece of a 6 piece, 100 star puzzle earns 17). Those stars count in the rankings; the picture does not count as finished.
- **Choose a picture.** Many pictures come with the app, made with Figma AI, and cannot be deleted: animals, vehicles and real-looking landscapes, then categories that get harder in order, from dinosaurs, the ocean and anime to Greek and Norse myths, busy places, flowers and night lights (`src/pictures.ts` lists them; `scripts/thumbs.py` makes the small copies the choose screen shows). A menu in two columns shows all pictures or one category, or My photos, remembered per child; the pictures sit in one row of small copies that scrolls sideways. Import from Photos or take a photo, reuse earlier pictures or delete them (two taps). Pick a level, Easy, Medium, Hard, Extreme or Ultimate (Easy by default), and one of 12 piece counts: 2 to 49 (4 by default), or at Extreme and Ultimate only big puzzles, 30 to 70 (30 by default). The level and both counts are remembered per child.
- **Play.** The frame shows every jigsaw slot outlined on plain gray. Loose pieces sit around it and never overlap. A piece can go in any slot; a taken slot swaps the two pieces; a piece dropped outside goes back to the side. The picture is done only when every piece is in its own slot. At Medium, half the pieces start mirrored left to right and a tap flips a piece over. At Hard, at least half start turned and each tap turns a piece a quarter turn clockwise. From Hard up, the picture is cut into pieces two grid cells long, some lying and some standing, mixed at random, and how many of each is random too; a piece goes only into a slot of the shape it has the way it is turned, and a tap on a piece in the frame turns it a half turn, so it still fits. Flipped or turned pieces still fit any slot, but the picture is done only when every piece is also the right way round. Extreme and Ultimate turn pieces as at Hard, but a piece must be turned right before it goes in: one dropped into a slot that is not its own, or the wrong way round, sends every piece in the frame back out to the sides, and at Ultimate it also costs 1% of the child's stars, rounded up. A line under the level buttons says what the chosen level does. The child's stars show beside the close button while playing. The whole picture sits in the top-right corner; a tap shows it big in the middle of the screen and another tap shrinks it back. The light bulb lights up a slot for one piece and puts that piece the right way round. Hints are free at Easy and Medium; Hard allows 5 per picture, with the count beside the bulb; at Extreme they have no limit but cost 1%, 1%, 2%, 3%, 5% and so on (Fibonacci) of the child's stars, with the next price beside the bulb, and none while the child has no stars; Ultimate has none. Stars never go below zero: at Ultimate, losing the last star ends the puzzle, and Ultimate stays locked until the child earns more. Leaving needs a 2 second hold on the close button.
- **Well done!** Stars are saved at once: 2 per piece at Easy, and 3, 5, 10 and 15 times that at Medium (6), Hard (10), Extreme (20) and Ultimate (30). Pastel confetti, the picture pops in with a shine, stars fly to the counter, a chime and a spoken "Well done!". Reduce Motion in iPad settings turns the animations off.
- **Gifts.** The child trades stars for gifts the parents added. "My gifts" shows a green tick and "Received" once a parent has handed the gift out.
- **Ranking** (trophy on Home). Children are ranked by the stars they won by playing: stars spent on gifts still count, stars a parent added by hand do not, and stars lost for a mistake or a hint are taken off. **General** ranks every child of every device that uses the app (the top 50, plus the place of the child who is playing, pinned at the bottom when lower). **Family** ranks the children of the family and shows only while the device shares with a family. Other families' children show their first name and initial only, never their photo. The ranking needs the internet.
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

The app is published on Cloudflare Pages (https://frame-puzzle.pages.dev), where an API in `functions/` keeps the family's shared data in Postgres. In **Family** on "Who is playing?", one device starts sharing and shows a family code; other devices join with that code (their own data is replaced, with a copy kept on the device). Every device still keeps the whole database, so the app works offline: changed rows wait in an outbox and are swapped with the server a moment after each change, every 30 seconds while the app is open, and when the network comes back (`src/sync/sync.ts`, `functions/api/sync.ts`). An older copy on GitHub Pages (https://nhatnkv.github.io/frame-puzzle/, no longer deployed) uses the same API, so a family that started there can join on the Cloudflare address.

Rankings use the same server, for every device whether it shares or not (`src/rank/players.ts`, `functions/api/players.ts`, `functions/api/ranking.ts`). Each child is a player: the child's row holds a random secret key (shared with the family like the rest of the row), and the server keeps the player under the key's SHA-256, with the child's name, color, star count, puzzles and, while shared, the family. A device sends its children a moment after their stars change. A `rating` column is kept by the server alone, ready for games between players later.

Branches: **develop** is the main branch, where finished work is merged (pull requests run CI; merging deploys nothing). **release** is what is live: a pull request from develop into release ships everything merged since. `.github/workflows/deploy-cloudflare.yml` deploys each push to release to production (it makes release the Pages project's production branch; run by hand from the Actions tab, another branch gets a preview address), creates the Pages project on its first run, applies `migrations/` with `scripts/migrate.mjs` and hands the API the database address. One-time setup: repository secrets `CLOUDFLARE_API_TOKEN` (permission Account > Cloudflare Pages: Edit), `CLOUDFLARE_ACCOUNT_ID` and `DATABASE_URL` (a Postgres connection string). To run it locally: put `DATABASE_URL=postgres://...` in `.dev.vars`, run `DATABASE_URL=... node scripts/migrate.mjs`, then `npm run build && npx wrangler pages dev` and open http://localhost:8788/api/health. The API's tests need a Postgres too: `TEST_DATABASE_URL=postgres://... npm test` (CI starts one).

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
