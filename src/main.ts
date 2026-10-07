import "./styles.css";
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import { registerSW } from "virtual:pwa-register";
import { getApp, renderStars, setApp } from "./app";
import { referencedFiles } from "./data/files";
import { AppDb } from "./db/database";
import { FileStore } from "./db/files";
import { idbKV } from "./db/kv";
import { seedSamples } from "./samples";
import { setupChoose } from "./screens/choose";
import { setupHome } from "./screens/home";
import { requireKid, setupLogin } from "./screens/login";
import { byId } from "./ui/dom";
import { go, onEnter, setGuard, wireNavigation } from "./ui/nav";
import { mountStage } from "./ui/stage";

const stage = byId("stage");
mountStage(stage);

// iPad Safari ignores user-scalable=no in some cases; block pinch zoom explicitly.
document.addEventListener("gesturestart", (e) => e.preventDefault());

// Updates download in the background and apply on the next launch.
registerSW({ immediate: true });

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

  await seedSamples(db, files);
  void files.sweep(() => referencedFiles(db));

  setupLogin((kid) => {
    getApp().kid = kid;
    go("home");
  });
  setupHome();
  setupChoose(() => go("play"));

  for (const s of ["login", "home", "choose", "play", "done", "shop", "parent"] as const) onEnter(s, () => renderStars());
  setGuard(requireKid);
  wireNavigation(stage);

  byId("loading").hidden = true;
  go("login");
}

boot().catch((e) => {
  console.error(e);
  byId("loading").textContent = "Frame Puzzle could not start. Close it and open it again.";
});
