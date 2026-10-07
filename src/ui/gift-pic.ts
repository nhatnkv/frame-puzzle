import { getApp } from "../app";
import { h, icon } from "./dom";

const TINTS = ["#FBEFD6", "#DCE9F4", "#E2F1E5", "#F3E3EC"];

/** A gift's picture, or a gift icon on a soft tint when the parents added none. */
export function giftPic(imageKey: string | null, tint: number): HTMLSpanElement {
  const span = h("span", {
    class: "gift-pic",
    style: `background: ${TINTS[Math.abs(tint) % TINTS.length]}`
  }, icon("gift"));
  if (imageKey) {
    void getApp()
      .files.url(imageKey)
      .then((url) => url && span.replaceChildren(h("img", { alt: "", src: url })));
  }
  return span;
}
