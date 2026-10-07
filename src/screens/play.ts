// The puzzle screen: a wooden frame with every slot's outline drawn on a gray board, and the
// pieces waiting around it. The child drags pieces in and out; see src/puzzle/board.ts for the rules.

import { cellAt, deal, dealOrder, drop, isCorrect, isFull, isSolved, lift, piecesOnBoard, type BoardState, type Loc } from "../puzzle/board";
import { cropRect, gridFor, makeEdges, outlinePath, pieceOutline, rng, type Edges, type PieceCount } from "../puzzle/geometry";
import { FRAME_BORDER, layoutWithReference, pieceMargin, REF_PAD, type Layout, type Rect } from "../puzzle/layout";
import { byId, h } from "../ui/dom";
import { current, go, onEnter } from "../ui/nav";
import { returnSound, snapSound, unlockAudio } from "../ui/sound";
import { stageSize, toStage } from "../ui/stage";

const TOP_BAR = 104;
const HINT_MS = 2500;
/** The whole picture in the top-right corner, for the child to look at while building it. */
const REFERENCE = { top: 16 - TOP_BAR, right: 36, max: 180 };

export interface Solved {
  photoId: number;
  pieces: number;
  /** The whole picture, cropped to the puzzle's shape. */
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
  rows: number;
  cols: number;
  img: HTMLImageElement;
  E: Edges;
  L: Layout;
  /** The reference picture's card. */
  ref: Rect;
  m: number;
  size: number;
  dpr: number;
  art: HTMLCanvasElement;
  slots: HTMLCanvasElement;
  st: BoardState;
  pieces: Piece[];
  z: number;
  hint: number | null;
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
}

let game: Game | null = null;
let drag: Drag | null = null;
let onSolved: (s: Solved) => void = () => {};

const field = () => byId("playfield");
const fieldSize = () => {
  const s = stageSize();
  return { W: s.width, H: s.height - TOP_BAR };
};

/** Starts a new puzzle from a picture. */
export function startPuzzle(photoId: number, count: PieceCount, img: HTMLImageElement): void {
  const { rows, cols } = gridFor(count);
  const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) | 0;
  go("play");
  const { W, H } = fieldSize();
  const { layout: L, ref } = layoutWithReference(rows, cols, W, H, REFERENCE);
  const order = dealOrder(L.cells.length, rows * cols, rng(seed + 1));
  game = {
    photoId,
    rows,
    cols,
    img,
    E: makeEdges(rows, cols, rng(seed)),
    L,
    ref,
    m: 0,
    size: 0,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    art: document.createElement("canvas"),
    slots: document.createElement("canvas"),
    st: deal(rows, cols, L.cells.length, order),
    pieces: [],
    z: 100,
    hint: null,
    finished: false,
    W,
    H
  };
  hideToast();
  build(game);
}

/** Creates the frame, the slot outlines and the piece canvases for the current layout. */
function build(g: Game): void {
  const pf = field();
  pf.replaceChildren();
  const { s, bx, by, bw, bh } = g.L;
  g.m = pieceMargin(s);
  g.size = s + 2 * g.m;
  const dpr = g.dpr;

  // The picture, cropped to the board's shape.
  g.art.width = Math.round(bw * dpr);
  g.art.height = Math.round(bh * dpr);
  const [sx, sy, sw, sh] = cropRect(g.img.width, g.img.height, g.cols / g.rows);
  g.art.getContext("2d")!.drawImage(g.img, sx, sy, sw, sh, 0, 0, g.art.width, g.art.height);

  pf.append(
    h("div", {
      class: "frame",
      style: `left: ${bx - FRAME_BORDER}px; top: ${by - FRAME_BORDER}px; width: ${bw + 2 * FRAME_BORDER}px; height: ${bh + 2 * FRAME_BORDER}px`
    })
  );

  // The reference picture, with the hint button moved to its left.
  const { x: rx, y: ry, w: rw, h: rh } = g.ref;
  const refArt = h("canvas", { "aria-hidden": "true" });
  refArt.width = Math.round((rw - 2 * REF_PAD) * dpr);
  refArt.height = Math.round((rh - 2 * REF_PAD) * dpr);
  refArt.getContext("2d")!.drawImage(g.art, 0, 0, refArt.width, refArt.height);
  pf.append(h("div", { class: "ref-card", style: `left: ${rx}px; top: ${ry}px; width: ${rw}px; height: ${rh}px` }, refArt));
  byId("hintBtn").style.marginRight = `${rw + 16}px`;

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
      el.width = Math.round(g.size * dpr);
      el.height = Math.round(g.size * dpr);
      el.style.width = el.style.height = `${g.size}px`;
      const ctx = el.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const ox = c * s - g.m;
      const oy = r * s - g.m;
      const path = outlinePath(pieceOutline(r, c, s, g.E), ox, oy);
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
      g.pieces.push(p);
      pf.append(el);
      moveTo(g, p, g.st.loc[p.index], false);
    }
  }
  updateProgress(g);
}

function drawSlots(g: Game): void {
  const x = g.slots.getContext("2d")!;
  const { s, bw, bh } = g.L;
  x.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  x.clearRect(0, 0, bw, bh);
  x.fillStyle = "#E4E6E9";
  x.fillRect(0, 0, bw, bh);
  x.lineJoin = "round";
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const path = outlinePath(pieceOutline(r, c, s, g.E));
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
    p.x = Math.round(cx - g.size / 2);
    p.y = Math.round(cy - g.size / 2);
    p.el.style.zIndex = String(++g.z);
    p.el.classList.remove("placed");
  } else {
    const r = Math.floor(loc.cell / g.cols);
    const c = loc.cell % g.cols;
    p.x = g.L.bx + c * g.L.s - g.m;
    p.y = g.L.by + r * g.L.s - g.m;
    p.el.style.zIndex = String(10 + loc.cell);
    p.el.classList.add("placed");
  }
  setPos(p, glide);
}

function setPos(p: Piece, glide = false): void {
  p.el.classList.toggle("glide", glide);
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
    const lx = x - p.x;
    const ly = y - p.y;
    if (lx < 0 || ly < 0 || lx > g.size || ly > g.size) continue;
    // The touch area follows the jigsaw shape, so a tab never steals a neighbour's touch.
    if (p.ctx.isPointInPath(p.path, lx * g.dpr, ly * g.dpr)) return p;
  }
  return null;
}

function onDown(e: PointerEvent): void {
  const g = game;
  if (!g || g.finished || drag) return;
  unlockAudio();
  const pt = toStage(field(), e.clientX, e.clientY);
  const p = hitPiece(g, pt.x, pt.y);
  if (!p) return;
  e.preventDefault();
  field().setPointerCapture(e.pointerId);
  p.el.classList.remove("glide", "wiggle", "placed");
  p.el.classList.add("dragging");
  p.el.style.zIndex = "100000";
  drag = { piece: p, from: lift(g.st, p.index), dx: pt.x - p.x, dy: pt.y - p.y, pointerId: e.pointerId };
  updateProgress(g);
}

function onMove(e: PointerEvent): void {
  const g = game;
  if (!g || !drag || e.pointerId !== drag.pointerId) return;
  const pt = toStage(field(), e.clientX, e.clientY);
  const { W, H } = fieldSize();
  const p = drag.piece;
  p.x = Math.round(Math.max(-g.m, Math.min(W - g.size + g.m, pt.x - drag.dx)));
  p.y = Math.round(Math.max(-g.m, Math.min(H - g.size + g.m, pt.y - drag.dy)));
  setPos(p);
}

function onUp(e: PointerEvent): void {
  const g = game;
  if (!g || !drag || e.pointerId !== drag.pointerId) return;
  const { piece: p, from } = drag;
  drag = null;
  p.el.classList.remove("dragging");
  const cx = p.x + g.size / 2;
  const cy = p.y + g.size / 2;
  const cell = cellAt(g.rows, g.cols, g.L.s, g.L.bx, g.L.by, cx, cy);
  const moves = drop(g.st, p.index, from, { cell, x: cx, y: cy }, g.L.cells);
  for (const mv of moves) moveTo(g, g.pieces[mv.piece], mv.to, true);
  if (cell === null) returnSound();
  else snapSound();
  if (g.hint !== null && isCorrect(g.st, g.hint)) {
    g.hint = null;
    drawSlots(g);
  }
  updateProgress(g);
  if (isFull(g.st)) {
    if (isSolved(g.st)) finish(g);
    else toast("Some pieces are in the wrong spot. Try swapping them!");
  }
}

function finish(g: Game): void {
  g.finished = true;
  hideToast();
  onSolved({ photoId: g.photoId, pieces: g.pieces.length, art: g.art });
}

/** Lights up the right slot for one misplaced piece and wiggles that piece. */
function showHint(): void {
  const g = game;
  if (!g || g.finished) return;
  const wrong = g.pieces.filter((p) => !isCorrect(g.st, p.index) && p !== drag?.piece);
  if (!wrong.length) return;
  const p = wrong[Math.floor(Math.random() * wrong.length)];
  g.hint = p.index;
  drawSlots(g);
  if (!p.el.classList.contains("placed")) p.el.style.zIndex = String(++g.z);
  p.el.classList.remove("wiggle");
  void p.el.offsetWidth;
  p.el.classList.add("wiggle");
  const key = p.index;
  setTimeout(() => {
    if (game === g && g.hint === key) {
      g.hint = null;
      drawSlots(g);
    }
  }, HINT_MS);
}

/** After a rotation or resize: lay out again, keeping placed pieces where they are. */
function relayout(): void {
  const g = game;
  if (!g || current() !== "play") return;
  if (drag) {
    const p = drag.piece;
    drag = null;
    p.el.classList.remove("dragging");
    drop(g.st, p.index, null, { cell: null, x: p.x + g.size / 2, y: p.y + g.size / 2 }, g.L.cells);
  }
  const { W, H } = fieldSize();
  // iPad Safari sends resize events without a real size change (toolbars, safe area); keep everything as is.
  if (W === g.W && H === g.H) return;
  g.W = W;
  g.H = H;
  const { layout: L, ref } = layoutWithReference(g.rows, g.cols, W, H, REFERENCE);
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
  build(g);
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
  });
}

/** For end-to-end tests: where things are, in stage units. */
export function debugState() {
  const g = game;
  if (!g) return null;
  return {
    rows: g.rows,
    cols: g.cols,
    s: g.L.s,
    bx: g.L.bx,
    by: g.L.by,
    size: g.size,
    cells: g.L.cells,
    loc: g.st.loc,
    pieces: g.pieces.map((p) => ({ x: p.x, y: p.y }))
  };
}
