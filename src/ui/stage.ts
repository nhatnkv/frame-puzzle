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

export function stageSize(): { width: number; height: number } {
  return { width: current.width, height: current.height };
}

/** Converts a pointer position in client pixels to stage units relative to `el`. */
export function toStage(el: Element, clientX: number, clientY: number): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: (clientX - r.left) / current.scale, y: (clientY - r.top) / current.scale };
}

export function mountStage(stage: HTMLElement, onResize?: (fit: Fit) => void): void {
  const apply = () => {
    current = computeFit(window.innerWidth, window.innerHeight);
    stage.style.width = `${current.width}px`;
    stage.style.height = `${current.height}px`;
    stage.style.transform = `scale(${current.scale})`;
    onResize?.(current);
  };
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  apply();
}
