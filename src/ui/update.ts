// New versions download in the background. The page reloads to use them only at a safe moment
// (back on "Who is playing?", or when the app goes to the background), never in the middle of a puzzle.

import { registerSW } from "virtual:pwa-register";
import { current, onEnter } from "./nav";

const CHECK_EVERY_MS = 60 * 60 * 1000;

export function setupUpdates(beforeReload: () => Promise<void>): void {
  let ready = false;
  let reloading = false;
  const apply = () => {
    if (!ready || reloading) return;
    if (current() !== "login" && document.visibilityState !== "hidden") return;
    reloading = true;
    void beforeReload().finally(() => window.location.reload());
  };
  registerSW({
    immediate: true,
    onNeedReload() {
      ready = true;
      apply();
    },
    onRegisteredSW(_url, reg) {
      // An installed iPad app can stay open for days; look for a new version now and then.
      if (reg) setInterval(() => navigator.onLine && void reg.update(), CHECK_EVERY_MS);
    }
  });
  onEnter("login", apply);
  document.addEventListener("visibilitychange", apply);
}
