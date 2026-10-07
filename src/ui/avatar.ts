import { getApp } from "../app";
import { initial, KID_COLORS, type Kid } from "../data/kids";
import { h } from "./dom";

/** A round avatar: the child's photo, or their initial on their color. */
export function avatar(kid: Pick<Kid, "name" | "color" | "photo_key">, previewUrl?: string | null): HTMLSpanElement {
  const [bg, ink] = KID_COLORS[kid.color % KID_COLORS.length] ?? KID_COLORS[0];
  const a = h("span", { class: "avatar", style: `background: ${bg}; color: ${ink}` }, initial(kid.name || "?"));
  const show = (url: string | null) => {
    if (url) a.replaceChildren(h("img", { alt: "", src: url }));
  };
  if (previewUrl) show(previewUrl);
  else if (kid.photo_key) void getApp().files.url(kid.photo_key).then(show);
  return a;
}
