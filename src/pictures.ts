// The pictures that come with the app, made with Figma AI for Carrick's children. They sit in the
// library with the family's own pictures but cannot be deleted. Each belongs to a category, so the
// choose screen can show one kind at a time.

import autumnRiver from "./pictures/autumn-river.jpg";
import construction from "./pictures/construction.jpg";
import farm from "./pictures/farm.jpg";
import flowerHills from "./pictures/flower-hills.jpg";
import haLongBay from "./pictures/ha-long-bay.jpg";
import jungle from "./pictures/jungle.jpg";
import mistyForest from "./pictures/misty-forest.jpg";
import mountainLake from "./pictures/mountain-lake.jpg";
import redCanyon from "./pictures/red-canyon.jpg";
import rescue from "./pictures/rescue.jpg";
import riceTerraces from "./pictures/rice-terraces.jpg";
import snowyMountains from "./pictures/snowy-mountains.jpg";
import town from "./pictures/town.jpg";
import tropicalBeach from "./pictures/tropical-beach.jpg";
import waterfall from "./pictures/waterfall.jpg";
import { BUILTIN, isBuiltin, type BuiltinPicture, type Photo } from "./data/photos";

/** "mine" is the family's own photos. */
export type Category = "animals" | "vehicles" | "landscapes" | "mine";

export const BUILTIN_PICTURES: Array<BuiltinPicture & { category: Category }> = [
  { name: "jungle", url: jungle, width: 1536, height: 1024, category: "animals" },
  { name: "construction", url: construction, width: 1536, height: 1024, category: "vehicles" },
  { name: "farm", url: farm, width: 1536, height: 1024, category: "animals" },
  { name: "town", url: town, width: 1536, height: 1024, category: "vehicles" },
  { name: "rescue", url: rescue, width: 1536, height: 1024, category: "vehicles" },
  { name: "misty-forest", url: mistyForest, width: 1536, height: 1024, category: "landscapes" },
  { name: "mountain-lake", url: mountainLake, width: 1536, height: 1024, category: "landscapes" },
  { name: "waterfall", url: waterfall, width: 1536, height: 1024, category: "landscapes" },
  { name: "snowy-mountains", url: snowyMountains, width: 1536, height: 1024, category: "landscapes" },
  { name: "autumn-river", url: autumnRiver, width: 1536, height: 1024, category: "landscapes" },
  { name: "flower-hills", url: flowerHills, width: 1536, height: 1024, category: "landscapes" },
  { name: "tropical-beach", url: tropicalBeach, width: 1536, height: 1024, category: "landscapes" },
  { name: "red-canyon", url: redCanyon, width: 1536, height: 1024, category: "landscapes" },
  { name: "rice-terraces", url: riceTerraces, width: 1536, height: 1024, category: "landscapes" },
  { name: "ha-long-bay", url: haLongBay, width: 1536, height: 1024, category: "landscapes" }
];

/** Where a built-in picture's file is served, from its file key. */
export function builtinUrl(fileKey: string): string | null {
  return BUILTIN_PICTURES.find((p) => BUILTIN + p.name === fileKey)?.url ?? null;
}

export function categoryOf(p: Photo): Category {
  if (!isBuiltin(p)) return "mine";
  return BUILTIN_PICTURES.find((b) => BUILTIN + b.name === p.file_key)?.category ?? "mine";
}
