import { getApp } from "../app";
import { avatar } from "../ui/avatar";
import { byId, h } from "../ui/dom";
import { onEnter } from "../ui/nav";

export function setupHome(): void {
  onEnter("home", () => {
    const kid = getApp().kid;
    const chip = byId("kidChip");
    chip.hidden = !kid;
    if (kid) chip.replaceChildren(avatar(kid), kid.name, h("small", {}, "Switch"));
  });
}
