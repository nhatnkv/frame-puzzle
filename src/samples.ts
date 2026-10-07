// Three calm sample pictures so a child can play right after installing, before any photo is added.

import type { AppDb } from "./db/database";
import type { FileStore } from "./db/files";
import { addPhoto } from "./data/photos";
import { getSetting, setSetting } from "./data/settings";
import { canvasToJpeg } from "./ui/images";

const SIZE = 1200;

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const x = c.getContext("2d")!;
  x.scale(SIZE / 450, SIZE / 450);
  return [c, x];
}

function circle(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  x.fillStyle = color;
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fill();
}

function meadow(): HTMLCanvasElement {
  const [c, x] = canvas();
  x.fillStyle = "#DCEAF4";
  x.fillRect(0, 0, 450, 450);
  circle(x, 350, 95, 42, "#F3D79A");
  x.fillStyle = "#FFFFFF";
  x.beginPath();
  x.ellipse(110, 92, 55, 20, 0, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.ellipse(145, 78, 35, 18, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "#BFD9B5";
  x.beginPath();
  x.moveTo(0, 290);
  x.quadraticCurveTo(120, 210, 240, 270);
  x.quadraticCurveTo(360, 330, 450, 250);
  x.lineTo(450, 450);
  x.lineTo(0, 450);
  x.fill();
  x.fillStyle = "#9FC79C";
  x.beginPath();
  x.moveTo(0, 340);
  x.quadraticCurveTo(150, 290, 300, 330);
  x.quadraticCurveTo(450, 370, 450, 320);
  x.lineTo(450, 450);
  x.lineTo(0, 450);
  x.fill();
  x.fillStyle = "#EADFC9";
  x.beginPath();
  x.moveTo(300, 330);
  x.quadraticCurveTo(260, 390, 200, 450);
  x.lineTo(245, 450);
  x.quadraticCurveTo(292, 390, 314, 330);
  x.fill();
  x.fillStyle = "#F2E6D6";
  x.fillRect(250, 250, 100, 80);
  x.fillStyle = "#D7A08D";
  x.beginPath();
  x.moveTo(240, 255);
  x.lineTo(300, 205);
  x.lineTo(360, 255);
  x.fill();
  x.fillStyle = "#B98B73";
  x.fillRect(288, 290, 24, 40);
  x.fillStyle = "#CFE0EC";
  x.fillRect(262, 268, 18, 18);
  x.fillRect(320, 268, 18, 18);
  x.fillStyle = "#A78466";
  x.fillRect(96, 290, 14, 50);
  circle(x, 103, 275, 38, "#82B585");
  return c;
}

function sea(): HTMLCanvasElement {
  const [c, x] = canvas();
  x.fillStyle = "#E7EEF3";
  x.fillRect(0, 0, 450, 450);
  circle(x, 110, 120, 46, "#F4CFA0");
  x.fillStyle = "#B5D2E3";
  x.fillRect(0, 230, 450, 220);
  const waves = (y: number, step: number, lift: number, color: string) => {
    x.fillStyle = color;
    x.beginPath();
    x.moveTo(0, y);
    for (let i = 0; i <= 450; i += step) x.quadraticCurveTo(i + step / 2, y - lift, i + step, y);
    x.lineTo(450, 450);
    x.lineTo(0, 450);
    x.fill();
  };
  waves(300, 45, 12, "#9CC2D8");
  waves(360, 60, 14, "#86B2CC");
  x.fillStyle = "#EFE3CF";
  x.beginPath();
  x.moveTo(0, 410);
  x.quadraticCurveTo(200, 380, 450, 420);
  x.lineTo(450, 450);
  x.lineTo(0, 450);
  x.fill();
  x.fillStyle = "#D99A84";
  x.beginPath();
  x.moveTo(230, 272);
  x.lineTo(350, 272);
  x.lineTo(330, 300);
  x.lineTo(250, 300);
  x.fill();
  x.fillStyle = "#FFFFFF";
  x.beginPath();
  x.moveTo(292, 140);
  x.lineTo(292, 262);
  x.lineTo(222, 262);
  x.fill();
  x.fillStyle = "#F6E7C8";
  x.beginPath();
  x.moveTo(300, 160);
  x.lineTo(300, 262);
  x.lineTo(350, 262);
  x.fill();
  x.fillStyle = "#8A6D5A";
  x.fillRect(292, 136, 6, 136);
  return c;
}

function garden(): HTMLCanvasElement {
  const [c, x] = canvas();
  x.fillStyle = "#EEF1E4";
  x.fillRect(0, 0, 450, 450);
  x.fillStyle = "#C9DDB8";
  x.fillRect(0, 300, 450, 150);
  for (const [fx, fy, color] of [[90, 250, "#E9A9A0"], [200, 210, "#F2CC7A"], [320, 240, "#B8A9D9"], [400, 280, "#E9A9A0"]] as const) {
    x.strokeStyle = "#7FAE7F";
    x.lineWidth = 7;
    x.beginPath();
    x.moveTo(fx, fy);
    x.lineTo(fx, 330);
    x.stroke();
    for (let k = 0; k < 5; k++) {
      const a = (k * Math.PI * 2) / 5;
      circle(x, fx + Math.cos(a) * 20, fy + Math.sin(a) * 20, 16, color);
    }
    circle(x, fx, fy, 12, "#F7E6B5");
  }
  circle(x, 380, 80, 34, "#F3D79A");
  return c;
}

/** Adds the sample pictures once, on the very first launch. */
export async function seedSamples(db: AppDb, files: FileStore): Promise<void> {
  if (getSetting(db, "seeded", "0") === "1") return;
  const scenes = [meadow(), sea(), garden()];
  for (const [i, c] of scenes.entries()) {
    const key = await files.put(await canvasToJpeg(c, 0.88));
    addPhoto(db, key, c.width, c.height, new Date(Date.now() - (scenes.length - i) * 60000).toISOString());
  }
  setSetting(db, "seeded", "1");
}
