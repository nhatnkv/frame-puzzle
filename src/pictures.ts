// The pictures that come with the app, made with Figma AI for Carrick's children. They sit in the
// library with the family's own pictures but cannot be deleted.

import construction from "./pictures/construction.jpg";
import farm from "./pictures/farm.jpg";
import jungle from "./pictures/jungle.jpg";
import rescue from "./pictures/rescue.jpg";
import town from "./pictures/town.jpg";
import { BUILTIN, type BuiltinPicture } from "./data/photos";

export const BUILTIN_PICTURES: BuiltinPicture[] = [
  { name: "jungle", url: jungle, width: 1536, height: 1024 },
  { name: "construction", url: construction, width: 1536, height: 1024 },
  { name: "farm", url: farm, width: 1536, height: 1024 },
  { name: "town", url: town, width: 1536, height: 1024 },
  { name: "rescue", url: rescue, width: 1536, height: 1024 }
];

/** Where a built-in picture's file is served, from its file key. */
export function builtinUrl(fileKey: string): string | null {
  return BUILTIN_PICTURES.find((p) => BUILTIN + p.name === fileKey)?.url ?? null;
}
