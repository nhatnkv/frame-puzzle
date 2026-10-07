import "./styles.css";
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import { getApp, renderStars, setApp } from "./app";
import { referencedFiles } from "./data/files";
import { syncBuiltins } from "./data/photos";
import { AppDb } from "./db/database";
import { FileStore } from "./db/files";
import { idbKV } from "./db/kv";
import { BUILTIN_PICTURES } from "./pictures";
import { setupChoose } from "./screens/choose";
import { completePuzzle } from "./screens/done";
import { setupHome } from "./screens/home";
import { setupParent } from "./screens/parent";
import { setupShop } from "./screens/shop";
import { requireKid, setupLogin } from "./screens/login";
import { debugState, setupPlay, startPuzzle } from "./screens/play";
import { byId } from "./ui/dom";
import { go, onEnter, setGuard, wireNavigation } from "./ui/nav";
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
  setApp({ db, files, kid: null });

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
  setupHome();
  setupChoose(startPuzzle);
  setupPlay(completePuzzle);
  setupShop();
  setupParent();

  for (const s of ["login", "home", "choose", "play", "done", "shop", "parent"] as const) onEnter(s, () => renderStars());
  setGuard(requireKid);
  wireNavigation(stage);

  // Lets end-to-end tests find the pieces.
  (window as unknown as { __frame: unknown }).__frame = debugState;

  byId("loading").hidden = true;
  go("login");
}

boot().catch((e) => {
  console.error(e);
  byId("loading").textContent = "Frame Puzzle could not start. Close it and open it again.";
});
