import "./styles.css";
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import { getApp, renderStars, setApp } from "./app";
import { referencedFiles } from "./data/files";
import { syncBuiltins } from "./data/photos";
import { AppDb } from "./db/database";
import { FileStore } from "./db/files";
import { idbKV } from "./db/kv";
import { getKid } from "./data/kids";
import { Sync } from "./sync/sync";
import { Players } from "./rank/players";
import { getSetting } from "./data/settings";
import { BUILTIN_PICTURES } from "./pictures";
import { setupChoose } from "./screens/choose";
import { completePuzzle, timeOver } from "./screens/done";
import { playMode, raceMinutes, setupMode } from "./screens/mode";
import { setupHome } from "./screens/home";
import { setupParent } from "./screens/parent";
import { setupShop } from "./screens/shop";
import { setupFamily } from "./screens/family";
import { setupRank } from "./screens/rank";
import { requireKid, setupLogin } from "./screens/login";
import { debugState, setupPlay, startPuzzle } from "./screens/play";
import { byId } from "./ui/dom";
import { current, go, onEnter, setGuard, wireNavigation } from "./ui/nav";
import { mountStage } from "./ui/stage";
import { setupUpdates } from "./ui/update";

const stage = byId("stage");
mountStage(stage);

// iPad Safari ignores user-scalable=no in some cases; block pinch zoom explicitly.
document.addEventListener("gesturestart", (e) => e.preventDefault());

async function boot(): Promise<void> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = await AppDb.open(SQL, idbKV("db"));
  const files = new FileStore(idbKV("files"));
  const sync = new Sync(db, files);
  // A device joining a family waits for the family's children before giving any a player key.
  const players = new Players(db, () => sync.code, () => !sync.code || getSetting(db, "sync.rev", "0") !== "0");
  setApp({ db, files, sync, players, kid: null });

  // Ask iOS to keep this app's data even when storage runs low.
  void navigator.storage?.persist?.();

  // Save straight away when the app goes to the background; iOS may close it without warning.
  const save = () => void db.flush();
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && save());
  window.addEventListener("pagehide", save);

  setupUpdates(() => db.flush());

  syncBuiltins(db, BUILTIN_PICTURES);
  void files.sweep(() => referencedFiles(db));

  setupLogin((kid) => {
    getApp().kid = kid;
    go("home");
  });
  setupFamily();
  setupHome();
  setupMode();
  setupChoose((id, count, img, level) => startPuzzle(id, count, img, level, playMode() === "race" ? raceMinutes() : null));
  setupPlay(completePuzzle, timeOver);
  setupShop();
  setupRank();
  setupParent();

  for (const s of ["login", "home", "mode", "choose", "play", "done", "shop", "rank", "parent"] as const) onEnter(s, () => renderStars());
  setGuard(requireKid);
  wireNavigation(stage);

  // Lets end-to-end tests find the pieces.
  (window as unknown as { __frame: unknown }).__frame = debugState;

  byId("loading").hidden = true;
  go("login");

  // Changes from the family's other devices show up on the screens that list things; a puzzle in
  // progress is never interrupted.
  sync.onUpdate((changed) => {
    if (!changed) return;
    const a = getApp();
    if (a.kid) a.kid = getKid(db, a.kid.id);
    const screen = current();
    if (!a.kid && screen !== "login" && screen !== "play" && screen !== "done") go("login");
    else if (screen === "login" || screen === "home" || screen === "shop") go(screen);
    else renderStars();
  });
  sync.start();
  players.start();
}

boot().catch((e) => {
  console.error(e);
  byId("loading").textContent = "Frame Puzzle could not start. Close it and open it again.";
});
