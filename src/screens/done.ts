// "Well done!": records the finished puzzle, then celebrates calmly. Pastel confetti falls once,
// the picture pops in with a shine, and stars fly from "+N" to the star counter.

import { currentKid, getApp } from "../app";
import { soundOn } from "../data/settings";
import { recordPuzzle, starTotal } from "../data/stars";
import { byId } from "../ui/dom";
import { current, go } from "../ui/nav";
import { doneSound, tone } from "../ui/sound";
import { canvasScale, stageScale } from "../ui/stage";
import type { Solved } from "./play";

const MAX = 460;
const SETTLE_MS = 700;
const CONFETTI_COLORS = ["#9EC3E3", "#F3D08A", "#A9D3B2", "#EDB8C0", "#C6BCE6", "#F6E3B4"];

let confettiRun: object | null = null;

function reduceMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Called the moment the last piece lands in place. Stars are saved straight away so nothing is lost
 * if the app is closed; the sound and voice start here because iOS only allows them inside a tap.
 */
export function completePuzzle(s: Solved): void {
  const { db } = getApp();
  const earned = recordPuzzle(db, currentKid().id, s.photoId, s.pieces, s.level);
  void db.flush();
  doneSound();
  sayWellDone();
  // Let the last piece settle before moving on.
  setTimeout(() => {
    if (current() === "play") showDone(s, earned);
  }, SETTLE_MS);
}

function sayWellDone(): void {
  if (!soundOn(getApp().db) || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance("Well done!");
    u.lang = "en-US";
    u.rate = 0.9;
    u.pitch = 1.2;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {
    // No voice on this device; the sound and confetti still play.
  }
}

function showDone(s: Solved, earned: number): void {
  const cv = byId<HTMLCanvasElement>("doneCanvas");
  const dpr = canvasScale();
  const k = Math.min(MAX / s.art.width, MAX / s.art.height);
  const w = Math.round(s.art.width * k);
  const h = Math.round(s.art.height * k);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;
  const x = cv.getContext("2d")!;
  x.imageSmoothingQuality = "high";
  x.drawImage(s.art, 0, 0, cv.width, cv.height);
  byId("earned").textContent = `+${earned}`;
  go("done");
  celebrate(earned);
}

function celebrate(earned: number): void {
  const sec = byId("s-done");
  sec.classList.remove("play");
  void sec.offsetWidth;
  sec.classList.add("play");
  const total = starTotal(getApp().db, currentKid().id);
  const counter = sec.querySelector<HTMLElement>(".topbar [data-stars]")!;
  if (reduceMotion()) {
    counter.textContent = String(total);
    return;
  }
  counter.textContent = String(total - earned);
  confetti(sec);
  flyStars(sec, earned, total);
}

function confetti(sec: HTMLElement): void {
  const cv = byId<HTMLCanvasElement>("confetti");
  const W = sec.offsetWidth;
  const H = sec.offsetHeight;
  // Soft confetti is fine; keep this full-screen canvas light.
  const dpr = canvasScale(2);
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  const x = cv.getContext("2d")!;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bits = Array.from({ length: 90 }, (_, i) => ({
    x: Math.random() * W,
    y: -20 - Math.random() * H * 0.6,
    w: 8 + Math.random() * 8,
    h: 5 + Math.random() * 6,
    vy: 90 + Math.random() * 110,
    vx: -30 + Math.random() * 60,
    r: Math.random() * Math.PI,
    vr: -3 + Math.random() * 6,
    sway: Math.random() * Math.PI * 2,
    c: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    round: Math.random() < 0.35
  }));
  const start = performance.now();
  let last = start;
  const id = {};
  confettiRun = id;
  const frame = (t: number) => {
    if (confettiRun !== id) return;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    const age = (t - start) / 1000;
    // Falls for 3 seconds, then fades out over 1 second.
    const alpha = age < 3 ? 1 : Math.max(0, 1 - (age - 3));
    x.clearRect(0, 0, W, H);
    x.globalAlpha = alpha;
    for (const b of bits) {
      b.y += b.vy * dt;
      b.x += (b.vx + Math.sin(age * 2 + b.sway) * 30) * dt;
      b.r += b.vr * dt;
      x.save();
      x.translate(b.x, b.y);
      x.rotate(b.r);
      x.fillStyle = b.c;
      if (b.round) {
        x.beginPath();
        x.arc(0, 0, b.h * 0.6, 0, Math.PI * 2);
        x.fill();
      } else {
        x.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r)) + 1);
      }
      x.restore();
    }
    if (alpha > 0 && !sec.hidden) requestAnimationFrame(frame);
    else x.clearRect(0, 0, W, H);
  };
  requestAnimationFrame(frame);
}

/** A few stars fly from "+N" to the counter, which counts up with a soft tick for each one. */
function flyStars(sec: HTMLElement, earned: number, total: number): void {
  const pill = sec.querySelector<HTMLElement>(".topbar .stars")!;
  const counter = pill.querySelector<HTMLElement>("[data-stars]")!;
  const n = Math.min(8, Math.max(4, Math.round(earned / 4)));
  let shown = total - earned;
  // Centre of an element, in stage units relative to the screen, for a 40x40 star.
  const local = (el: Element) => {
    const r = el.getBoundingClientRect();
    const sr = sec.getBoundingClientRect();
    const k = stageScale();
    return [(r.left - sr.left + r.width / 2) / k - 20, (r.top - sr.top + r.height / 2) / k - 20];
  };
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      if (sec.hidden) return;
      const [ax, ay] = local(sec.querySelector(".earn svg")!);
      const [bx, by] = local(pill.querySelector("svg")!);
      const st = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      st.setAttribute("class", "fly-star");
      st.innerHTML = '<use href="#i-star"/>';
      st.style.left = `${ax}px`;
      st.style.top = `${ay}px`;
      sec.appendChild(st);
      const mx = (bx - ax) * 0.4 - 60 + i * 15;
      const my = -120 - i * 10;
      const anim = st.animate(
        [
          { transform: "translate(0, 0) scale(0.6)", opacity: 0 },
          { transform: `translate(${mx}px, ${my}px) scale(1.15)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${bx - ax}px, ${by - ay}px) scale(0.7)`, opacity: 1 }
        ],
        { duration: 900, easing: "cubic-bezier(0.4, 0, 0.3, 1)" }
      );
      const land = () => {
        st.remove();
        shown = i === n - 1 ? total : Math.min(total, shown + Math.ceil(earned / n));
        counter.textContent = String(shown);
        pill.classList.remove("bump");
        void pill.offsetWidth;
        pill.classList.add("bump");
        tone(880 + i * 40, 0.08, 0, 0.06);
      };
      anim.onfinish = land;
      anim.oncancel = () => st.remove();
    }, 900 + i * 130);
  }
}
