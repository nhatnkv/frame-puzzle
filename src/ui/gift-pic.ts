import { getApp } from "../app";
import { builtinGiftUrl } from "../gifts";
import { h, icon } from "./dom";

const TINTS = ["#FBEFD6", "#DCE9F4", "#E2F1E5", "#F3E3EC"];

/** The address of a gift's picture: one that comes with the app, or one a parent added. */
export function giftUrl(imageKey: string): Promise<string | null> {
  return Promise.resolve(builtinGiftUrl(imageKey) ?? getApp().files.url(imageKey));
}

/** A gift's picture, or a gift icon on a soft tint when the parents added none. */
export function giftPic(imageKey: string | null, tint: number): HTMLSpanElement {
  const span = h("span", {
    class: "gift-pic",
    style: `background: ${TINTS[Math.abs(tint) % TINTS.length]}`
  }, icon("gift"));
  if (imageKey) {
    void giftUrl(imageKey).then((url) => url && span.replaceChildren(h("img", { alt: "", src: url })));
  }
  return span;
}
