// Choose a picture (import, reuse or delete) and how many pieces, with a preview of the cut.

import { getApp } from "../app";
import { addPhoto, deletePhoto, getPhoto, isBuiltin, listPhotos, touchPhoto, type Photo } from "../data/photos";
import { builtinUrl } from "../pictures";
import { getSetting, setSetting } from "../data/settings";
import { starsFor } from "../data/stars";
import { cropRect, DEFAULT_COUNT, makeEdges, outlinePath, pieceOutline, pieceSize, PIECE_COUNTS, rng, shapeFor, type Edges, type PieceCount } from "../puzzle/geometry";
import { byId, h, twoTapDelete } from "../ui/dom";
import { canvasToJpeg, downscale, loadImageFile, loadImageUrl, onFilePicked } from "../ui/images";
import { onEnter } from "../ui/nav";

const PREVIEW = 440;
const MAX_PHOTO = 1600;

let photoId: number | null = null;
let count: PieceCount = DEFAULT_COUNT;
let editing = false;
let loaded: { id: number; img: HTMLImageElement } | null = null;
const previewEdges = new Map<string, Edges>();

function photoUrl(p: Photo): Promise<string | null> {
  return isBuiltin(p) ? Promise.resolve(builtinUrl(p.file_key)) : getApp().files.url(p.file_key);
}

/** The picture as an image element, decoded once per selection. */
export async function photoImage(id: number): Promise<HTMLImageElement> {
  if (loaded?.id === id) return loaded.img;
  const p = getPhoto(getApp().db, id);
  const url = p && (await photoUrl(p));
  if (!url) throw new Error("Picture is missing");
  const img = await loadImageUrl(url);
  loaded = { id, img };
  return img;
}

const countKey = () => `count:${getApp().kid?.id ?? 0}`;

export function setupChoose(onStart: (photoId: number, count: PieceCount, img: HTMLImageElement) => void): void {
  onEnter("choose", () => {
    editing = false;
    const saved = Number(getSetting(getApp().db, countKey(), String(DEFAULT_COUNT)));
    count = (PIECE_COUNTS as readonly number[]).includes(saved) ? (saved as PieceCount) : DEFAULT_COUNT;
    render();
  });

  byId("libEdit").addEventListener("click", () => {
    editing = !editing;
    render();
  });

  const importFile = async (file: File) => {
    try {
      const c = downscale(await loadImageFile(file), MAX_PHOTO);
      const a = getApp();
      const key = await a.files.put(await canvasToJpeg(c, 0.85));
      photoId = addPhoto(a.db, key, c.width, c.height);
      editing = false;
      render();
    } catch (e) {
      console.error(e);
    }
  };
  onFilePicked(byId<HTMLInputElement>("pickPhoto"), importFile);
  onFilePicked(byId<HTMLInputElement>("takePhoto"), importFile);

  byId("startBtn").addEventListener("click", async () => {
    if (!photoId) return;
    const id = photoId;
    touchPhoto(getApp().db, id);
    setSetting(getApp().db, countKey(), String(count));
    onStart(id, count, await photoImage(id));
  });
}

function render(): void {
  const { db, files } = getApp();
  const photos = listPhotos(db);
  if (!photos.some((p) => p.id === photoId)) photoId = photos[0]?.id ?? null;
  const deletable = photos.some((p) => !isBuiltin(p));
  if (!deletable) editing = false;

  byId("libraryLabel").textContent = `Your pictures (${photos.length})`;
  const edit = byId("libEdit");
  edit.hidden = !deletable;
  edit.textContent = editing ? "Done" : "Delete";

  const lib = byId("library");
  lib.replaceChildren();
  if (!photos.length) {
    lib.append(h("span", { class: "empty", style: "grid-column: 1 / -1" }, 'No pictures yet. Tap "Photo library" or "Take photo" to add one.'));
  }
  for (const p of photos) {
    const on = p.id === photoId;
    const img = h("img", { alt: "" });
    void photoUrl(p).then((u) => u && (img.src = u));
    const b = h("button", { type: "button", class: `thumb-btn${on ? " on" : ""}`, "aria-label": "Choose this picture", "aria-pressed": on ? "true" : "false" }, img);
    b.addEventListener("click", () => {
      photoId = p.id;
      render();
    });
    const item = h("div", { class: "lib-item" }, b);
    if (editing && !isBuiltin(p)) {
      item.append(
        twoTapDelete({
          className: "del-badge",
          label: "Delete this picture",
          armedLabel: "Delete?",
          onConfirm: () => {
            deletePhoto(db, p.id);
            void files.del(p.file_key);
            if (loaded?.id === p.id) loaded = null;
            render();
          }
        })
      );
    }
    lib.append(item);
  }

  byId<HTMLButtonElement>("startBtn").disabled = !photoId;

  const grid = byId("countGrid");
  grid.replaceChildren(
    ...PIECE_COUNTS.map((n) => {
      const b = h("button", { type: "button", class: `count-btn${n === count ? " on" : ""}`, "aria-pressed": n === count ? "true" : "false" }, String(n));
      b.addEventListener("click", () => {
        count = n;
        render();
      });
      return b;
    })
  );
  byId("rewardPreview").textContent = `+${starsFor(count)}`;

  const cv = byId<HTMLCanvasElement>("preview");
  if (!photoId) {
    cv.getContext("2d")!.clearRect(0, 0, cv.width, cv.height);
    return;
  }
  const id = photoId;
  void photoImage(id).then((img) => {
    if (photoId === id) drawPreview(cv, img);
  });
}

/** The whole picture in the puzzle's shape with the jigsaw cut drawn on top. */
function drawPreview(cv: HTMLCanvasElement, img: HTMLImageElement): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = cv.height = PREVIEW * dpr;
  cv.style.width = cv.style.height = `${PREVIEW}px`;
  const x = cv.getContext("2d")!;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { rows, cols, pieceAspect } = shapeFor(count, img.width / img.height);
  const size = Math.floor(Math.min(PREVIEW / cols / Math.min(1, pieceAspect), PREVIEW / rows / Math.min(1, 1 / pieceAspect)));
  const { pw, ph } = pieceSize(size, pieceAspect);
  const bw = cols * pw;
  const bh = rows * ph;
  const ox = (PREVIEW - bw) / 2;
  const oy = (PREVIEW - bh) / 2;
  const key = `${rows}x${cols}`;
  let E = previewEdges.get(key);
  if (!E) {
    E = makeEdges(rows, cols, rng(count * 7919));
    previewEdges.set(key, E);
  }
  x.clearRect(0, 0, PREVIEW, PREVIEW);
  const [sx, sy, sw, sh] = cropRect(img.width, img.height, bw / bh);
  x.save();
  x.beginPath();
  x.roundRect(ox, oy, bw, bh, 16);
  x.clip();
  x.drawImage(img, sx, sy, sw, sh, ox, oy, bw, bh);
  x.strokeStyle = "rgba(255,255,255,0.95)";
  x.lineWidth = Math.min(pw, ph) > 80 ? 3 : 2;
  x.lineJoin = "round";
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) x.stroke(outlinePath(pieceOutline(r, c, pw, ph, E), -ox, -oy));
  x.restore();
}
