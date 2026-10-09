// The pictures that come with the app, made with Figma AI for Carrick's children. They sit in the
// library with the family's own pictures but cannot be deleted. Each belongs to a category, so the
// choose screen can show one kind at a time. The categories after Landscapes get harder in order:
// big bright subjects first, then busier scenes, look-alike colours and repeating patterns last.
// Each picture has a small copy under pictures/thumbs for the choose screen's row.

import { BUILTIN, isBuiltin, type BuiltinPicture, type Photo } from "./data/photos";

const files = import.meta.glob<string>("./pictures/*.jpg", { eager: true, import: "default" });
const thumbs = import.meta.glob<string>("./pictures/thumbs/*.jpg", { eager: true, import: "default" });

/** The built-in categories, in the order the menu lists them, and their pictures in library order. */
export const CATEGORIES = [
  { id: "animals", label: "Animals", icon: "paw", pictures: ["jungle", "farm"] },
  { id: "vehicles", label: "Vehicles", icon: "car", pictures: ["construction", "town", "rescue"] },
  {
    id: "landscapes",
    label: "Landscapes",
    icon: "mountain",
    pictures: ["misty-forest", "mountain-lake", "waterfall", "snowy-mountains", "autumn-river", "flower-hills", "tropical-beach", "red-canyon", "rice-terraces", "ha-long-bay"]
  },
  {
    id: "dinosaurs",
    label: "Dinosaurs",
    icon: "bone",
    pictures: ["t-rex-volcano", "brachiosaurus-lake", "triceratops-family", "stegosaurus-forest", "pteranodon-cliffs", "baby-dinosaurs-hatching", "prehistoric-ocean", "dino-river-crossing", "ice-age-mammoths", "dino-museum"]
  },
  {
    id: "ocean",
    label: "Ocean",
    icon: "fish",
    pictures: ["coral-reef", "whale-and-calf", "dolphins-sunset", "octopus-garden", "shipwreck-treasure", "penguins-iceberg", "kelp-forest", "glowing-jellyfish", "tide-pool", "deep-sea"]
  },
  {
    id: "anime",
    label: "Anime",
    icon: "sparkles",
    pictures: ["naruto-rooftops", "naruto-ramen", "naruto-forest-training", "one-piece-sunny-sea", "one-piece-island-adventure", "one-piece-sky-island", "dragon-ball-kame-house", "dragon-ball-kamehameha", "dragon-ball-shenron"]
  },
  {
    id: "fairy-tales",
    label: "Fairy tales",
    icon: "castle",
    pictures: ["cinderella-ball", "jack-beanstalk", "gingerbread-house", "red-riding-hood", "rose-castle", "rapunzel-tower", "three-little-pigs", "wonderland-tea-party", "flying-carpet", "seven-dwarfs-cottage"]
  },
  {
    id: "space",
    label: "Space",
    icon: "rocket",
    pictures: ["solar-system", "earth-from-moon", "astronaut-spacewalk", "saturn-rings", "nebula-pillars", "spiral-galaxy", "mars-rover", "rocket-launch", "jupiter-moons", "aurora-from-space"]
  },
  {
    id: "wonders",
    label: "World wonders",
    icon: "globe",
    pictures: ["eiffel-tower", "great-wall", "pyramids-giza", "taj-mahal", "machu-picchu", "colosseum", "angkor-wat", "hoi-an", "statue-of-liberty", "sydney-opera-house"]
  },
  {
    id: "greek",
    label: "Greek myths",
    icon: "temple",
    pictures: ["mount-olympus", "zeus-lightning", "poseidon-sea", "pegasus", "trojan-horse", "hercules-hydra", "argo-ship", "athena-parthenon", "icarus-flight", "apollo-sun-chariot"]
  },
  {
    id: "norse",
    label: "Norse myths",
    icon: "hammer",
    pictures: ["yggdrasil", "bifrost-asgard", "thor-storm", "odin-ravens", "valhalla-hall", "viking-longships", "jotunheim-giants", "sleipnir", "freya-chariot", "dwarves-forge"]
  },
  {
    id: "sweets",
    label: "Sweets and food",
    icon: "ice-cream",
    pictures: ["candy-land", "bakery-window", "fruit-market", "ice-cream-parlor", "birthday-table", "sushi-platter", "tet-feast", "candy-jars", "harvest-table", "donut-trays"]
  },
  {
    id: "immortal",
    label: "Immortal lands",
    icon: "cloud",
    pictures: ["floating-peaks", "sect-palace", "sword-flying", "lotus-lake", "heavenly-gate", "spirit-herb-garden", "bamboo-cliff-retreat", "dragon-over-clouds", "peach-blossom-valley", "celestial-palace-night"]
  },
  {
    id: "busy",
    label: "Busy places",
    icon: "people",
    pictures: ["floating-market", "busy-harbor", "busy-farm", "amusement-park", "busy-beach", "train-station", "busy-airport", "school-playground", "winter-village", "busy-zoo"]
  },
  {
    id: "flowers",
    label: "Flowers",
    icon: "flower",
    pictures: ["tulip-fields", "butterfly-garden", "sunflower-field", "lotus-pond", "rose-garden", "cherry-blossom-park", "wildflower-meadow", "orchid-greenhouse", "lavender-field", "hydrangea-path"]
  },
  {
    id: "night",
    label: "Night lights",
    icon: "moon",
    pictures: ["hoi-an-lanterns", "fireworks-city", "christmas-market", "mid-autumn-festival", "aurora-cabin", "city-skyline-night", "firefly-forest", "sky-lanterns", "night-carnival", "starry-camp"]
  },
  {
    id: "patterns",
    label: "Patterns",
    icon: "palette",
    pictures: ["stained-glass", "moroccan-tiles", "kaleidoscope", "patchwork-quilt", "seashell-collection", "butterfly-collection", "autumn-leaves", "gemstones", "colored-pencils", "toy-bricks"]
  },
  {
    id: "nature",
    label: "Nature challenge",
    icon: "leaf",
    pictures: ["snowy-forest", "desert-dunes", "ocean-waves", "milky-way", "bamboo-forest", "wheat-field", "autumn-forest", "clouds-sky", "pebble-beach", "mossy-forest"]
  }
] as const;

/** "mine" is the family's own photos. */
export type Category = (typeof CATEGORIES)[number]["id"] | "mine";

export type Builtin = BuiltinPicture & { category: Category; thumb: string };

/**
 * Every built-in picture whose file ships with the app, category by category. The lists above can
 * name pictures that are not made yet; they and categories without any pictures are left out.
 */
export const BUILTIN_PICTURES: Builtin[] = CATEGORIES.flatMap((c) =>
  c.pictures
    .filter((name) => files[`./pictures/${name}.jpg`])
    .map((name) => ({
      name,
      url: files[`./pictures/${name}.jpg`],
      thumb: thumbs[`./pictures/thumbs/${name}.jpg`],
      width: 1536,
      height: 1024,
      category: c.id
    }))
);

/** The categories that have pictures, in menu order. */
export const SHIPPED_CATEGORIES = CATEGORIES.filter((c) => BUILTIN_PICTURES.some((p) => p.category === c.id));

/** Picture files that no category lists, so the app would never show them. */
export const UNLISTED_FILES = Object.keys(files).filter((f) => !BUILTIN_PICTURES.some((p) => f === `./pictures/${p.name}.jpg`));

const byKey = new Map(BUILTIN_PICTURES.map((p) => [BUILTIN + p.name, p]));

/** Where a built-in picture's file is served, from its file key. */
export function builtinUrl(fileKey: string): string | null {
  return byKey.get(fileKey)?.url ?? null;
}

/** Where a built-in picture's small copy is served, from its file key. */
export function builtinThumb(fileKey: string): string | null {
  return byKey.get(fileKey)?.thumb ?? null;
}

export function categoryOf(p: Photo): Category {
  if (!isBuiltin(p)) return "mine";
  return byKey.get(p.file_key)?.category ?? "mine";
}
