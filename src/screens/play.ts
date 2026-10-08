// The puzzle screen: a wooden frame with every slot's outline drawn on a gray board, and the
// pieces waiting around it. The child drags pieces in and out; see src/puzzle/board.ts for the rules.
// At medium and up, pieces may start flipped or turned and a tap puts them round (src/puzzle/levels.ts).
// At Extreme and Ultimate, a piece in the wrong slot or the wrong way round sends every piece in
// the frame back out; at Ultimate it also costs stars, shown beside the close button.

import { currentKid, getApp, renderStars } from "../app";
import { chargeStars } from "../data/stars";
import { cellAt, deal, dealOrder, drop, isCorrect, isFull, isSolved, lift, piecesOnBoard, scatter, type BoardState, type Loc } from "../puzzle/board";
import { cropRect, makeEdges, outlinePath, pieceOutline, rng, shapeFor, type Edges, type PieceCount } from "../puzzle/geometry";
import { FRAME_BORDER, layoutWithReference, pieceMargin, REF_PAD, type Layout, type Rect } from "../puzzle/layout";
import { costsStars, DEFAULT_LEVEL, dealPoses, facesRight, hintCostsStars, hintLimit, hintPercent, poseExtent, poseStyle, rightPose, scattersOnMistake, turns, unturn, type Level } from "../puzzle/levels";
import { byId, h, icon } from "../ui/dom";
import { HEAT } from "../ui/heat";
import { current, go, onEnter } from "../ui/nav";
import { flipSound, returnSound, scatterSound, snapSound, unlockAudio } from "../ui/sound";
import { canvasScale, stageScale, stageSize, toStage } from "../ui/stage";

const TOP_BAR = 104;
const HINT_MS = 2500;
/** At Extreme and Ultimate, how long a wrong piece shows in its slot before every piece jumps out. */
const SCATTER_MS = 400;
/** A touch that moves less than this (stage units) and lets go within TAP_MS is a tap, not a drag. */
const TAP_SLOP = 10;
const TAP_MS = 500;
/** The whole picture in the top-right corner, for the child to look at while building it. */
const REFERENCE = { top: 16 - TOP_BAR, right: 36, max: 180 };
/** The reference picture shown big: room left around it, its white border, and how long it takes to grow. */
const ZOOM_MARGIN = 56;
const ZOOM_PAD = 12;
const ZOOM_MS = 280;

export interface Solved {
  photoId: number;
  pieces: number;
  level: Level;
  /** The whole picture, in the puzzle's shape. */
  art: HTMLCanvasElement;
}

interface Piece {
  index: number;
  el: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  path: Path2D;
  x: number;
  y: number;
}

interface Game {
  photoId: number;
  level: Level;
  /** For each piece, how it faces; see src/puzzle/levels.ts. Kept across a relayout. */
  poses: number[];
  rows: number;
  cols: number;
  /** Width / height of one piece; the frame takes the picture's shape. */
  pieceAspect: number;
  img: HTMLImageElement;
  E: Edges;
  L: Layout;
  /** The reference picture's card. */
  ref: Rect;
  /** Margin around a piece for its tabs, and the size of a piece's canvas. */
  m: number;
  cw: number;
  ch: number;
  dpr: number;
  art: HTMLCanvasElement;
  slots: HTMLCanvasElement;
  st: BoardState;
  pieces: Piece[];
  z: number;
  hint: number | null;
  /** Hints used in this puzzle: at Hard only 5 are allowed, at Extreme each one costs more. */
  hintsUsed: number;
  /** While pieces jump out after a mistake; nothing can be picked up until they land. */
  busy: boolean;
  finished: boolean;
  /** Playfield size the layout was made for. */
  W: number;
  H: number;
}

interface Drag {
  piece: Piece;
  from: Loc | null;
  dx: number;
  dy: number;
  pointerId: number;
  /** Where and when the touch started, to tell a tap from a drag. */
  sx: number;
  sy: number;
  t: number;
  moved: boolean;
}

let game: Game | null = null;
let drag: Drag | null = null;
/** The reference picture shown big in the middle of the screen, while it is open. */
let zoom: HTMLElement | null = null;
let onSolved: (s: Solved) => void = () => {};

const field = () => byId("playfield");
const fieldSize = () => {
  const s = stageSize();
  return { W: s.width, H: s.height - TOP_BAR };
};

/** Starts a new puzzle from a picture. */
export function startPuzzle(photoId: number, count: PieceCount, img: HTMLImageElement, level: Level = DEFAULT_LEVEL): void {
  const { rows, cols, pieceAspect } = shapeFor(count, img.width / img.height);
  const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) | 0;
  go("play");
  const { W, H } = fieldSize();
  const { layout: L, ref } = layoutWithReference(rows, cols, W, H, REFERENCE, pieceAspect, turns(level));
  const order = dealOrder(L.cells.length, rows * cols, rng(seed + 1));
  game = {
    photoId,
    level,
    poses: dealPoses(level, rows * cols, rng(seed + 2)),
    rows,
    cols,
    pieceAspect,
    img,
    E: makeEdges(rows, cols, rng(seed)),
    L,
    ref,
    m: 0,
    cw: 0,
    ch: 0,
    dpr: canvasScale(),
    art: document.createElement("canvas"),
    slots: document.createElement("canvas"),
    st: deal(rows, cols, L.cells.length, order),
    pieces: [],
    z: 100,
    hint: null,
    hintsUsed: 0,
    busy: false,
    finished: false,
    W,
    H
  };
  hideToast();
  build(game);
}

/** Creates the frame, the slot outlines and the piece canvases for the current layout. */
function build(g: Game): void {
  closeZoom(false);
  const pf = field();
  pf.replaceChildren();
  const { pw, ph, bx, by, bw, bh } = g.L;
  g.m = pieceMargin(pw, ph);
  g.cw = pw + 2 * g.m;
  g.ch = ph + 2 * g.m;
  const dpr = g.dpr;

  // The picture in the board's shape: the whole picture, cropped only if it is extremely long.
  g.art.width = Math.round(bw * dpr);
  g.art.height = Math.round(bh * dpr);
  const [sx, sy, sw, sh] = cropRect(g.img.width, g.img.height, bw / bh);
  const ax = g.art.getContext("2d")!;
  ax.imageSmoothingQuality = "high";
  ax.drawImage(g.img, sx, sy, sw, sh, 0, 0, g.art.width, g.art.height);

  pf.append(
    h("div", {
      class: "frame",
      style: `left: ${bx - FRAME_BORDER}px; top: ${by - FRAME_BORDER}px; width: ${bw + 2 * FRAME_BORDER}px; height: ${bh + 2 * FRAME_BORDER}px`
    })
  );

  // The reference picture, with the hint button moved to its left. A tap shows it big.
  const { x: rx, y: ry, w: rw, h: rh } = g.ref;
  const refArt = h("canvas", { "aria-hidden": "true" });
  refArt.width = Math.round((rw - 2 * REF_PAD) * dpr);
  refArt.height = Math.round((rh - 2 * REF_PAD) * dpr);
  const refCtx = refArt.getContext("2d")!;
  refCtx.imageSmoothingQuality = "high";
  refCtx.drawImage(g.art, 0, 0, refArt.width, refArt.height);
  const refStyle = `left: ${rx}px; top: ${ry}px; width: ${rw}px; height: ${rh}px`;
  pf.append(h("div", { class: "ref-card", role: "button", "aria-label": "Show the picture big", style: refStyle }, refArt));
  byId("hintWrap").style.marginRight = `${rw + 16}px`;
  renderHint(g);

  g.slots.className = "slots";
  g.slots.width = Math.round(bw * dpr);
  g.slots.height = Math.round(bh * dpr);
  Object.assign(g.slots.style, { left: `${bx}px`, top: `${by}px`, width: `${bw}px`, height: `${bh}px` });
  pf.append(g.slots);
  drawSlots(g);

  g.pieces = [];
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const el = h("canvas", { class: "piece" });
      el.width = Math.round(g.cw * dpr);
      el.height = Math.round(g.ch * dpr);
      el.style.width = `${g.cw}px`;
      el.style.height = `${g.ch}px`;
      const ctx = el.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const ox = c * pw - g.m;
      const oy = r * ph - g.m;
      const path = outlinePath(pieceOutline(r, c, pw, ph, g.E), ox, oy);
      ctx.save();
      ctx.clip(path);
      ctx.drawImage(g.art, -ox, -oy, bw, bh);
      ctx.restore();
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(61,66,74,0.22)";
      ctx.lineWidth = 2.5;
      ctx.stroke(path);
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1.5;
      ctx.stroke(path);
      const p: Piece = { index: r * g.cols + c, el, ctx, path, x: 0, y: 0 };
      showPose(g, p);
      g.pieces.push(p);
      pf.append(el);
      moveTo(g, p, g.st.loc[p.index], false);
    }
  }
  updateProgress(g);
}

function drawSlots(g: Game): void {
  const x = g.slots.getContext("2d")!;
  const { pw, ph, bw, bh } = g.L;
  x.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  x.clearRect(0, 0, bw, bh);
  x.fillStyle = "#E4E6E9";
  x.fillRect(0, 0, bw, bh);
  x.lineJoin = "round";
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const path = outlinePath(pieceOutline(r, c, pw, ph, g.E));
      const hint = g.hint === r * g.cols + c;
      if (hint) {
        x.fillStyle = "rgba(79,135,184,0.18)";
        x.fill(path);
      }
      x.strokeStyle = hint ? "#4F87B8" : "#BFC4CB";
      x.lineWidth = hint ? 4 : 2;
      x.stroke(path);
    }
  }
}

/** Puts a piece's canvas where its location says, gliding there if asked. */
function moveTo(g: Game, p: Piece, loc: Loc | null, glide: boolean): void {
  if (!loc) return;
  if (loc.kind === "tray") {
    const [cx, cy] = g.L.cells[loc.index];
    p.x = Math.round(cx - g.cw / 2);
    p.y = Math.round(cy - g.ch / 2);
    p.el.style.zIndex = String(++g.z);
    p.el.classList.remove("placed");
  } else {
    const r = Math.floor(loc.cell / g.cols);
    const c = loc.cell % g.cols;
    p.x = g.L.bx + c * g.L.pw - g.m;
    p.y = g.L.by + r * g.L.ph - g.m;
    p.el.style.zIndex = String(10 + loc.cell);
    p.el.classList.add("placed");
  }
  setPos(p, glide);
}

/** Shows how a piece faces; changing it animates the flip or turn. */
function showPose(g: Game, p: Piece): void {
  const { scale, rotate } = poseStyle(g.level, g.poses[p.index]);
  p.el.style.scale = scale;
  p.el.style.rotate = rotate;
}

/** A tap flips the piece (medium) or turns it a quarter turn clockwise (hard and up). */
function turnPiece(g: Game, p: Piece): void {
  g.poses[p.index]++;
  showPose(g, p);
  flipSound();
}

/** In its own slot and the right way round. */
function pieceDone(g: Game, i: number): boolean {
  return isCorrect(g.st, i) && facesRight(g.level, g.poses[i]);
}

function setPos(p: Piece, glide = false): void {
  p.el.classList.toggle("glide", glide);
  p.el.classList.remove("scatter");
  p.el.style.left = `${p.x}px`;
  p.el.style.top = `${p.y}px`;
}

function updateProgress(g: Game): void {
  byId("progress").textContent = `${piecesOnBoard(g.st)} / ${g.pieces.length}`;
}

function hitPiece(g: Game, x: number, y: number): Piece | null {
  // Topmost first: the dragged and loose pieces are above the placed ones.
  const list = [...g.pieces].sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex));
  for (const p of list) {
    // Into the piece's own coordinates, undoing a flip or turn.
    const [ux, uy] = unturn(g.level, g.poses[p.index], x - p.x - g.cw / 2, y - p.y - g.ch / 2);
    const lx = ux + g.cw / 2;
    const ly = uy + g.ch / 2;
    if (lx < 0 || ly < 0 || lx > g.cw || ly > g.ch) continue;
    // The touch area follows the jigsaw shape, so a tab never steals a neighbour's touch.
    if (p.ctx.isPointInPath(p.path, lx * g.dpr, ly * g.dpr)) return p;
  }
  return null;
}

function onDown(e: PointerEvent): void {
  const g = game;
  if (!g || g.finished || g.busy || drag) return;
  unlockAudio();
  const pt = toStage(field(), e.clientX, e.clientY);
  const p = hitPiece(g, pt.x, pt.y);
  if (!p) {
    // A piece lying over the reference picture is picked up first; otherwise a tap shows it big.
    if (e.target instanceof Element && e.target.closest(".ref-card")) {
      e.preventDefault();
      openZoom(g);
    }
    return;
  }
  e.preventDefault();
  field().setPointerCapture(e.pointerId);
  p.el.classList.remove("glide", "wiggle", "placed");
  p.el.classList.add("dragging");
  p.el.style.zIndex = "100000";
  drag = {
    piece: p,
    from: lift(g.st, p.index),
    dx: pt.x - p.x,
    dy: pt.y - p.y,
    pointerId: e.pointerId,
    sx: pt.x,
    sy: pt.y,
    t: performance.now(),
    moved: false
  };
  updateProgress(g);
}

function onMove(e: PointerEvent): void {
  const g = game;
  if (!g || !drag || e.pointerId !== drag.pointerId) return;
  const pt = toStage(field(), e.clientX, e.clientY);
  if (Math.hypot(pt.x - drag.sx, pt.y - drag.sy) > TAP_SLOP) drag.moved = true;
  const { W, H } = fieldSize();
  const p = drag.piece;
  // Keep the piece on screen, as far as it reaches the way it is turned.
  const [hw, hh] = poseExtent(g.level, g.poses[p.index], g.cw, g.ch);
  const cx = Math.max(hw - g.m, Math.min(W - hw + g.m, pt.x - drag.dx + g.cw / 2));
  const cy = Math.max(hh - g.m, Math.min(H - hh + g.m, pt.y - drag.dy + g.ch / 2));
  p.x = Math.round(cx - g.cw / 2);
  p.y = Math.round(cy - g.ch / 2);
  setPos(p);
}

function onUp(e: PointerEvent): void {
  const g = game;
  if (!g || !drag || e.pointerId !== drag.pointerId) return;
  const { piece: p, from } = drag;
  const tap = !drag.moved && performance.now() - drag.t < TAP_MS && e.type === "pointerup";
  drag = null;
  p.el.classList.remove("dragging");
  // A tap leaves the piece where it was, so it lands back in the same place.
  const cx = p.x + g.cw / 2;
  const cy = p.y + g.ch / 2;
  const cell = cellAt(g.rows, g.cols, g.L.pw, g.L.ph, g.L.bx, g.L.by, cx, cy);
  const moves = drop(g.st, p.index, from, { cell, x: cx, y: cy }, g.L.cells);
  for (const mv of moves) moveTo(g, g.pieces[mv.piece], mv.to, true);
  // At Extreme and Ultimate every piece in the frame is already right, so a tap there turns nothing.
  const strict = scattersOnMistake(g.level);
  if (tap && g.level !== "easy" && !(strict && cell !== null)) turnPiece(g, p);
  else if (cell === null) returnSound();
  else if (strict && !pieceDone(g, p.index)) return mistake(g);
  else snapSound();
  afterChange(g);
}

/**
 * Extreme and Ultimate: a piece went into a slot that is not its own, or the wrong way round. It
 * shows there for a moment, then every piece in the frame jumps back out to the sides. At Ultimate
 * the stars it cost drop off the counter at once.
 */
function mistake(g: Game): void {
  g.busy = true;
  updateProgress(g);
  if (costsStars(g.level)) {
    const { db } = getApp();
    const lost = chargeStars(db, currentKid().id, "mistake");
    void db.flush();
    if (lost) loseStars(lost);
  }
  setTimeout(() => {
    if (game !== g) return;
    g.busy = false;
    for (const mv of scatter(g.st, Math.random)) {
      const q = g.pieces[mv.piece];
      moveTo(g, q, mv.to, true);
      q.el.classList.add("scatter");
    }
    scatterSound();
    if (g.hint !== null) {
      g.hint = null;
      drawSlots(g);
    }
    updateProgress(g);
  }, SCATTER_MS);
}

/** Clears a hint that is no longer needed, and finishes or nudges once the frame is full. */
function afterChange(g: Game): void {
  if (g.hint !== null && pieceDone(g, g.hint)) {
    g.hint = null;
    drawSlots(g);
  }
  updateProgress(g);
  if (!isFull(g.st)) return;
  if (!isSolved(g.st)) toast("Some pieces are in the wrong spot. Try swapping them!");
  else if (g.pieces.every((p) => facesRight(g.level, g.poses[p.index]))) finish(g);
  else if (turns(g.level)) toast("Some pieces are turned the wrong way. Tap them to turn them round!");
  else toast("Some pieces are flipped. Tap them to flip them back!");
}

function finish(g: Game): void {
  g.finished = true;
  hideToast();
  onSolved({ photoId: g.photoId, pieces: g.pieces.length, level: g.level, art: g.art });
}

/** Lights up the right slot for one piece that is not done yet, wiggles it and puts it the right way round. */
function showHint(): void {
  const g = game;
  if (!g || g.finished || g.busy || g.hintsUsed >= hintLimit(g.level)) return;
  const wrong = g.pieces.filter((p) => !pieceDone(g, p.index) && p !== drag?.piece);
  if (!wrong.length) return;
  if (hintCostsStars(g.level)) {
    const { db } = getApp();
    const lost = chargeStars(db, currentKid().id, "hint", hintPercent(g.hintsUsed));
    void db.flush();
    if (lost) loseStars(lost);
  }
  g.hintsUsed++;
  renderHint(g);
  const p = wrong[Math.floor(Math.random() * wrong.length)];
  g.hint = p.index;
  drawSlots(g);
  if (!p.el.classList.contains("placed")) p.el.style.zIndex = String(++g.z);
  p.el.classList.remove("wiggle");
  void p.el.offsetWidth;
  p.el.classList.add("wiggle");
  if (!facesRight(g.level, g.poses[p.index])) {
    g.poses[p.index] = rightPose(g.level, g.poses[p.index]);
    showPose(g, p);
    flipSound();
    afterChange(g);
  }
  const key = p.index;
  setTimeout(() => {
    if (game === g && g.hint === key) {
      g.hint = null;
      drawSlots(g);
    }
  }, HINT_MS);
}

/**
 * The light bulb and what is beside it: at Hard, the hints left; at Extreme, what the next hint
 * costs. Both warm from green to red as hints run out or get dearer. Ultimate has no light bulb.
 */
function renderHint(g: Game): void {
  const limit = hintLimit(g.level);
  const left = limit - g.hintsUsed;
  byId("hintWrap").hidden = limit === 0;
  const btn = byId<HTMLButtonElement>("hintBtn");
  btn.disabled = left <= 0;
  const label = byId("hintLeft");
  label.hidden = !Number.isFinite(limit) && !hintCostsStars(g.level);
  const heat = HEAT[Math.min(HEAT.length - 1, g.hintsUsed)];
  if (Number.isFinite(limit)) {
    label.textContent = `${left} left`;
    label.style.color = left > 0 ? heat : "var(--muted)";
    btn.setAttribute("aria-label", `Hint, ${left} left`);
  } else if (hintCostsStars(g.level)) {
    const pct = hintPercent(g.hintsUsed);
    label.textContent = `-${pct}%`;
    label.style.color = heat;
    btn.setAttribute("aria-label", `Hint, costs ${pct}% of your stars`);
  } else {
    btn.setAttribute("aria-label", "Hint");
  }
}

/** After a rotation or resize: lay out again, keeping placed pieces where they are. */
function relayout(): void {
  const g = game;
  if (!g || current() !== "play") return;
  const { W, H } = fieldSize();
  const dpr = canvasScale();
  if (W === g.W && H === g.H) {
    // iPad Safari sends resize events without a real size change (toolbars, safe area), even in the
    // middle of a drag; keep everything as is, including the piece in the child's hand.
    if (dpr === g.dpr || drag) return;
    // The same layout shown bigger or smaller: draw everything again at the new sharpness.
    g.dpr = dpr;
    build(g);
    return;
  }
  if (drag) {
    const p = drag.piece;
    drag = null;
    p.el.classList.remove("dragging");
    drop(g.st, p.index, null, { cell: null, x: p.x + g.cw / 2, y: p.y + g.ch / 2 }, g.L.cells);
  }
  g.W = W;
  g.H = H;
  const { layout: L, ref } = layoutWithReference(g.rows, g.cols, W, H, REFERENCE, g.pieceAspect, turns(g.level));
  const n = g.rows * g.cols;
  const st: BoardState = { rows: g.rows, cols: g.cols, loc: Array(n).fill(null), tray: Array(L.cells.length).fill(null), board: Array(n).fill(null) };
  // Loose pieces are dealt out again in a random order, so they never line up in picture order.
  const loose = g.st.loc.filter((loc) => loc?.kind !== "board").length;
  const order = dealOrder(L.cells.length, loose, Math.random);
  let next = 0;
  g.st.loc.forEach((loc, piece) => {
    if (loc?.kind === "board") {
      st.board[loc.cell] = piece;
      st.loc[piece] = loc;
    } else {
      const index = order[next++];
      st.tray[index] = piece;
      st.loc[piece] = { kind: "tray", index };
    }
  });
  g.L = L;
  g.ref = ref;
  g.st = st;
  g.dpr = dpr;
  build(g);
}

function reduceMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Shows the reference picture big in the middle of the screen, growing out of its corner card.
 * A tap anywhere puts it back; the pieces wait underneath until then.
 */
function openZoom(g: Game): void {
  if (zoom) return;
  const { width: SW, height: SH } = stageSize();
  const aspect = g.L.bw / g.L.bh;
  const k = Math.min((SW - 2 * ZOOM_MARGIN - 2 * ZOOM_PAD) / aspect, SH - 2 * ZOOM_MARGIN - 2 * ZOOM_PAD);
  const iw = Math.round(k * aspect);
  const ih = Math.round(k);
  const cw = iw + 2 * ZOOM_PAD;
  const ch = ih + 2 * ZOOM_PAD;
  const cx = Math.round((SW - cw) / 2);
  const cy = Math.round((SH - ch) / 2);

  // Drawn from the photo itself, not the board-sized picture, so it stays sharp this big.
  const [sx, sy, sw, sh] = cropRect(g.img.width, g.img.height, aspect);
  const res = Math.max(0.1, Math.min(canvasScale(), sw / iw));
  const art = h("canvas", { "aria-hidden": "true" });
  art.width = Math.round(iw * res);
  art.height = Math.round(ih * res);
  const ctx = art.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(g.img, sx, sy, sw, sh, 0, 0, art.width, art.height);

  const card = h("div", { class: "zoom-card", style: `left: ${cx}px; top: ${cy}px; width: ${cw}px; height: ${ch}px` }, art);
  const z = h("div", { class: "zoom", role: "button", "aria-label": "Make the picture small again" }, card);
  z.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    closeZoom(true);
  });
  byId("s-play").append(z);
  zoom = z;
  const small = field().querySelector<HTMLElement>(".ref-card");
  if (small) small.style.visibility = "hidden";
  if (reduceMotion()) return;
  card.animate([{ transform: fromRef(g, cx, cy, cw) }, { transform: "none" }], { duration: ZOOM_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
  z.animate([{ backgroundColor: "rgba(61, 66, 74, 0)" }, {}], { duration: ZOOM_MS, easing: "ease-out" });
}

/** Puts the big picture back into its corner card, shrinking it there unless `animate` is false. */
function closeZoom(animate: boolean): void {
  const z = zoom;
  if (!z) return;
  zoom = null;
  const g = game;
  const card = z.querySelector<HTMLElement>(".zoom-card")!;
  const done = () => {
    z.remove();
    const small = field().querySelector<HTMLElement>(".ref-card");
    if (small) small.style.visibility = "";
  };
  if (!animate || !g || reduceMotion()) return done();
  // Let go of the screen at once, so the child can pick up a piece while it shrinks.
  z.style.pointerEvents = "none";
  const to = fromRef(g, card.offsetLeft, card.offsetTop, card.offsetWidth);
  card.animate([{ transform: "none" }, { transform: to }], { duration: ZOOM_MS, easing: "cubic-bezier(0.4, 0, 0.6, 1)", fill: "forwards" }).onfinish = done;
  z.animate([{}, { backgroundColor: "rgba(61, 66, 74, 0)" }], { duration: ZOOM_MS, easing: "ease-in", fill: "forwards" });
}

/** The transform that puts the big card (at x, y, w wide, on the screen) over the small one in the corner. */
function fromRef(g: Game, x: number, y: number, w: number): string {
  const k = g.ref.w / w;
  return `translate(${g.ref.x - x}px, ${g.ref.y + TOP_BAR - y}px) scale(${k})`;
}

/** Ultimate: the counter beside the close button drops, flashes red, and "-N" falls away from it. */
function loseStars(lost: number): void {
  renderStars();
  const pill = byId("playStars");
  pill.classList.remove("lose");
  void pill.offsetWidth;
  pill.classList.add("lose");
  if (reduceMotion()) return;
  const sec = byId("s-play");
  const r = pill.getBoundingClientRect();
  const sr = sec.getBoundingClientRect();
  const k = stageScale();
  const drop = h("div", { class: "lose-stars", "aria-hidden": "true" }, `-${lost}`, icon("star"));
  drop.style.left = `${(r.left - sr.left) / k + r.width / k / 2}px`;
  drop.style.top = `${(r.bottom - sr.top) / k}px`;
  sec.append(drop);
  drop.addEventListener("animationend", () => drop.remove());
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
function toast(text: string): void {
  const t = byId("toast");
  t.textContent = text;
  t.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 3200);
}
function hideToast(): void {
  byId("toast").hidden = true;
}

/** Leaving needs the close button held for 2 seconds, so a stray tap does not end the game. */
function setupExit(): void {
  const btn = byId("exitBtn");
  let timer: ReturnType<typeof setTimeout> | null = null;
  const end = () => {
    btn.classList.remove("pressing");
    if (timer) clearTimeout(timer);
    timer = null;
  };
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btn.classList.add("pressing");
    timer = setTimeout(() => {
      end();
      game = null;
      go("home");
    }, 2000);
  });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) btn.addEventListener(ev, end);
}

export function setupPlay(solved: (s: Solved) => void): void {
  onSolved = solved;
  const pf = field();
  pf.addEventListener("pointerdown", onDown);
  pf.addEventListener("pointermove", onMove);
  pf.addEventListener("pointerup", onUp);
  pf.addEventListener("pointercancel", onUp);
  byId("hintBtn").addEventListener("click", showHint);
  setupExit();
  window.addEventListener("resize", () => requestAnimationFrame(relayout));
  onEnter("play", () => {
    drag = null;
    closeZoom(false);
  });
}

/** For end-to-end tests: where things are, in stage units. */
export function debugState() {
  const g = game;
  if (!g) return null;
  return {
    rows: g.rows,
    cols: g.cols,
    pw: g.L.pw,
    ph: g.L.ph,
    cell: g.L.cell,
    bx: g.L.bx,
    by: g.L.by,
    bw: g.L.bw,
    bh: g.L.bh,
    cw: g.cw,
    ch: g.ch,
    cells: g.L.cells,
    loc: g.st.loc,
    level: g.level,
    poses: g.poses,
    zoomed: zoom !== null,
    ref: g.ref,
    pieces: g.pieces.map((p) => ({ x: p.x, y: p.y }))
  };
}
