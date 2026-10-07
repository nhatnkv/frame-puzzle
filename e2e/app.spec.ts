import { expect, test, type Page } from "@playwright/test";

interface FrameState {
  rows: number;
  cols: number;
  s: number;
  bx: number;
  by: number;
  size: number;
  cells: Array<[number, number]>;
  loc: Array<{ kind: "tray" | "board"; index?: number; cell?: number }>;
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

async function startPuzzle(page: Page, pieces: number) {
  await page.click(".home-card[data-go=choose]");
  await page.locator(".count-btn", { hasText: new RegExp(`^${pieces}$`) }).click();
  await page.click("#startBtn");
  await expect(page.locator("#s-play")).toBeVisible();
  await expect(page.locator("#progress")).toHaveText(`0 / ${pieces}`);
}

const frame = (page: Page) => page.evaluate(() => (window as unknown as { __frame: () => FrameState }).__frame());

/** Drags a piece by its centre to a frame cell, or to the empty top-left corner of the playfield. */
async function dragPiece(page: Page, piece: number, cell: number | "outside") {
  const s = await frame(page);
  const g = await page.evaluate(() => {
    const pf = document.getElementById("playfield")!.getBoundingClientRect();
    const stage = document.getElementById("stage")!;
    return { x: pf.x, y: pf.y, k: stage.getBoundingClientRect().width / stage.offsetWidth };
  });
  const q = s.pieces[piece];
  const from = [g.x + (q.x + s.size / 2) * g.k, g.y + (q.y + s.size / 2) * g.k];
  const to =
    cell === "outside"
      ? [g.x + 8 * g.k, g.y + 8 * g.k]
      : [
          g.x + (s.bx + (cell % s.cols) * s.s + s.s / 2) * g.k,
          g.y + (s.by + Math.floor(cell / s.cols) * s.s + s.s / 2) * g.k
        ];
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 6 });
  await page.mouse.up();
  // Let the glide animation finish before the next drag reads positions.
  await page.waitForTimeout(300);
}

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

test("loose pieces never overlap and a piece dropped outside the frame goes back to the side", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await startPuzzle(page, 49);
  const s = await frame(page);
  const centres = s.loc.map((l) => s.cells[l.index!]);
  const gap = s.s * 1.6 - 0.5;
  for (let i = 0; i < centres.length; i++) {
    for (let j = i + 1; j < centres.length; j++) {
      const apart = Math.abs(centres[i][0] - centres[j][0]) >= gap || Math.abs(centres[i][1] - centres[j][1]) >= gap;
      expect(apart, `pieces ${i} and ${j} overlap`).toBe(true);
    }
  }
  await dragPiece(page, 5, 20);
  expect((await frame(page)).loc[5]).toEqual({ kind: "board", cell: 20 });
  await dragPiece(page, 5, "outside");
  expect((await frame(page)).loc[5].kind).toBe("tray");
  await expect(page.locator("#progress")).toHaveText("0 / 49");
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

test("a parent imports a picture and deletes it with two taps", async ({ page }) => {
  await open(page);
  await addKid(page, "Bin");
  await pickKid(page, "Bin");
  await page.click(".home-card[data-go=choose]");
  const thumbs = page.locator("#library .thumb-btn");
  await expect(thumbs).toHaveCount(3);
  await page.setInputFiles("#pickPhoto", await pictureFile(page, "beach.png", "#9EC3E3"));
  await expect(thumbs).toHaveCount(4);
  await page.click("#libEdit");
  await page.locator(".del-badge").first().click();
  await expect(thumbs).toHaveCount(4);
  await page.locator(".del-badge.armed").click();
  await expect(thumbs).toHaveCount(3);
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
