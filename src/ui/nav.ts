// One <section class="screen" id="s-NAME"> per screen; exactly one is visible at a time.

export type ScreenName = "login" | "home" | "mode" | "choose" | "play" | "done" | "shop" | "rank" | "parent";

const SCREENS: ScreenName[] = ["login", "home", "mode", "choose", "play", "done", "shop", "rank", "parent"];

type Hook = (name: ScreenName) => void;
const enterHooks = new Map<ScreenName, Hook[]>();
let guard: ((name: ScreenName) => ScreenName) | null = null;
let currentScreen: ScreenName | null = null;

export function onEnter(name: ScreenName, hook: Hook): void {
  const list = enterHooks.get(name) ?? [];
  list.push(hook);
  enterHooks.set(name, list);
}

/** Lets the app redirect navigation, e.g. to the child picker when nobody is signed in. */
export function setGuard(fn: (name: ScreenName) => ScreenName): void {
  guard = fn;
}

export function current(): ScreenName | null {
  return currentScreen;
}

export function go(target: ScreenName): void {
  const name = guard ? guard(target) : target;
  for (const s of SCREENS) {
    const el = document.getElementById(`s-${s}`);
    if (el) el.hidden = s !== name;
  }
  currentScreen = name;
  for (const hook of enterHooks.get(name) ?? []) hook(name);
}

/** Any element with data-go="NAME" navigates when tapped. */
export function wireNavigation(root: HTMLElement): void {
  root.addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-go]");
    if (!t) return;
    const name = t.dataset.go as ScreenName;
    if (SCREENS.includes(name)) go(name);
  });
}
