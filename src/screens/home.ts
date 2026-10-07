import { getApp } from "../app";
import { ungivenCount } from "../data/rewards";
import { avatar } from "../ui/avatar";
import { byId, h } from "../ui/dom";
import { onEnter } from "../ui/nav";

export function setupHome(): void {
  onEnter("home", () => {
    const { db, kid } = getApp();
    const chip = byId("kidChip");
    chip.hidden = !kid;
    if (kid) chip.replaceChildren(avatar(kid), kid.name, h("small", {}, "Switch"));

    // A red count on the parents' gear: gifts traded but not handed out yet, for every child.
    const n = ungivenCount(db);
    const badge = byId("giveBadge");
    badge.hidden = n === 0;
    badge.textContent = String(n);
    byId("parentBtn").setAttribute("aria-label", n ? `Parents, ${n} ${n === 1 ? "gift" : "gifts"} to hand out` : "Parents");
  });
}
