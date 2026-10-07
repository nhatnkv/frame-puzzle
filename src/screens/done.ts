// "Well done!": the finished picture in its frame.

import { byId } from "../ui/dom";
import { go } from "../ui/nav";
import type { Solved } from "./play";

const MAX = 460;

export function showDone(s: Solved): void {
  const cv = byId<HTMLCanvasElement>("doneCanvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const k = Math.min(MAX / s.art.width, MAX / s.art.height);
  const w = Math.round(s.art.width * k);
  const h = Math.round(s.art.height * k);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;
  cv.getContext("2d")!.drawImage(s.art, 0, 0, cv.width, cv.height);
  go("done");
}
