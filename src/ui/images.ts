import { cropRect } from "../puzzle/geometry";

/** Decodes a picked or photographed image file. Safari applies the camera's orientation. */
export function loadImageFile(file: File): Promise<HTMLImageElement> {
  return loadImageUrl(URL.createObjectURL(file), true);
}

export function loadImageUrl(url: string, revoke = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (revoke) URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (revoke) URL.revokeObjectURL(url);
      reject(new Error("This picture could not be opened"));
    };
    img.src = url;
  });
}

/** Scales an image down so its longer side is at most `max` pixels. */
export function downscale(img: CanvasImageSource & { width: number; height: number }, max: number): HTMLCanvasElement {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * k));
  c.height = Math.max(1, Math.round(img.height * k));
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** Crops an image to a centred square of `size` pixels. */
export function squareCrop(img: CanvasImageSource & { width: number; height: number }, size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const [sx, sy, sw, sh] = cropRect(img.width, img.height, 1);
  c.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
  return c;
}

export function canvasToJpeg(c: HTMLCanvasElement, quality = 0.85): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? b.arrayBuffer().then(resolve, reject) : reject(new Error("Could not encode the picture"))), "image/jpeg", quality);
  });
}

/** Resolves when a file input gets a file, then clears it so picking the same file again still fires. */
export function onFilePicked(input: HTMLInputElement, handler: (file: File) => void): void {
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    input.value = "";
    if (f) handler(f);
  });
}
