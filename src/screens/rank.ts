// Ranking: the children with the most stars won by playing. General ranks every player of the app;
// Family, shown only while this device shares with a family, ranks the family's own children.

import { getApp } from "../app";
import { getKid } from "../data/kids";
import type { RankedPlayer, Scope } from "../rank/players";
import { avatar } from "../ui/avatar";
import { byId, h, icon } from "../ui/dom";
import { current, onEnter } from "../ui/nav";

let scope: Scope = "general";
/** Only the latest load may draw, so a slow answer for the other tab is dropped. */
let loadId = 0;

export function setupRank(): void {
  onEnter("rank", () => void render());
  byId("rankTabs").addEventListener("click", (e) => {
    const tab = (e.target as Element).closest<HTMLElement>("[data-scope]");
    if (!tab) return;
    scope = tab.dataset.scope as Scope;
    void render();
  });
  // Stars that came from the family's other devices show up straight away.
  getApp().sync.onUpdate((changed) => changed && current() === "rank" && void render(false));
}

async function render(showLoading = true): Promise<void> {
  const { db, sync, players, kid } = getApp();
  const inFamily = !!sync.code;
  if (!inFamily) scope = "general";
  byId("rankFamily").hidden = !inFamily;
  for (const t of byId("rankTabs").querySelectorAll<HTMLElement>("[data-scope]")) {
    const on = t.dataset.scope === scope;
    t.classList.toggle("on", on);
    t.setAttribute("aria-selected", String(on));
  }
  const list = byId("rankList");
  const id = ++loadId;
  if (showLoading) list.replaceChildren(h("p", { class: "rank-empty" }, "Loading…"));
  try {
    const res = await players.ranking(scope);
    const mine = await players.idsByKid();
    if (id !== loadId) return;
    const row = (p: RankedPlayer) => {
      const kidId = mine.get(p.id);
      const own = kidId !== undefined ? getKid(db, kidId) : null;
      return h(
        "div",
        { class: `rank-row${kidId !== undefined && kidId === kid?.id ? " me" : ""}`, "data-player": p.id },
        h("span", { class: `place${p.rank <= 3 ? ` p${p.rank}` : ""}` }, String(p.rank)),
        // Photos stay in the family: other players show their initial on their color.
        avatar(own ?? { name: p.name, color: p.color, photo_key: null }),
        h("span", { class: "who" }, p.name, h("small", {}, `${p.puzzles} ${p.puzzles === 1 ? "puzzle" : "puzzles"}`)),
        h("span", { class: "stars" }, icon("star"), String(p.stars))
      );
    };
    const rows: Node[] = res.players.map(row);
    // The child who is playing, when below the top of the general ranking.
    const me = res.me.find((p) => mine.get(p.id) === kid?.id);
    if (me && !res.players.some((p) => p.id === me.id)) {
      const pinned = row(me);
      pinned.classList.add("pinned");
      rows.push(h("div", { class: "rank-gap", "aria-hidden": "true" }, "⋮"), pinned);
    }
    list.replaceChildren(
      ...(rows.length ? rows : [h("p", { class: "rank-empty" }, "No stars yet. Finish a puzzle to be the first!")])
    );
  } catch (e) {
    console.warn("Ranking failed", e);
    if (id !== loadId) return;
    const retry = h("button", { type: "button", class: "btn btn-secondary btn-small", id: "rankRetry" }, "Try again");
    retry.addEventListener("click", () => void render());
    list.replaceChildren(
      h("div", { class: "rank-empty" }, h("p", {}, "The ranking needs the internet. Try again when this iPad is online."), retry)
    );
  }
}
