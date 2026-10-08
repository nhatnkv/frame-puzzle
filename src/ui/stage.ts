// The UI is laid out in "stage" units, designed for an 11-inch iPad in landscape (1194x834).
// The stage is scaled uniformly to fill the window; the shorter side keeps the design size and
// the longer side grows, so every iPad (4:3 to 1.43:1) is filled edge to edge without letterboxing.

export const DESIGN_W = 1194;
export const DESIGN_H = 834;

export interface Fit {
  scale: number;
  width: number;
  height: number;
}

export function computeFit(viewW: number, viewH: number): Fit {
  const w = Math.max(1, viewW);
  const h = Math.max(1, viewH);
  const scale = Math.min(w / DESIGN_W, h / DESIGN_H);
  return { scale, width: w / scale, height: h / scale };
}

let current: Fit = { scale: 1, width: DESIGN_W, height: DESIGN_H };

/** Current stage scale: divide client (CSS pixel) distances by this to get stage units. */
export function stageScale(): number {
  return current.scale;
}

/**
 * Canvas pixels per stage unit. The stage is scaled with a CSS transform, so a canvas needs the
 * screen's pixel ratio times the stage scale to stay sharp when the stage is shown bigger than its
 * design size (a 13-inch iPad, a big browser window).
 */
export function canvasScale(max = 3): number {
  return Math.min(max, (window.devicePixelRatio || 1) * current.scale);
}

export function stageSize(): { width: number; height: number } {
  return { width: current.width, height: current.height };
}

/** Converts a pointer position in client pixels to stage units relative to `el`. */
export function toStage(el: Element, clientX: number, clientY: number): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: (clientX - r.left) / current.scale, y: (clientY - r.top) / current.scale };
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The iPad's status bar and home indicator areas, in CSS pixels (all 0 in a normal browser tab). */
function safeArea(probe: HTMLElement): Insets {
  const cs = getComputedStyle(probe);
  const px = (v: string) => parseFloat(v) || 0;
  return { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
}

export function mountStage(stage: HTMLElement, onResize?: (fit: Fit) => void): void {
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;" +
    "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.append(probe);
  const apply = () => {
    const i = safeArea(probe);
    current = computeFit(window.innerWidth - i.left - i.right, window.innerHeight - i.top - i.bottom);
    stage.style.left = `${i.left}px`;
    stage.style.top = `${i.top}px`;
    stage.style.width = `${current.width}px`;
    stage.style.height = `${current.height}px`;
    stage.style.transform = `scale(${current.scale})`;
    onResize?.(current);
  };
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  apply();
}
