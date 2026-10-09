// Parents: the gift list (add, edit, delete), every child's gifts to hand out, and settings.

import { currentKid, getApp, renderStars } from "../app";
import { listKids } from "../data/kids";
import {
  addReward,
  allRedemptions,
  cleanPrice,
  deleteReward,
  listRewards,
  setGiven,
  updateReward,
  type Reward
} from "../data/rewards";
import { setSetting, soundOn } from "../data/settings";
import { adjustStars } from "../data/stars";
import { avatar } from "../ui/avatar";
import { byId, h, icon, twoTapDelete } from "../ui/dom";
import { giftPic } from "../ui/gift-pic";
import { canvasToJpeg, loadImageFile, onFilePicked, squareCrop } from "../ui/images";
import { current, onEnter } from "../ui/nav";
import { FamilyCodeError, formatCode, type SyncState } from "../sync/sync";

const STAR_STEP = 10;
const GIFT_PIC = 400;

interface GiftForm {
  id: number | null;
  /** undefined = keep the current picture */
  photo?: ArrayBuffer;
  previewUrl: string | null;
}
let form: GiftForm = { id: null, previewUrl: null };

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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

export function setupParent(): void {
  const formEl = byId<HTMLFormElement>("giftForm");
  const nameInput = byId<HTMLInputElement>("giftName");
  const priceInput = byId<HTMLInputElement>("giftPrice");

  onEnter("parent", () => {
    closeForm();
    render();
  });

  // ----- Gift form -----
  function setThumb(url: string | null) {
    const t = byId("giftThumb");
    if (url) t.replaceChildren(h("img", { alt: "", src: url }));
    else t.replaceChildren(icon("gift", "color:#C98E22"));
  }

  function openForm(g: Reward | null) {
    closeForm();
    form = { id: g?.id ?? null, previewUrl: null };
    nameInput.value = g?.name ?? "";
    priceInput.value = String(g?.price ?? 20);
    setThumb(null);
    if (g?.image_key) {
      const key = g.image_key;
      void getApp()
        .files.url(key)
        .then((url) => form.id === g.id && form.photo === undefined && setThumb(url));
    }
    formEl.hidden = false;
    nameInput.focus();
  }

  function closeForm() {
    formEl.hidden = true;
    if (form.previewUrl) URL.revokeObjectURL(form.previewUrl);
    form = { id: null, previewUrl: null };
  }

  byId("addGiftBtn").addEventListener("click", () => openForm(null));
  byId("giftCancel").addEventListener("click", closeForm);

  onFilePicked(byId<HTMLInputElement>("giftImg"), async (file) => {
    try {
      const c = squareCrop(await loadImageFile(file), GIFT_PIC);
      form.photo = await canvasToJpeg(c, 0.82);
      if (form.previewUrl) URL.revokeObjectURL(form.previewUrl);
      form.previewUrl = URL.createObjectURL(new Blob([form.photo], { type: "image/jpeg" }));
      setThumb(form.previewUrl);
    } catch (e) {
      console.error(e);
    }
  });

  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    const price = cleanPrice(parseInt(priceInput.value, 10));
    const a = getApp();
    const id = form.id;
    const imageKey = form.photo ? await a.files.put(form.photo) : undefined;
    if (id) updateReward(a.db, id, name, price, imageKey);
    else addReward(a.db, name, price, imageKey ?? null);
    closeForm();
    render();
  });

  // ----- Sharing with the family -----
  let shareError = "";
  let busy = false;
  getApp().sync.onUpdate((changed) => {
    if (current() !== "parent" || !getApp().kid) return;
    if (changed && formEl.hidden) render();
    else renderShare();
  });

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
    // Joining may have taken away the child who was playing, and with them this screen.
    if (current() === "parent" && getApp().kid) render();
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
      render();
    });
    box.replaceChildren(
      h("div", { class: "share-row" }, h("b", {}, "Family code"), h("span", { class: "share-code", id: "familyCode" }, formatCode(code))),
      h("p", { class: "note", id: "syncStatus" }, statusText(sync.state, sync.lastSynced, sync.pending())),
      h("div", { class: "share-row" }, now, stop),
      ...err
    );
  }

  // ----- Settings -----
  const step = (delta: number) => {
    adjustStars(getApp().db, currentKid().id, delta);
    render();
  };
  byId("starMinus").addEventListener("click", () => step(-STAR_STEP));
  byId("starPlus").addEventListener("click", () => step(STAR_STEP));
  byId("soundToggle").addEventListener("click", () => {
    const { db } = getApp();
    setSetting(db, "sound", soundOn(db) ? "0" : "1");
    render();
  });

  function render() {
    const { db } = getApp();
    const kid = currentKid();

    // Gift list
    const list = byId("giftList");
    const gifts = listRewards(db);
    list.replaceChildren(
      ...gifts.map((g) => {
        const ed = h("button", { type: "button", class: "icon-btn", "aria-label": `Edit ${g.name}` }, icon("edit"));
        ed.addEventListener("click", () => openForm(g));
        const del = twoTapDelete({
          className: "icon-btn del-btn",
          label: `Delete ${g.name}`,
          armedLabel: "Delete?",
          onConfirm: () => {
            deleteReward(db, g.id);
            if (form.id === g.id) closeForm();
            render();
          }
        });
        return h(
          "div",
          { class: "item" },
          h("span", { class: "thumb" }, giftPic(g.image_key, g.id)),
          h("span", { class: "meta" }, h("b", {}, g.name), h("span", {}, `${g.price} stars`)),
          ed,
          del
        );
      })
    );
    if (!gifts.length) list.append(h("span", { class: "empty" }, 'No gifts yet. Tap "Add gift" to create the first one.'));

    // Gifts to hand out, for every child
    const kids = new Map(listKids(db).map((k) => [k.id, k]));
    const rl = byId("redeemList");
    const reds = allRedemptions(db);
    rl.replaceChildren(
      ...reds.map((r) => {
        const given = r.given_at !== null;
        const info = h("span", {}, `${r.price} stars · ${day(r.redeemed_at)}`);
        const k = kids.get(r.kid_id);
        if (k && kids.size > 1) info.prepend(h("span", { class: "kid-tag" }, avatar(k), k.name), " · ");
        if (r.given_at) info.append(` · given ${day(r.given_at)}`);
        const chip = h(
          "button",
          { type: "button", class: `chip ${given ? "on" : "todo"}`, "aria-pressed": given ? "true" : "false" },
          ...(given ? [icon("check"), "Given"] : ["Not given"])
        );
        chip.addEventListener("click", () => {
          setGiven(db, r.id, !given);
          render();
        });
        return h(
          "div",
          { class: "item" },
          h("span", { class: "thumb" }, giftPic(r.image_key, r.reward_id ?? r.id)),
          h("span", { class: "meta" }, h("b", {}, r.name), info),
          chip
        );
      })
    );
    if (!reds.length) rl.append(h("span", { class: "empty" }, "No gifts traded yet."));

    // Settings
    byId("starLabel").textContent = `${kid.name}'s stars`;
    byId("starOut").textContent = String(renderStars());
    byId("soundToggle").setAttribute("aria-checked", soundOn(db) ? "true" : "false");
    const c = db.one<Record<string, number>>(
      `SELECT (SELECT COUNT(*) FROM kids) AS kids, (SELECT COUNT(*) FROM photos) AS photos,
        (SELECT COUNT(*) FROM rewards WHERE active = 1) AS gifts, (SELECT COUNT(*) FROM puzzles) AS puzzles`
    )!;
    renderShare();
    byId("dbInfo").textContent =
      `${getApp().sync.code ? "Shared with your family" : "Saved on this iPad"}: ${c.kids} ${c.kids === 1 ? "child" : "children"} · ${c.photos} pictures · ` +
      `${c.gifts} gifts · ${c.puzzles} puzzles finished`;
  }
}
