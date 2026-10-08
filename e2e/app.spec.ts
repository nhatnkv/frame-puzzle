import { expect, test, type Page } from "@playwright/test";

interface FrameState {
  rows: number;
  cols: number;
  /** Piece width and height, waiting cell side, piece canvas size. */
  pw: number;
  ph: number;
  cell: number;
  bx: number;
  by: number;
  bw: number;
  bh: number;
  cw: number;
  ch: number;
  cells: Array<[number, number]>;
  loc: Array<{ kind: "tray" | "board"; index?: number; cell?: number }>;
  level: "easy" | "medium" | "hard";
  /** How each piece faces: taps since it was the right way round. */
  poses: number[];
  pieces: Array<{ x: number; y: number }>;
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

async function startPuzzle(page: Page, pieces: number, level?: "Easy" | "Medium" | "Hard") {
  await page.click(".home-card[data-go=choose]");
  await page.locator(".count-btn", { hasText: new RegExp(`^${pieces}$`) }).click();
  if (level) await page.locator(".level-btn", { hasText: level }).click();
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
  const from = [g.x + (q.x + s.cw / 2) * g.k, g.y + (q.y + s.ch / 2) * g.k];
  const to =
    cell === "outside"
      ? [g.x + 8 * g.k, g.y + 8 * g.k]
      : [
          g.x + (s.bx + (cell % s.cols) * s.pw + s.pw / 2) * g.k,
          g.y + (s.by + Math.floor(cell / s.cols) * s.ph + s.ph / 2) * g.k
        ];
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
    await page.mouse.click(g.x + (q.x + s.cw / 2) * g.k, g.y + (q.y + s.ch / 2) * g.k);
    await page.waitForTimeout(350);
  }
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

test("at hard, each tap turns a piece a quarter turn clockwise, beside the frame or in it", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await startPuzzle(page, 4, "Hard");
  const s = await frame(page);
  expect(s.level).toBe("hard");
  expect(s.poses.filter((p) => p % 4).length).toBeGreaterThanOrEqual(2);
  const turnsLeft = (p: number) => (4 - (p % 4)) % 4;

  // One turned piece goes into the frame as it is; the others are turned round first.
  const late = s.poses.findIndex((p) => p % 4);
  for (let i = 0; i < 4; i++) {
    if (i !== late) await tapPiece(page, i, turnsLeft(s.poses[i]));
    await dragPiece(page, i, i);
  }
  await expect(page.locator("#progress")).toHaveText("4 / 4");
  await expect(page.locator("#toast")).toContainText("turn");
  expect(await pieceStyle(page, late)).toMatchObject({ rotate: `${s.poses[late] * 90}deg` });

  // Turning only ever goes clockwise: each tap adds a quarter turn, never back.
  await tapPiece(page, late);
  expect((await frame(page)).poses[late]).toBe(s.poses[late] + 1);
  expect(await pieceStyle(page, late)).toMatchObject({ rotate: `${(s.poses[late] + 1) * 90}deg` });
  await tapPiece(page, late, turnsLeft(s.poses[late] + 1));
  await expect(page.locator("#s-done")).toBeVisible();
  await expect(page.locator("#earned")).toHaveText("+40");
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
  await expect(thumbs).toHaveCount(5);
  await expect(page.locator("#libEdit")).toBeHidden();
  await expect(thumbs.locator("img").first()).toHaveJSProperty("complete", true);
  expect(await thumbs.locator("img").first().evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1536);
  await page.setInputFiles("#pickPhoto", await pictureFile(page, "beach.png", "#9EC3E3"));
  await expect(thumbs).toHaveCount(6);
  await page.click("#libEdit");
  await expect(page.locator(".del-badge")).toHaveCount(1);
  await page.locator(".del-badge").click();
  await expect(thumbs).toHaveCount(6);
  await page.locator(".del-badge.armed").click();
  await expect(thumbs).toHaveCount(5);
  await expect(page.locator("#libEdit")).toBeHidden();
});

test("the frame takes the shape of a wide photo, so none of it is cut off", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await page.click(".home-card[data-go=choose]");
  await page.setInputFiles("#pickPhoto", await pictureFile(page, "beach.png", "#9EC3E3")); // 800x600
  await expect(page.locator("#library .thumb-btn")).toHaveCount(6);
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

test("fills every iPad screen without scrolling", async ({ page }) => {
  await open(page);
  for (const [w, h] of [
    [1024, 768],
    [1180, 820],
    [1194, 834],
    [1366, 1024]
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(100);
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
