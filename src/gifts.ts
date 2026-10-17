// The gifts that come with the app, toy vehicles Carrick picked for the children. Each device adds
// them to the gift list by itself (syncBuiltinGifts); parents can edit or delete them like their own.
// The pictures under gifts/ are 400x400, the size of a picture a parent adds.

import { BUILTIN_GIFT, type BuiltinGift } from "./data/rewards";

const files = import.meta.glob<string>("./gifts/*.jpg", { eager: true, import: "default" });

export const BUILTIN_GIFTS: BuiltinGift[] = [
  { key: "tower-crane", name: "Tháp cần cẩu", price: 400 },
  { key: "log-tractor", name: "Máy kéo chở gỗ", price: 300 },
  { key: "cement-mixer", name: "Xe bồn trộn bê tông", price: 500 },
  { key: "crawler-crane", name: "Xe cần cẩu", price: 300 },
  { key: "container-truck", name: "Xe container xanh", price: 400 },
  { key: "fire-truck", name: "Xe cứu hỏa", price: 500 },
  { key: "tow-truck", name: "Xe đầu kéo chở xe cứu hỏa", price: 600 }
];

/** The picture of a gift that comes with the app, or null for a key that is not one. */
export function builtinGiftUrl(key: string): string | null {
  return key.startsWith(BUILTIN_GIFT) ? (files[`./gifts/${key.slice(BUILTIN_GIFT.length)}.jpg`] ?? null) : null;
}
