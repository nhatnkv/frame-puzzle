import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/** How many pictures come with the app: every file in src/pictures is listed in a category. */
const BUILTIN_COUNT = readdirSync(new URL("../src/pictures/", import.meta.url)).filter((f) => f.endsWith(".jpg")).length;

interface FrameState {
  rows: number;
  cols: number;
  /** Grid cell width and height, waiting cell side. */
  pw: number;
  ph: number;
  cell: number;
  bx: number;
  by: number;
  bw: number;
  bh: number;
  cells: Array<[number, number]>;
  /** Each piece's slot in the frame: one grid cell, or from Hard up two, lying or standing. */
  slots: Array<{ x: number; y: number; w: number; h: number }>;
  loc: Array<{ kind: "tray" | "board"; index?: number; cell?: number }>;
  level: "easy" | "medium" | "hard" | "extreme" | "ultimate";
  ref: { x: number; y: number; w: number; h: number };
  /** How each piece faces: taps since it was the right way round. */
  poses: number[];
  /** Where each piece's canvas is, and its size. */
  pieces: Array<{ x: number; y: number; cw: number; ch: number }>;
}

async function open(page: Page) {
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
}

async function addKid(page: Page, name: string) {
  await page.click(".add-kid");
  await page.fill("#kidName", name);
  await page.click("#kidForm button[type=submit]");
  await expect(page.locator("#kidList .kid-card", { hasText: name })).toBeVisible();
}

async function pickKid(page: Page, name: string) {
  await page.locator("#kidList .kid-card", { hasText: name }).click();
  await expect(page.locator("#s-home")).toBeVisible();
}

async function startPuzzle(page: Page, pieces: number, level?: "Easy" | "Medium" | "Hard" | "Extreme" | "Ultimate") {
  await page.click(".home-card[data-go=choose]");
  // The level first: it decides which piece counts there are.
  if (level) await page.locator(".level-btn", { hasText: level }).click();
  await page.locator(".count-btn", { hasText: new RegExp(`^${pieces}$`) }).click();
  await page.click("#startBtn");
  await expect(page.locator("#s-play")).toBeVisible();
  await expect(page.locator("#progress")).toHaveText(`0 / ${pieces}`);
}

const frame = (page: Page) => page.evaluate(() => (window as unknown as { __frame: () => FrameState }).__frame());

/**
 * Drags a piece by its centre to a frame cell, or to the empty top-left corner of the playfield.
 * `midway` runs while the piece is held, halfway there.
 */
async function dragPiece(page: Page, piece: number, cell: number | "outside", midway?: () => Promise<void>) {
  const s = await frame(page);
  const g = await page.evaluate(() => {
    const pf = document.getElementById("playfield")!.getBoundingClientRect();
    const stage = document.getElementById("stage")!;
    return { x: pf.x, y: pf.y, k: stage.getBoundingClientRect().width / stage.offsetWidth };
  });
  const q = s.pieces[piece];
  const from = [g.x + (q.x + q.cw / 2) * g.k, g.y + (q.y + q.ch / 2) * g.k];
  const slot = cell === "outside" ? null : s.slots[cell];
  const to = slot ? [g.x + (slot.x + slot.w / 2) * g.k, g.y + (slot.y + slot.h / 2) * g.k] : [g.x + 8 * g.k, g.y + 8 * g.k];
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  if (midway) {
    await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 3 });
    await midway();
  }
  await page.mouse.move(to[0], to[1], { steps: 6 });
  await page.mouse.up();
  // Let the glide animation finish before the next drag reads positions.
  await page.waitForTimeout(300);
}

/** Taps a piece in its middle, as a child does to flip or turn it. */
async function tapPiece(page: Page, piece: number, times = 1) {
  for (let i = 0; i < times; i++) {
    const s = await frame(page);
    const g = await page.evaluate(() => {
      const pf = document.getElementById("playfield")!.getBoundingClientRect();
      const stage = document.getElementById("stage")!;
      return { x: pf.x, y: pf.y, k: stage.getBoundingClientRect().width / stage.offsetWidth };
    });
    const q = s.pieces[piece];
    await page.mouse.click(g.x + (q.x + q.cw / 2) * g.k, g.y + (q.y + q.ch / 2) * g.k);
    await page.waitForTimeout(350);
  }
}

const lying = (r: { w: number; h: number }) => r.w > r.h;

/**
 * From Hard up: a slot that is not the piece's own but has the piece's shape the way it is turned
 * now, lying or standing, so the piece goes in there when dragged to it.
 */
function otherSlot(s: FrameState, piece: number): number {
  const lies = lying(s.slots[piece]) !== (s.poses[piece] % 2 === 1);
  return s.slots.findIndex((r, i) => i !== piece && lying(r) === lies);
}

/** The CSS a piece is shown with, to see it flipped or turned. */
const pieceStyle = (page: Page, piece: number) =>
  page.locator(".piece").nth(piece).evaluate((el) => ({ scale: el.style.scale, rotate: el.style.rotate }));

/** A picture made in the page, as a file the photo picker would give. */
async function pictureFile(page: Page, name: string, color: string) {
  const base64 = await page.evaluate((c) => {
    const cv = document.createElement("canvas");
    cv.width = 800;
    cv.height = 600;
    const x = cv.getContext("2d")!;
    x.fillStyle = c;
    x.fillRect(0, 0, 800, 600);
    x.fillStyle = "#FFFFFF";
    x.beginPath();
    x.arc(400, 300, 160, 0, Math.PI * 2);
    x.fill();
    return cv.toDataURL("image/png").split(",")[1];
  }, color);
  return { name, mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}

test("a child solves a puzzle, swapping wrong pieces, and earns stars", async ({ page }) => {
  await open(page);
  await expect(page.locator("#s-login")).toBeVisible();
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await expect(page.locator("#s-home [data-stars]")).toHaveText("0");
  await startPuzzle(page, 4);
  // Easy, as before: every piece faces the right way and a tap changes nothing.
  const start = await frame(page);
  expect(start.level).toBe("easy");
  await tapPiece(page, 0);
  expect(await frame(page)).toMatchObject({ poses: [0, 0, 0, 0], loc: start.loc });

  // Pieces 0 and 1 swapped: the frame is full but not right.
  await dragPiece(page, 0, 1);
  await dragPiece(page, 1, 0);
  await dragPiece(page, 2, 2);
  await dragPiece(page, 3, 3);
  await expect(page.locator("#progress")).toHaveText("4 / 4");
  await expect(page.locator("#toast")).toBeVisible();
  await expect(page.locator("#s-play")).toBeVisible();

  // Dropping piece 0 on its own cell swaps piece 1 back to cell 1.
  await dragPiece(page, 0, 0);
  await expect(page.locator("#s-done")).toBeVisible();
  await expect(page.locator("#earned")).toHaveText("+8");
  await expect(page.locator("#s-done .topbar [data-stars]")).toHaveText("8", { timeout: 6000 });

  await page.click("#s-done [data-go=home]");
  await expect(page.locator("#s-home [data-stars]")).toHaveText("8");
});

test("at medium, a flipped piece fits any slot, and the picture is done once taps flip every piece back", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await startPuzzle(page, 4, "Medium");
  let s = await frame(page);
  expect(s.level).toBe("medium");
  const flipped = s.poses.flatMap((p, i) => (p % 2 ? [i] : []));
  expect(flipped).toHaveLength(2);
  expect(await pieceStyle(page, flipped[0])).toMatchObject({ scale: "-1 1" });

  for (let i = 0; i < 4; i++) await dragPiece(page, i, i);
  await expect(page.locator("#progress")).toHaveText("4 / 4");
  await expect(page.locator("#toast")).toContainText("flip");
  await expect(page.locator("#s-play")).toBeVisible();

  // A tap flips a piece back and leaves it in its slot.
  await tapPiece(page, flipped[0]);
  s = await frame(page);
  expect(s.poses[flipped[0]] % 2).toBe(0);
  expect(s.loc[flipped[0]]).toEqual({ kind: "board", cell: flipped[0] });
  expect((await pieceStyle(page, flipped[0])).scale).not.toContain("-");
  await expect(page.locator("#s-play")).toBeVisible();

  // The light bulb puts the last flipped piece right, which finishes the picture.
  await page.click("#hintBtn");
  await expect(page.locator("#s-done")).toBeVisible();
  await expect(page.locator("#earned")).toHaveText("+24");

  // The level is remembered for this child.
  await page.click("#s-done [data-go=home]");
  await page.click(".home-card[data-go=choose]");
  await expect(page.locator(".level-btn", { hasText: "Medium" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#rewardPreview")).toHaveText("+24");
});

test("at hard, pieces lie or stand, a tap turns a loose one a quarter turn and one in the frame a half turn", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await startPuzzle(page, 4, "Hard");
  const s = await frame(page);
  expect(s.level).toBe("hard");
  expect(s.poses.filter((p) => p % 4).length).toBeGreaterThanOrEqual(2);
  // Every piece is two cells of the grid, lying or standing.
  for (const r of s.slots) expect(Math.round((r.w * r.h) / (s.pw * s.ph))).toBe(2);
  const turnsLeft = (p: number) => (4 - (p % 4)) % 4;

  // Beside the frame, each tap turns a piece a quarter turn clockwise, never back.
  const late = 0;
  await tapPiece(page, late);
  expect((await frame(page)).poses[late]).toBe(s.poses[late] + 1);
  expect(await pieceStyle(page, late)).toMatchObject({ rotate: `${(s.poses[late] + 1) * 90}deg` });
  // Upside down, it still fits its slot; the others are turned round first.
  await tapPiece(page, late, (2 - ((s.poses[late] + 1) % 4) + 4) % 4);
  const upsideDown = (await frame(page)).poses[late];
  expect(upsideDown % 4).toBe(2);
  for (let i = 0; i < 4; i++) {
    if (i !== late) await tapPiece(page, i, turnsLeft(s.poses[i]));
    await dragPiece(page, i, i);
  }
  await expect(page.locator("#progress")).toHaveText("4 / 4");
  await expect(page.locator("#toast")).toContainText("turn");

  // In the frame a tap turns it a half turn, so it stays in its slot, and the picture is done.
  await tapPiece(page, late);
  expect((await frame(page)).poses[late]).toBe(upsideDown + 2);
  await expect(page.locator("#s-done")).toBeVisible();
  await expect(page.locator("#earned")).toHaveText("+40");
});

test("from hard up, a piece only goes into a slot of its shape, lying or standing", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await startPuzzle(page, 30, "Hard");
  const s = await frame(page);
  expect(s.slots.some(lying)).toBe(true);
  expect(s.slots.some((r) => !lying(r))).toBe(true);
  // Turned a quarter from its own shape, a piece dropped on its own slot takes the nearest slot of its new shape.
  const p = s.poses.findIndex((q) => q % 2 === 1);
  await dragPiece(page, p, p);
  const after = await frame(page);
  const at = after.loc[p];
  expect(at.kind).toBe("board");
  expect(at.cell).not.toBe(p);
  expect(lying(after.slots[at.cell!])).toBe(!lying(after.slots[p]));
});

test("at extreme, a piece in the wrong slot or the wrong way round sends every piece in the frame back out", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await page.click(".home-card[data-go=choose]");
  // Each level says what it does under the buttons.
  await page.locator(".level-btn", { hasText: "Extreme" }).click();
  await expect(page.locator("#levelNote")).toContainText("A mistake sends them all out");
  await page.click("#s-choose [data-go=home]");
  await startPuzzle(page, 30, "Extreme");
  const s = await frame(page);
  expect(s.level).toBe("extreme");
  // Pieces turn as at Hard.
  expect(s.poses.filter((p) => p % 4).length).toBeGreaterThanOrEqual(2);
  const turnsLeft = (p: number) => (4 - (p % 4)) % 4;

  // A piece turned the right way round stays in, and a tap in the frame no longer turns it.
  await tapPiece(page, 0, turnsLeft(s.poses[0]));
  await dragPiece(page, 0, 0);
  await expect(page.locator("#progress")).toHaveText("1 / 30");
  const before = (await frame(page)).poses[0];
  await tapPiece(page, 0);
  expect((await frame(page)).poses[0]).toBe(before);
  await expect(page.locator("#progress")).toHaveText("1 / 30");

  // A piece in its own slot but upside down shows for a moment, then every piece jumps out.
  await tapPiece(page, 1, (2 - (s.poses[1] % 4) + 4) % 4);
  await dragPiece(page, 1, 1);
  await expect(page.locator("#progress")).toHaveText("0 / 30");
  expect((await frame(page)).loc.every((l) => l.kind === "tray")).toBe(true);
  await expect(page.locator("#toast")).toBeHidden();
  await page.waitForTimeout(600);

  // So does a piece the right way round in the wrong slot.
  await dragPiece(page, 0, 0);
  await expect(page.locator("#progress")).toHaveText("1 / 30");
  await tapPiece(page, 1, turnsLeft((await frame(page)).poses[1]));
  await dragPiece(page, 1, otherSlot(await frame(page), 1));
  await expect(page.locator("#progress")).toHaveText("0 / 30");
});

test("at ultimate, a mistake also costs 1% of the child's stars, shown beside the close button", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await startPuzzle(page, 2);
  await expect(page.locator("#playStars")).toHaveText("0");
  await dragPiece(page, 0, 0);
  await dragPiece(page, 1, 1);
  await expect(page.locator("#earned")).toHaveText("+4");
  await page.click("#s-done [data-go=home]");
  await expect(page.locator("#s-home [data-stars]")).toHaveText("4");

  await startPuzzle(page, 30, "Ultimate");
  await expect(page.locator("#playStars")).toHaveText("4");
  await dragPiece(page, 0, otherSlot(await frame(page), 0));
  await expect(page.locator("#playStars")).toHaveText("3");
  await expect(page.locator("#progress")).toHaveText("0 / 30");
  await page.waitForTimeout(600);

  // Pieces the right way round in their own slots cost nothing.
  const s = await frame(page);
  for (let i = 0; i < 2; i++) {
    await tapPiece(page, i, (4 - (s.poses[i] % 4)) % 4);
    await dragPiece(page, i, i);
  }
  await expect(page.locator("#progress")).toHaveText("2 / 30");
  await expect(page.locator("#playStars")).toHaveText("3");
});

test("hints run out after 5 at hard, cost more and more stars at extreme and are gone at ultimate", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await startPuzzle(page, 2);
  await expect(page.locator("#hintLeft")).toBeHidden();
  await dragPiece(page, 0, 0);
  await dragPiece(page, 1, 1);
  await page.click("#s-done [data-go=home]");
  await expect(page.locator("#s-home [data-stars]")).toHaveText("4");
  const leave = async () => {
    await page.locator("#exitBtn").hover();
    await page.mouse.down();
    await page.waitForTimeout(2200);
    await page.mouse.up();
    await expect(page.locator("#s-home")).toBeVisible();
  };

  await startPuzzle(page, 30, "Ultimate");
  await expect(page.locator("#hintBtn")).toBeHidden();
  await leave();

  await startPuzzle(page, 30, "Extreme");
  // 1%, 1%, 2%, 3%, ... of the stars, rounded up: 4 stars go down by one each time here.
  for (const [pct, stars] of [["1", "3"], ["1", "2"], ["2", "1"], ["3", "0"]]) {
    await expect(page.locator("#hintLeft")).toHaveText(`-${pct}%`);
    await page.click("#hintBtn");
    await expect(page.locator("#playStars")).toHaveText(stars);
  }
  // Never below zero, and with no stars to pay, no more hints.
  await expect(page.locator("#hintLeft")).toHaveText("-5%");
  await expect(page.locator("#hintBtn")).toBeDisabled();
  await leave();

  await startPuzzle(page, 4, "Hard");
  await expect(page.locator("#hintLeft")).toHaveText("5 left");
  for (let left = 4; left >= 0; left--) {
    await page.click("#hintBtn");
    await expect(page.locator("#hintLeft")).toHaveText(`${left} left`);
  }
  await expect(page.locator("#hintBtn")).toBeDisabled();
  await expect(page.locator("#playStars")).toHaveText("0");
});

test("at ultimate, losing the last star ends the puzzle and locks ultimate until the child earns more", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await startPuzzle(page, 2);
  await dragPiece(page, 0, 0);
  await dragPiece(page, 1, 1);
  await page.click("#s-done [data-go=home]");
  await startPuzzle(page, 30, "Ultimate");
  for (const stars of ["3", "2", "1", "0"]) {
    await dragPiece(page, 0, otherSlot(await frame(page), 0));
    await expect(page.locator("#playStars")).toHaveText(stars);
    if (stars !== "0") await page.waitForTimeout(600);
  }
  await expect(page.locator("#s-choose")).toBeVisible();
  await expect(page.locator(".level-btn", { hasText: "Ultimate" })).toBeDisabled();
  await expect(page.locator(".level-btn", { hasText: "Extreme" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#s-choose [data-stars]")).toHaveText("0");

  // A finished picture brings stars, and Ultimate back.
  await page.locator(".level-btn", { hasText: "Easy" }).click();
  await page.locator(".count-btn", { hasText: /^2$/ }).click();
  await page.click("#startBtn");
  await dragPiece(page, 0, 0);
  await dragPiece(page, 1, 1);
  await page.click("#s-done [data-go=home]");
  await page.click(".home-card[data-go=choose]");
  await expect(page.locator(".level-btn", { hasText: "Ultimate" })).toBeEnabled();
});

test("extreme and ultimate offer only big puzzles, 30 to 70 pieces, and each list keeps its own choice", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await page.click(".home-card[data-go=choose]");
  const counts = () => page.locator(".count-btn").allTextContents();
  const on = page.locator(".count-btn.on");
  expect(await counts()).toEqual(["2", "3", "4", "6", "9", "12", "16", "20", "25", "30", "36", "49"]);
  await page.locator(".count-btn", { hasText: /^9$/ }).click();

  await page.locator(".level-btn", { hasText: "Extreme" }).click();
  expect(await counts()).toEqual(["30", "35", "36", "40", "42", "45", "48", "49", "54", "56", "63", "70"]);
  await expect(on).toHaveText("30");
  await page.locator(".count-btn", { hasText: /^70$/ }).click();
  await expect(page.locator("#rewardPreview")).toHaveText("+1400");

  await page.locator(".level-btn", { hasText: "Hard" }).click();
  await expect(on).toHaveText("9");
  await page.locator(".level-btn", { hasText: "Extreme" }).click();
  await expect(on).toHaveText("70");

  // 70 pieces still fit, every one with a cell of its own beside the frame.
  await page.click("#startBtn");
  await expect(page.locator("#progress")).toHaveText("0 / 70");
  const s = await frame(page);
  expect(s.cells.length).toBeGreaterThanOrEqual(70);
  expect(s.loc.every((l) => l.kind === "tray")).toBe(true);
  // Pieces two grid cells long stay big enough to pick up.
  expect(Math.min(s.pw, s.ph)).toBeGreaterThanOrEqual(24);
});

test("loose pieces never overlap and a piece dropped outside the frame goes back to the side", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await startPuzzle(page, 49);
  const s = await frame(page);
  const centres = s.loc.map((l) => s.cells[l.index!]);
  const gap = s.cell - 0.5;
  for (let i = 0; i < centres.length; i++) {
    for (let j = i + 1; j < centres.length; j++) {
      const apart = Math.abs(centres[i][0] - centres[j][0]) >= gap || Math.abs(centres[i][1] - centres[j][1]) >= gap;
      expect(apart, `pieces ${i} and ${j} overlap`).toBe(true);
    }
  }
  // The whole picture sits in the top-right corner; no waiting piece and no button covers it.
  const clear = await page.evaluate(() => {
    const r = document.querySelector(".ref-card")!.getBoundingClientRect();
    const hit = (b: DOMRect) => b.left < r.right && r.left < b.right && b.top < r.bottom && r.top < b.bottom;
    const pieces = [...document.querySelectorAll<HTMLElement>(".piece")].filter((p) => hit(p.getBoundingClientRect()));
    return { w: r.width, right: window.innerWidth - r.right, pieces: pieces.length, hint: hit(document.getElementById("hintBtn")!.getBoundingClientRect()) };
  });
  expect(clear).toMatchObject({ pieces: 0, hint: false });
  expect(clear.w).toBeGreaterThan(150);
  expect(clear.right).toBeLessThan(60);
  await dragPiece(page, 5, 20);
  expect((await frame(page)).loc[5]).toEqual({ kind: "board", cell: 20 });
  await dragPiece(page, 5, "outside");
  expect((await frame(page)).loc[5].kind).toBe("tray");
  await expect(page.locator("#progress")).toHaveText("0 / 49");
});

test("loose pieces start in a random order and stay put on a resize without a size change", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await startPuzzle(page, 9);
  const inPictureOrder = (s: FrameState) => {
    const cells = s.loc.filter((l) => l.kind === "tray").map((l) => l.index!);
    return cells.every((c, i) => i === 0 || c > cells[i - 1]);
  };
  const before = await frame(page);
  expect(inPictureOrder(before)).toBe(false);
  // iPad Safari fires resize events when its toolbars move, even in the middle of a drag; the
  // pieces must not be dealt again and the piece being dragged must not be let go.
  const toolbarResize = async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForTimeout(100);
  };
  await toolbarResize();
  expect((await frame(page)).pieces).toEqual(before.pieces);
  await dragPiece(page, 4, 4, toolbarResize);
  expect((await frame(page)).loc[4]).toEqual({ kind: "board", cell: 4 });
  // A real size change lays the pieces out again, still in a random order.
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(300);
  const after = await frame(page);
  expect(after.loc[4]).toEqual({ kind: "board", cell: 4 });
  expect(inPictureOrder(after)).toBe(false);
});

test("parents add a gift, the child trades stars for it, and parents hand it out", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await addKid(page, "Na");
  await pickKid(page, "Bin");
  await expect(page.locator("#giveBadge")).toBeHidden();

  await page.click("#parentBtn");
  await page.click("#addGiftBtn");
  await page.fill("#giftName", "Ice cream");
  await page.fill("#giftPrice", "10");
  await page.setInputFiles("#giftImg", await pictureFile(page, "ice-cream.png", "#F3D08A"));
  await expect(page.locator("#giftThumb img")).toBeVisible();
  await page.click("#giftForm button[type=submit]");
  await page.click("#addGiftBtn");
  await page.fill("#giftName", "Teddy bear");
  await page.fill("#giftPrice", "100");
  await page.click("#giftForm button[type=submit]");
  await expect(page.locator("#giftList .item")).toHaveCount(2);
  await page.click("#starPlus");
  await page.click("#starPlus");
  await expect(page.locator("#starOut")).toHaveText("20");
  await expect(page.locator("#starLabel")).toHaveText("Bin's stars");

  await page.click("#s-parent [data-go=home]");
  await page.click(".home-card[data-go=shop]");
  await expect(page.locator("#shopGrid .gift.locked")).toHaveText(/Teddy bear.*80 more/s);
  await page.locator("#shopGrid .gift.locked").click();
  await expect(page.locator("#confirm")).toBeHidden();
  await page.locator("#shopGrid .gift", { hasText: "Ice cream" }).click();
  await expect(page.locator("#confirmText")).toHaveText("Uses 10 stars. You will have 10 left.");
  await page.click("#confirmYes");
  await expect(page.locator("#redeemed")).toBeVisible();
  await page.click("#redeemedOk");
  await expect(page.locator("#s-shop [data-stars]")).toHaveText("10");
  await expect(page.locator("#mineRow .mine-item")).toHaveText(/Ice cream\s*Waiting/);

  await page.click("#s-shop [data-go=home]");
  await expect(page.locator("#giveBadge")).toHaveText("1");
  await page.click("#parentBtn");
  const handOut = page.locator("#redeemList .item", { hasText: "Ice cream" });
  await expect(handOut).toContainText("Bin");
  await handOut.locator(".chip", { hasText: "Not given" }).click();
  await expect(handOut.locator(".chip")).toHaveText("Given");

  await page.click("#s-parent [data-go=home]");
  await expect(page.locator("#giveBadge")).toBeHidden();
  await page.click(".home-card[data-go=shop]");
  await expect(page.locator("#mineRow .mine-item")).toHaveText(/Ice cream\s*Received/);
  await expect(page.locator("#mineRow .tick")).toHaveCount(1);

  // Everything is still there after the app is closed and opened again; each child keeps their own stars.
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#kidList .kid-card", { hasText: "Bin" })).toContainText("10");
  await pickKid(page, "Na");
  await page.click(".home-card[data-go=shop]");
  await expect(page.locator("#s-shop [data-stars]")).toHaveText("0");
  await expect(page.locator("#mineRow")).toHaveText(/No gifts yet/);
});

test("a parent imports a picture and deletes it with two taps; the app's own pictures stay", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await page.click(".home-card[data-go=choose]");
  const thumbs = page.locator("#library .thumb-btn");
  await expect(thumbs).toHaveCount(BUILTIN_COUNT);
  await expect(page.locator("#libEdit")).toBeHidden();
  await expect(thumbs.locator("img").first()).toHaveJSProperty("complete", true);
  // The row shows a small copy of each built-in picture.
  expect(await thumbs.locator("img").first().evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(384);
  // A new photo shows with the family's own photos, chosen.
  await page.setInputFiles("#pickPhoto", await pictureFile(page, "beach.png", "#9EC3E3"));
  await expect(page.locator("#categoryBtn")).toHaveText(/My photos\s*\(1\)/);
  await expect(thumbs).toHaveCount(1);
  await expect(thumbs.first()).toHaveAttribute("aria-pressed", "true");
  await page.click("#libEdit");
  await expect(page.locator(".del-badge")).toHaveCount(1);
  await page.locator(".del-badge").click();
  await expect(thumbs).toHaveCount(1);
  await page.locator(".del-badge.armed").click();
  await expect(thumbs).toHaveCount(0);
  await expect(page.locator("#library .empty")).toBeVisible();
  await expect(page.locator("#libEdit")).toBeHidden();
  await expect(page.locator("#startBtn")).toBeDisabled();
});

test("pictures can be shown one category at a time, remembered for each child", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await page.click(".home-card[data-go=choose]");
  const thumbs = page.locator("#library .thumb-btn");
  const menu = page.locator("#categoryMenu");
  await expect(page.locator("#categoryBtn")).toHaveText(new RegExp(`All pictures\\s*\\(${BUILTIN_COUNT}\\)`));
  await expect(menu).toBeHidden();
  await page.click("#categoryBtn");
  const items = menu.locator(".cat-item");
  await expect(items.first()).toHaveText(new RegExp(`All pictures\\s*${BUILTIN_COUNT}`));
  await expect(items.nth(1)).toHaveText(/Animals\s*2/);
  await expect(items.nth(2)).toHaveText(/Vehicles\s*3/);
  await expect(items.nth(3)).toHaveText(/Landscapes\s*10/);
  await expect(items.last()).toHaveText(/My photos\s*0/);
  // Every category fits on the screen.
  const box = await menu.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  // A tap outside closes the menu without changing anything.
  await page.mouse.click(40, 700);
  await expect(menu).toBeHidden();
  await page.click("#categoryBtn");
  await menu.locator(".cat-item", { hasText: "Landscapes" }).click();
  await expect(menu).toBeHidden();
  await expect(page.locator("#categoryBtn")).toHaveText(/Landscapes\s*\(10\)/);
  await expect(thumbs).toHaveCount(10);
  // The row scrolls sideways; the last picture can be chosen and stays in view.
  await thumbs.last().scrollIntoViewIfNeeded();
  await thumbs.last().click();
  await expect(thumbs.last()).toHaveAttribute("aria-pressed", "true");
  await page.locator(".count-btn", { hasText: /^9$/ }).click();
  const inView = await page.evaluate(() => {
    const lib = document.getElementById("library")!.getBoundingClientRect();
    const on = document.querySelector("#library .thumb-btn.on")!.getBoundingClientRect();
    return on.left >= lib.left - 1 && on.right <= lib.right + 1;
  });
  expect(inView).toBe(true);
  // Remembered when the child comes back.
  await page.click("#s-choose [data-go=home]");
  await page.click(".home-card[data-go=choose]");
  await expect(page.locator("#categoryBtn")).toHaveText(/Landscapes\s*\(10\)/);
  // Everything fits, Start included, with all the pictures: on the smallest iPad and on a wide,
  // short browser window, where the whole screen is scaled up.
  await page.click("#categoryBtn");
  await menu.locator(".cat-item", { hasText: "All pictures" }).click();
  await expect(thumbs).toHaveCount(BUILTIN_COUNT);
  for (const [w, h] of [
    [1024, 768],
    [2560, 1300]
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(200);
    const start = await page.locator("#startBtn").boundingBox();
    expect(start!.y + start!.height, `Start at ${w}x${h}`).toBeLessThanOrEqual(h);
  }
});

test("the frame takes the shape of a wide photo, so none of it is cut off", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await page.click(".home-card[data-go=choose]");
  await page.setInputFiles("#pickPhoto", await pictureFile(page, "beach.png", "#9EC3E3")); // 800x600
  await expect(page.locator("#library .thumb-btn")).toHaveCount(1);
  await page.locator(".count-btn", { hasText: /^4$/ }).click();
  await page.click("#startBtn");
  await expect(page.locator("#progress")).toHaveText("0 / 4");
  const s = await frame(page);
  expect([s.rows, s.cols]).toEqual([2, 2]);
  expect(s.bw / s.bh).toBeCloseTo(4 / 3, 1);
  expect(s.pw).toBeGreaterThan(s.ph);
});

test("pictures stay sharp when the screen is bigger than the design size", async ({ page }) => {
  // A 13-inch iPad or a big browser window shows the whole stage scaled up.
  await page.setViewportSize({ width: 1500, height: 1050 });
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  // Canvas pixels per screen pixel; below 1 the browser stretches the canvas and it looks blurry.
  const sharpness = (sel: string) =>
    page.locator(sel).first().evaluate((c: HTMLCanvasElement) => c.width / (c.getBoundingClientRect().width * devicePixelRatio));
  await page.click(".home-card[data-go=choose]");
  await expect.poll(() => sharpness("#preview")).toBeGreaterThan(0.98);
  await page.click("#startBtn");
  await expect(page.locator("#s-play")).toBeVisible();
  for (const sel of [".piece", ".ref-card canvas", ".slots"]) expect(await sharpness(sel)).toBeGreaterThan(0.98);
});

test("tapping the small picture shows it big in the middle, and a tap shrinks it back", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await startPuzzle(page, 4);
  const small = (await page.locator(".ref-card").boundingBox())!;
  await page.locator(".ref-card").click();
  const big = page.locator(".zoom-card");
  await expect(big).toBeVisible();
  expect((await frame(page)) as unknown as { zoomed: boolean }).toMatchObject({ zoomed: true });
  // Once it has grown: many times the small one, in the middle of the screen.
  await page.waitForTimeout(400);
  const box = (await big.boundingBox())!;
  const stage = (await page.locator("#stage").boundingBox())!;
  expect(box.width).toBeGreaterThan(small.width * 3);
  expect(Math.abs(box.x + box.width / 2 - (stage.x + stage.width / 2))).toBeLessThan(3);
  expect(Math.abs(box.y + box.height / 2 - (stage.y + stage.height / 2))).toBeLessThan(3);
  await expect(page.locator(".ref-card")).toBeHidden();

  // A tap on it puts it back, and the pieces can be moved again.
  await big.click();
  await expect(page.locator(".zoom")).toHaveCount(0);
  await expect(page.locator(".ref-card")).toBeVisible();
  await dragPiece(page, 0, 0);
  await expect(page.locator("#progress")).toHaveText("1 / 4");
});

test("the ranking shows every player in General and, once the iPad shares with a family, the family in Family", async ({ page }) => {
  // A stand-in for the API: it keeps the players this iPad sends and answers with a made-up ranking.
  const sent: Array<{ auth: string | null; body: { players: Array<{ key: string; name: string; stars: number }> } }> = [];
  let online = false;
  const id = () => createHash("sha256").update(sent.at(-1)!.body.players[0].key).digest("hex");
  await page.route("**/api/players", async (route) => {
    if (!online) return route.abort();
    sent.push({ auth: route.request().headers().authorization ?? null, body: route.request().postDataJSON() });
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/ranking?*", async (route) => {
    if (!online) return route.abort();
    const scope = new URL(route.request().url()).searchParams.get("scope");
    const bin = { id: id(), name: "Bin", color: 1, stars: 0, puzzles: 0 };
    const json =
      scope === "family"
        ? { players: [{ ...bin, rank: 1 }], me: [{ ...bin, rank: 1 }] }
        : {
            players: [
              { id: "a".repeat(64), name: "Khoa", color: 2, stars: 980, puzzles: 40, rank: 1 },
              { id: "b".repeat(64), name: "Mai", color: 3, stars: 640, puzzles: 1, rank: 2 }
            ],
            me: [{ ...bin, rank: 7 }]
          };
    await route.fulfill({ json });
  });
  await page.route("**/api/families", (route) => route.fulfill({ json: { code: "ABCDEFGHJKLM" } }));
  await page.route("**/api/sync", (route) => route.fulfill({ json: { rev: 1, rows: [], more: false } }));

  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await page.click(".home-card[data-go=rank]");
  await expect(page.locator("#s-rank")).toBeVisible();
  // Offline: a note and a way to try again.
  await expect(page.locator("#rankList")).toContainText("needs the internet");
  await expect(page.locator("#rankFamily")).toBeHidden();

  online = true;
  await page.click("#rankRetry");
  const rows = page.locator("#rankList .rank-row");
  await expect(rows).toHaveCount(3);
  await expect(page.locator("#rankGeneral")).toHaveClass(/on/);
  await expect(rows.nth(0)).toContainText("Khoa");
  await expect(rows.nth(0)).toContainText("40 puzzles");
  // The child who is playing, below the top, after a gap.
  await expect(page.locator("#rankList .rank-gap")).toBeVisible();
  await expect(rows.nth(2)).toHaveClass(/me/);
  await expect(rows.nth(2)).toContainText("7");
  expect(sent[0].auth).toBeNull();
  expect(sent[0].body.players.map((p) => [p.name, p.stars])).toEqual([["Bin", 0]]);

  // Sharing with a family brings the Family tab, and Bin's player joins the family.
  // Sharing starts from "Who is playing?".
  await page.click("#s-rank [data-go=home]");
  await page.click("#kidChip");
  await expect(page.locator("#familyBtn")).toHaveText("Family");
  await page.click("#familyBtn");
  await page.getByRole("button", { name: "Start sharing" }).click();
  await expect(page.locator("#familyCode")).toHaveText("ABCD-EFGH-JKLM");
  await page.click("#familyDone");
  await expect(page.locator("#familyBtn")).toHaveText("Family: on");
  await pickKid(page, "Bin");
  await page.click(".home-card[data-go=rank]");
  await expect(page.locator("#rankFamily")).toBeVisible();
  await page.click("#rankFamily");
  await expect(page.locator("#rankFamily")).toHaveClass(/on/);
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toContainText("Bin");
  await expect(rows.nth(0)).toHaveClass(/me/);
  expect(sent.at(-1)!.auth).toBe("Bearer ABCDEFGHJKLM");
});

test("works offline after the first visit", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Service worker control is checked in Chromium");
  await open(page);
  // The service worker takes over from the next launch, with the whole app cached.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await addKid(page, "Bin");
  await page.waitForTimeout(500);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await pickKid(page, "Bin");
  await startPuzzle(page, 4);
  await context.setOffline(false);
});

test("a new version takes over as soon as it is downloaded", async ({ page, request, browserName }) => {
  // The service worker must not wait for every tab of the app to close (or for a message) before a
  // new version replaces it; src/ui/update.ts then reloads at a safe moment.
  const sw = await (await request.get("sw.js")).text();
  expect(sw).toContain("self.skipWaiting()");
  expect(sw).toContain("clientsClaim()");
  expect(sw).not.toContain("SKIP_WAITING");
  test.skip(browserName !== "chromium", "Service worker control is checked in Chromium");
  // It takes control on the first visit, without a reload.
  await open(page);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
});

test("fills every iPad screen without scrolling", async ({ page }) => {
  await open(page);
  for (const [w, h] of [
    [1024, 768],
    [1180, 820],
    [1194, 834],
    [1366, 1024]
  ]) {
    await page.setViewportSize({ width: w, height: h });
    // WebKit on a busy runner can take longer than a moment to deliver the resize event.
    await expect
      .poll(() => page.evaluate(() => Math.round(document.getElementById("stage")!.getBoundingClientRect().width)))
      .toBe(w);
    const m = await page.evaluate(() => {
      const r = document.getElementById("stage")!.getBoundingClientRect();
      const d = document.documentElement;
      return { w: r.width, h: r.height, sw: d.scrollWidth, sh: d.scrollHeight };
    });
    expect(Math.round(m.w), `stage width at ${w}x${h}`).toBe(w);
    expect(Math.round(m.h), `stage height at ${w}x${h}`).toBe(h);
    expect(m.sw).toBeLessThanOrEqual(w);
    expect(m.sh).toBeLessThanOrEqual(h);
  }
});
