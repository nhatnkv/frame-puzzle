// Shared app state: the database, the image files and the child who is playing.

import type { AppDb } from "./db/database";
import type { FileStore } from "./db/files";
import type { Kid } from "./data/kids";
import { starTotal } from "./data/stars";

export interface App {
  db: AppDb;
  files: FileStore;
  kid: Kid | null;
}

let app: App | null = null;

export function setApp(a: App): void {
  app = a;
}

export function getApp(): App {
  if (!app) throw new Error("App not started");
  return app;
}

export function currentKid(): Kid {
  const k = getApp().kid;
  if (!k) throw new Error("No child selected");
  return k;
}

/** Updates every star counter on screen for the child who is playing. */
export function renderStars(): number {
  const a = getApp();
  const n = a.kid ? starTotal(a.db, a.kid.id) : 0;
  document.querySelectorAll<HTMLElement>("[data-stars]").forEach((el) => (el.textContent = String(n)));
  return n;
}
