// Soft synthesized sounds, so the app needs no audio files. Respects the parents' Sound setting.

import { getApp } from "../app";
import { soundOn } from "../data/settings";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    // iOS leaves the context "suspended" or "interrupted" after the app was in the background.
    if (ctx.state !== "running") void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** iOS only allows sound after a tap; call this from the first tap so later sounds play. */
export function unlockAudio(): void {
  if (soundOn(getApp().db)) audio();
}

export function tone(freq: number, dur: number, when = 0, vol = 0.15): void {
  if (!soundOn(getApp().db)) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A piece settles into the frame. */
export function snapSound(): void {
  tone(660, 0.12);
  tone(990, 0.1, 0.05, 0.08);
}

/** A soft "back to the side" sound. */
export function returnSound(): void {
  tone(392, 0.1, 0, 0.06);
}

/** The picture is complete. */
export function doneSound(): void {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, i * 0.12, 0.12));
}
