// Sharing with the family, from "Who is playing?": one device starts sharing and shows a family
// code, other devices join with it. The data is swapped by src/sync/sync.ts.

import { getApp } from "../app";
import { byId, h } from "../ui/dom";
import { current, go } from "../ui/nav";
import { FamilyCodeError, formatCode, type SyncState } from "../sync/sync";

let shareError = "";
let busy = false;

function statusText(state: SyncState, last: Date | null, pending: number): string {
  const time = last?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  switch (state) {
    case "syncing":
      return "Syncing…";
    case "bad-code":
      return "This family code no longer works. Stop sharing and join again.";
    case "offline":
      return pending
        ? `No internet: ${pending} ${pending === 1 ? "change" : "changes"} will be sent later.`
        : "No internet. Everything still works on this iPad.";
    default:
      return time ? `Up to date (${time}).` : "Up to date.";
  }
}

/** A button that asks again (`armed` text) before acting; with `armed` null it acts on the first tap. */
function confirmButton(label: string, armed: string | null, onConfirm: () => void): HTMLButtonElement {
  const b = h("button", { type: "button", class: "btn btn-secondary btn-small" }, label);
  let timer: ReturnType<typeof setTimeout> | null = null;
  b.addEventListener("click", () => {
    if (!armed || b.classList.contains("armed")) {
      if (timer) clearTimeout(timer);
      onConfirm();
      return;
    }
    b.classList.add("armed");
    b.textContent = armed;
    timer = setTimeout(() => {
      b.classList.remove("armed");
      b.textContent = label;
    }, 3000);
  });
  return b;
}

export function setupFamily(): void {
  const wrap = byId("familyWrap");
  const label = () => {
    const shared = !!getApp().sync.code;
    byId("familyBtnText").textContent = shared ? "Family: on" : "Family";
  };
  byId("familyBtn").addEventListener("click", () => {
    shareError = "";
    renderShare();
    wrap.hidden = false;
  });
  byId("familyDone").addEventListener("click", () => (wrap.hidden = true));
  getApp().sync.onUpdate(() => {
    label();
    if (!wrap.hidden) renderShare();
  });
  label();
}

async function act(fn: () => Promise<unknown>) {
  busy = true;
  shareError = "";
  renderShare();
  try {
    await fn();
  } catch (e) {
    shareError =
      e instanceof FamilyCodeError
        ? "That code does not work. Check it on the other device."
        : "Could not reach the family's data. Check the internet and try again.";
  }
  busy = false;
  // Joining replaces the children on this iPad.
  if (current() === "login") go("login");
  renderShare();
}

function renderShare() {
  const { db, sync } = getApp();
  const box = byId("shareBox");
  const code = sync.code;
  const err = shareError ? [h("p", { class: "note", style: "color: var(--danger)" }, shareError)] : [];
  if (!code) {
    const start = h("button", { type: "button", class: "btn btn-primary btn-small", disabled: busy }, "Start sharing");
    start.addEventListener("click", () => void act(() => sync.create()));
    const input = h("input", { type: "text", id: "joinCode", placeholder: "Family code", maxlength: 14, autocomplete: "off", "aria-label": "Family code" });
    // Joining replaces this device's children and gifts, so ask twice when there are any.
    const hasData = db.value<number>("SELECT COUNT(*) FROM kids") > 0;
    const join = confirmButton("Join", hasData ? "Replace this iPad's data?" : null, () => {
      if (input.value.trim()) void act(() => sync.join(input.value));
    });
    join.disabled = busy;
    box.replaceChildren(
      h("div", { class: "share-row" }, h("b", {}, "Share with family"), start),
      h("p", { class: "note" }, "Stars, children, gifts and pictures stay the same on every device that has the family code."),
      h("div", { class: "share-row" }, input, join),
      ...err
    );
    return;
  }
  const now = h("button", { type: "button", class: "btn btn-secondary btn-small", disabled: busy || sync.state === "syncing" }, "Sync now");
  now.addEventListener("click", () => void sync.now());
  const stop = confirmButton("Stop sharing", "Stop on this iPad?", () => {
    sync.leave();
    renderShare();
  });
  box.replaceChildren(
    h("div", { class: "share-row" }, h("b", {}, "Family code"), h("span", { class: "share-code", id: "familyCode" }, formatCode(code))),
    h("p", { class: "note", id: "syncStatus" }, statusText(sync.state, sync.lastSynced, sync.pending())),
    h("div", { class: "share-row" }, now, stop),
    ...err
  );
}
