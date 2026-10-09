// Rankings: every child is a player on the server (functions/api/players.ts), whether or not the
// device shares with a family, so children can be ranked against everyone who plays (General) or
// against their own family (Family). A player's score is the stars the child won by playing:
// stars spent on gifts still count, stars a parent added by hand do not, and stars lost for a
// mistake or a hint are taken off.

import type { AppDb } from "../db/database";
import { getSetting, setSetting } from "../data/settings";
import { apiBase, type Fetch } from "../sync/sync";
import type { PlayersRequest, PlayerUpdate } from "../../functions/api/players";
import type { RankedPlayer, RankingResponse } from "../../functions/api/ranking";

export type { RankedPlayer, RankingResponse };
export type Scope = "general" | "family";

/** What this device last told the server, per player key: the update and family code as JSON. */
const SENT = "rank.sent";
/** Wait this long after a change before telling the server. */
const PUSH_DELAY = 3000;

export function randomKey(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The player's id on the server: the SHA-256 of its key. */
export async function playerId(key: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Each child's player as it stands now. */
export function localPlayers(db: AppDb): PlayerUpdate[] {
  return db
    .all<{ key: string; kid: number; name: string; color: number; stars: number; puzzles: number }>(
      `SELECT k.player_key AS key, k.id AS kid, k.name, k.color,
         MAX(0, COALESCE((SELECT SUM(delta) FROM star_entries s WHERE s.kid_id = k.id AND s.reason IN ('puzzle', 'mistake', 'hint')), 0)) AS stars,
         (SELECT COUNT(*) FROM puzzles p WHERE p.kid_id = k.id) AS puzzles
       FROM kids k WHERE k.player_key IS NOT NULL ORDER BY k.sort, k.id`
    )
    .map((p) => ({ ...p }));
}

export class Players {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;

  constructor(
    private readonly db: AppDb,
    /** The family code while the device shares with a family. */
    private readonly familyCode: () => string | null,
    /** False while the device is joining a family and has not got the family's children yet. */
    private readonly ready: () => boolean = () => true,
    private readonly fetcher: Fetch = (url, init) => fetch(url, init),
    private readonly base = apiBase()
  ) {}

  /** Tells the server about changes a moment after they happen, and when the network is back. */
  start(): void {
    this.db.onWrite(() => this.later());
    window.addEventListener("online", () => void this.push().catch(() => {}));
    void this.push().catch(() => {});
  }

  private later(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.push().catch(() => {});
    }, PUSH_DELAY);
  }

  /** Gives every child without one a player key. */
  ensureKeys(): void {
    if (!this.ready()) return;
    const missing = this.db.all<{ id: number }>("SELECT id FROM kids WHERE player_key IS NULL");
    if (!missing.length) return;
    this.db.transaction(() => {
      for (const k of missing) this.db.run("UPDATE kids SET player_key = ? WHERE id = ?", [randomKey(), k.id]);
    });
  }

  /** Sends the players that changed since last time, and removes the ones whose child is gone. Throws when offline. */
  push(): Promise<void> {
    if (!this.running) this.running = this.send().finally(() => (this.running = null));
    return this.running;
  }

  private async send(): Promise<void> {
    this.ensureKeys();
    if (!this.ready()) return;
    const sent = JSON.parse(getSetting(this.db, SENT, "{}")) as Record<string, string>;
    const now = localPlayers(this.db);
    const code = this.familyCode();
    // The family code is part of what was sent, so players move into a family the device joins.
    const state = (p: PlayerUpdate) => JSON.stringify([p, code]);
    const keys = new Set(now.map((p) => p.key));
    const body: PlayersRequest = {
      players: now.filter((p) => sent[p.key] !== state(p)),
      gone: Object.keys(sent).filter((k) => !keys.has(k))
    };
    if (!body.players.length && !body.gone.length) return;
    const r = await this.fetcher(`${this.base}players`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(code ? { Authorization: `Bearer ${code}` } : {}) },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`Could not update the ranking (${r.status})`);
    setSetting(this.db, SENT, JSON.stringify(Object.fromEntries(now.map((p) => [p.key, state(p)]))));
  }

  /** The ranking, after sending this device's latest stars. Throws when offline. */
  async ranking(scope: Scope): Promise<RankingResponse> {
    await this.push();
    const code = this.familyCode();
    if (scope === "family" && !code) return { players: [], me: [] };
    const ids = await Promise.all(localPlayers(this.db).map((p) => playerId(p.key)));
    const r = await this.fetcher(`${this.base}ranking?scope=${scope}&me=${ids.join(",")}`, {
      headers: scope === "family" ? { Authorization: `Bearer ${code}` } : {}
    });
    if (!r.ok) throw new Error(`Could not load the ranking (${r.status})`);
    return (await r.json()) as RankingResponse;
  }

  /** The server id of each child's player, by child id. */
  async idsByKid(): Promise<Map<string, number>> {
    const rows = localPlayers(this.db);
    const ids = await Promise.all(rows.map((p) => playerId(p.key)));
    return new Map(ids.map((id, i) => [id, rows[i].kid]));
  }
}
