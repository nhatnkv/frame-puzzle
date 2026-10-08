// Choose a picture (import, reuse or delete, one category at a time), how many pieces and the level,
// with a preview of the cut.

import { getApp } from "../app";
import { addPhoto, deletePhoto, getPhoto, isBuiltin, listPhotos, touchPhoto, type Photo } from "../data/photos";
import { builtinUrl, categoryOf, type Category } from "../pictures";
import { getSetting, setSetting } from "../data/settings";
import { starsFor } from "../data/stars";
import { DEFAULT_LEVEL, isLevel, LEVELS, type Level } from "../puzzle/levels";
import { cropRect, DEFAULT_COUNT, makeEdges, outlinePath, pieceOutline, pieceSize, PIECE_COUNTS, rng, shapeFor, type Edges, type PieceCount } from "../puzzle/geometry";
import { byId, h, icon, twoTapDelete } from "../ui/dom";
import { canvasToJpeg, downscale, loadImageFile, loadImageUrl, onFilePicked } from "../ui/images";
import { current, onEnter } from "../ui/nav";
import { canvasScale } from "../ui/stage";

const PREVIEW = 440;
const MAX_PHOTO = 1600;

let photoId: number | null = null;
let count: PieceCount = DEFAULT_COUNT;
let level: Level = DEFAULT_LEVEL;
let filter: Filter = "all";
let menuOpen = false;
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

type Filter = "all" | Category;
const FILTERS: Array<{ id: Filter; label: string; icon: string }> = [
  { id: "all", label: "All pictures", icon: "grid" },
  { id: "animals", label: "Animals", icon: "paw" },
  { id: "vehicles", label: "Vehicles", icon: "car" },
  { id: "landscapes", label: "Landscapes", icon: "mountain" },
  { id: "mine", label: "My photos", icon: "photo" }
];
const isFilter = (v: string): v is Filter => FILTERS.some((f) => f.id === v);

const countKey = () => `count:${getApp().kid?.id ?? 0}`;
const filterKey = () => `pictures:${getApp().kid?.id ?? 0}`;
const levelKey = () => `level:${getApp().kid?.id ?? 0}`;

const LEVEL_UI: Record<Level, { label: string; icon: string }> = {
  easy: { label: "Easy", icon: "puzzle" },
  medium: { label: "Medium", icon: "flip" },
  hard: { label: "Hard", icon: "turn" }
};

export function setupChoose(onStart: (photoId: number, count: PieceCount, img: HTMLImageElement, level: Level) => void): void {
  onEnter("choose", () => {
    editing = false;
    const saved = Number(getSetting(getApp().db, countKey(), String(DEFAULT_COUNT)));
    count = (PIECE_COUNTS as readonly number[]).includes(saved) ? (saved as PieceCount) : DEFAULT_COUNT;
    const savedLevel = getSetting(getApp().db, levelKey(), DEFAULT_LEVEL);
    level = isLevel(savedLevel) ? savedLevel : DEFAULT_LEVEL;
    const savedFilter = getSetting(getApp().db, filterKey(), "all");
    filter = isFilter(savedFilter) ? savedFilter : "all";
    menuOpen = false;
    render();
  });

  byId("libEdit").addEventListener("click", () => {
    editing = !editing;
    menuOpen = false;
    render();
  });

  byId("categoryBtn").addEventListener("click", () => {
    menuOpen = !menuOpen;
    render();
  });
  // A tap anywhere else closes the category menu.
  document.addEventListener("pointerdown", (e) => {
    if (!menuOpen || !(e.target instanceof Node)) return;
    if (byId("categoryMenu").contains(e.target) || byId("categoryBtn").contains(e.target)) return;
    menuOpen = false;
    render();
  });

  const importFile = async (file: File) => {
    try {
      const c = downscale(await loadImageFile(file), MAX_PHOTO);
      const a = getApp();
      const key = await a.files.put(await canvasToJpeg(c, 0.85));
      photoId = addPhoto(a.db, key, c.width, c.height);
      editing = false;
      // Show the new photo with the family's other photos.
      setFilter("mine");
      render();
    } catch (e) {
      console.error(e);
    }
  };
  onFilePicked(byId<HTMLInputElement>("pickPhoto"), importFile);
  onFilePicked(byId<HTMLInputElement>("takePhoto"), importFile);

  // Shown bigger or smaller (a rotation, a browser window resized): draw the preview again, sharp.
  window.addEventListener("resize", () =>
    requestAnimationFrame(() => {
      if (current() === "choose" && loaded && loaded.id === photoId) drawPreview(byId<HTMLCanvasElement>("preview"), loaded.img);
    })
  );

  byId("startBtn").addEventListener("click", async () => {
    if (!photoId) return;
    const id = photoId;
    touchPhoto(getApp().db, id);
    setSetting(getApp().db, countKey(), String(count));
    setSetting(getApp().db, levelKey(), level);
    onStart(id, count, await photoImage(id), level);
  });
}

function setFilter(f: Filter): void {
  filter = f;
  menuOpen = false;
  setSetting(getApp().db, filterKey(), f);
}

function render(): void {
  const { db, files } = getApp();
  const all = listPhotos(db);
  const inFilter = (f: Filter) => all.filter((p) => f === "all" || categoryOf(p) === f);
  const photos = inFilter(filter);
  if (!photos.some((p) => p.id === photoId)) photoId = photos[0]?.id ?? null;
  const deletable = photos.some((p) => !isBuiltin(p));
  if (!deletable) editing = false;

  renderCategories(inFilter);
  const edit = byId("libEdit");
  edit.hidden = !deletable;
  edit.textContent = editing ? "Done" : "Delete";

  const lib = byId("library");
  const scroll = lib.scrollLeft;
  lib.replaceChildren();
  lib.classList.toggle("is-empty", !photos.length);
  if (!photos.length) {
    lib.append(h("span", { class: "empty" }, 'No pictures yet. Tap "Photo library" or "Take photo" to add one.'));
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
  // Rebuilding the row keeps where it was scrolled to, and the chosen picture stays in view.
  lib.scrollLeft = scroll;
  const sel = lib.querySelector(".thumb-btn.on")?.parentElement;
  if (sel) {
    if (sel.offsetLeft < lib.scrollLeft) lib.scrollLeft = sel.offsetLeft - 4;
    else if (sel.offsetLeft + sel.offsetWidth > lib.scrollLeft + lib.clientWidth) lib.scrollLeft = sel.offsetLeft + sel.offsetWidth + 4 - lib.clientWidth;
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
  byId("levelRow").replaceChildren(
    ...LEVELS.map((lv) => {
      const on = lv === level;
      const b = h("button", { type: "button", class: `level-btn${on ? " on" : ""}`, "aria-pressed": on ? "true" : "false" }, icon(LEVEL_UI[lv].icon), LEVEL_UI[lv].label);
      b.addEventListener("click", () => {
        level = lv;
        render();
      });
      return b;
    })
  );
  byId("rewardPreview").textContent = `+${starsFor(count, level)}`;

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

/** The category button ("Landscapes (10)") and, when open, the menu of every category. */
function renderCategories(inFilter: (f: Filter) => Photo[]): void {
  const cur = FILTERS.find((f) => f.id === filter)!;
  const btn = byId("categoryBtn");
  btn.setAttribute("aria-expanded", menuOpen ? "true" : "false");
  const chev = icon("chevron");
  chev.classList.add("chev");
  btn.replaceChildren(icon(cur.icon), cur.label, h("span", { class: "cat-count" }, `(${inFilter(filter).length})`), chev);

  const menu = byId("categoryMenu");
  menu.hidden = !menuOpen;
  if (!menuOpen) return;
  menu.replaceChildren(
    ...FILTERS.map((f) => {
      const on = f.id === filter;
      const item = h(
        "button",
        { type: "button", class: `cat-item${on ? " on" : ""}`, "aria-pressed": on ? "true" : "false" },
        icon(f.icon),
        f.label,
        h("span", { class: "cat-count" }, String(inFilter(f.id).length))
      );
      if (on) {
        const tick = icon("check");
        tick.classList.add("cat-tick");
        item.append(tick);
      }
      item.addEventListener("click", () => {
        if (f.id !== filter) {
          editing = false;
          byId("library").scrollLeft = 0;
        }
        setFilter(f.id);
        render();
      });
      return item;
    })
  );
}

/** The whole picture in the puzzle's shape with the jigsaw cut drawn on top. */
function drawPreview(cv: HTMLCanvasElement, img: HTMLImageElement): void {
  const dpr = canvasScale();
  cv.width = cv.height = Math.round(PREVIEW * dpr);
  cv.style.width = cv.style.height = `${PREVIEW}px`;
  const x = cv.getContext("2d")!;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.imageSmoothingQuality = "high";
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
