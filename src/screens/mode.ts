// After Play: Normal (no timer) or Race (a time limit, in minutes, that the child's parents or the
// child set here and is remembered per child). Then the picture and piece count are chosen.

import { getApp } from "../app";
import { getSetting, setSetting } from "../data/settings";
import { clampMinutes, isMode, RACE_DEFAULT, RACE_MAX, RACE_MIN, type Mode } from "../puzzle/race";
import { byId } from "../ui/dom";
import { go, onEnter } from "../ui/nav";

const modeKey = () => `mode:${getApp().kid?.id ?? 0}`;
const minutesKey = () => `race-minutes:${getApp().kid?.id ?? 0}`;

/** How the next puzzle is played, as last chosen for the child who is playing. */
export function playMode(): Mode {
  const m = getSetting(getApp().db, modeKey(), "normal");
  return isMode(m) ? m : "normal";
}

/** The Race time limit for the child who is playing, in minutes. */
export function raceMinutes(): number {
  return clampMinutes(Number(getSetting(getApp().db, minutesKey(), String(RACE_DEFAULT))));
}

export function setupMode(): void {
  const render = () => {
    const n = raceMinutes();
    byId("raceMinutes").textContent = `${n} min`;
    byId<HTMLButtonElement>("raceMinus").disabled = n <= RACE_MIN;
    byId<HTMLButtonElement>("racePlus").disabled = n >= RACE_MAX;
  };
  const step = (d: number) => {
    setSetting(getApp().db, minutesKey(), String(clampMinutes(raceMinutes() + d)));
    render();
  };
  const pick = (m: Mode) => {
    setSetting(getApp().db, modeKey(), m);
    go("choose");
  };
  onEnter("mode", render);
  byId("raceMinus").addEventListener("click", () => step(-1));
  byId("racePlus").addEventListener("click", () => step(1));
  byId("modeNormal").addEventListener("click", () => pick("normal"));
  byId("modeRace").addEventListener("click", () => pick("race"));
}
