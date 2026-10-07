// Gifts: the child trades stars for a gift the parents added, then sees it under "My gifts"
// with a green tick once Mom or Dad has handed it out.

import { currentKid, getApp, renderStars } from "../app";
import { kidRedemptions, listRewards, redeem, type Reward } from "../data/rewards";
import { byId, h, icon } from "../ui/dom";
import { giftPic } from "../ui/gift-pic";
import { onEnter } from "../ui/nav";
import { doneSound } from "../ui/sound";

let pending: Reward | null = null;

export function setupShop(): void {
  const confirm = byId("confirm");
  const done = byId("redeemed");

  onEnter("shop", () => {
    confirm.hidden = true;
    done.hidden = true;
    pending = null;
    render();
  });

  byId("confirmNo").addEventListener("click", () => {
    confirm.hidden = true;
    pending = null;
  });

  byId("confirmYes").addEventListener("click", () => {
    const g = pending;
    pending = null;
    confirm.hidden = true;
    if (!g) return;
    const r = redeem(getApp().db, currentKid().id, g.id);
    if (!r) {
      render();
      return;
    }
    void getApp().db.flush();
    byId("redeemedPic").replaceChildren(giftPic(r.image_key, r.reward_id ?? r.id));
    done.hidden = false;
    doneSound();
    render();
  });

  byId("redeemedOk").addEventListener("click", () => (done.hidden = true));
}

function render(): void {
  const { db } = getApp();
  const kid = currentKid();
  const stars = renderStars();

  const grid = byId("shopGrid");
  const gifts = listRewards(db);
  grid.replaceChildren(
    ...gifts.map((g) => {
      const can = stars >= g.price;
      const row = h("span", { class: "row" }, h("span", { class: "stars small" }, icon("star"), h("span", {}, String(g.price))));
      if (!can) row.append(h("span", { class: "need" }, `${g.price - stars} more`));
      const b = h(
        "button",
        { type: "button", class: `gift${can ? "" : " locked"}`, "aria-label": `${g.name}, ${g.price} stars` },
        h("span", { class: "pic" }, giftPic(g.image_key, g.id)),
        h("span", { class: "name" }, g.name),
        row
      );
      b.addEventListener("click", () => can && ask(g, stars));
      return b;
    })
  );
  if (!gifts.length) grid.append(h("span", { class: "empty shop-empty" }, "No gifts yet. Ask Mom or Dad to add some."));

  const mine = byId("mineRow");
  const list = kidRedemptions(db, kid.id);
  mine.replaceChildren(
    ...list.map((r) => {
      const given = r.given_at !== null;
      const t = h("span", { class: `thumb${given ? "" : " waiting"}` }, giftPic(r.image_key, r.reward_id ?? r.id));
      if (given) t.append(h("span", { class: "tick" }, icon("check")));
      return h(
        "div",
        { class: "mine-item" },
        t,
        h("span", { class: "mine-name" }, r.name),
        h("span", { class: `mine-state${given ? " ok" : ""}` }, given ? "Received" : "Waiting")
      );
    })
  );
  if (!list.length) mine.append(h("span", { class: "empty" }, "No gifts yet. Finish puzzles to earn stars."));
}

function ask(g: Reward, stars: number): void {
  pending = g;
  byId("confirmPic").replaceChildren(giftPic(g.image_key, g.id));
  byId("confirmTitle").textContent = `Get ${g.name}?`;
  byId("confirmText").textContent = `Uses ${g.price} stars. You will have ${stars - g.price} left.`;
  byId("confirm").hidden = false;
  byId("confirmYes").focus();
}
