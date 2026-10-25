/**
 * メモリの保存場所（部屋＋フレンド機能。決定事項 #121）。手元の開発用サーバー（scripts/dev-online-server.mts）とテストで使う。
 * 再起動で消える。1つのプロセスの中で await をはさまずに読み書きするので、ほかの送信と混ざらない。
 * Edge Function の SQL（supabase/functions/cardgame/sqlStore.ts）と同じ約束（SocialStore・RoomStore）を守る
 */
import type { RoomStore } from '../http.ts';
import type { RoomRecord } from '../room.ts';
import { summaryOf } from './rooms.ts';
import type {
  FriendRequestRecord,
  FriendshipRecord,
  InviteRecord,
  MatchRecord,
  PlayerPatch,
  PlayerRecord,
  PresenceUpdate,
  RateKind,
  RecordCount,
  RoomSummary,
  SharedDeckRecord,
  SharedDeckSummaryRecord,
  SocialStore,
} from './types.ts';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export class MemoryStore implements RoomStore, SocialStore {
  rooms = new Map<string, RoomRecord>();
  players = new Map<string, PlayerRecord>();
  friendshipList: FriendshipRecord[] = [];
  requestList: FriendRequestRecord[] = [];
  inviteMap = new Map<string, InviteRecord>();
  matches = new Map<string, MatchRecord>();
  decks = new Map<string, SharedDeckRecord>();
  events: { kind: RateKind; key: string; at: number }[] = [];

  // ---- 部屋 ----
  async insert(room: RoomRecord) {
    if (this.rooms.has(room.code)) return false;
    this.rooms.set(room.code, clone(room));
    return true;
  }
  async update<T>(code: string, fn: (room: RoomRecord | null) => { save: RoomRecord | null; value: T }) {
    const current = this.rooms.get(code);
    const r = fn(current ? clone(current) : null);
    if (r.save) this.rooms.set(code, clone(r.save));
    return r.value;
  }
  async removeOlderThan(time: number) {
    for (const [code, room] of this.rooms) if (room.updatedAt < time) this.rooms.delete(code);
  }

  // ---- プレイヤー ----
  async insertPlayer(p: PlayerRecord) {
    for (const q of this.players.values()) {
      if (q.id === p.id || q.secretHash === p.secretHash || q.friendCode === p.friendCode || q.inboxId === p.inboxId) return false;
    }
    this.players.set(p.id, clone(p));
    return true;
  }
  async playerBySecretHash(h: string) {
    for (const p of this.players.values()) if (p.secretHash === h) return clone(p);
    return null;
  }
  async playerByFriendCode(code: string) {
    for (const p of this.players.values()) if (p.friendCode === code) return clone(p);
    return null;
  }
  async playersByIds(ids: readonly string[]) {
    return ids.flatMap((id) => (this.players.has(id) ? [clone(this.players.get(id)!)] : []));
  }
  async updatePlayer(id: string, patch: PlayerPatch) {
    const p = this.players.get(id);
    if (p) this.players.set(id, { ...p, ...patch });
  }
  async removeStalePlayers(before: number) {
    const gone = new Set(
      [...this.players.values()].filter((p) => p.lastSeen < before && !this.friendshipList.some((f) => f.a === p.id || f.b === p.id)).map((p) => p.id),
    );
    if (gone.size === 0) return 0;
    for (const id of gone) this.players.delete(id);
    this.requestList = this.requestList.filter((r) => !gone.has(r.from) && !gone.has(r.to));
    for (const [id, i] of this.inviteMap) if (gone.has(i.from) || gone.has(i.to)) this.inviteMap.delete(id);
    for (const [id, m] of this.matches) if (gone.has(m.players[0]) || gone.has(m.players[1])) this.matches.delete(id);
    for (const [k, d] of this.decks) if (gone.has(d.ownerId)) this.decks.delete(k);
    return gone.size;
  }
  async updatePresence(updates: readonly PresenceUpdate[]) {
    for (const u of updates) {
      const p = this.players.get(u.playerId);
      if (!p) continue;
      if (u.seen !== undefined) p.lastSeen = Math.max(p.lastSeen, u.seen);
      if (u.room) {
        p.roomCode = u.room.code;
        p.roomStatus = u.room.status;
        p.roomSeen = u.room.at;
      }
    }
  }

  // ---- フレンド ----
  async friendships(id: string) {
    return clone(this.friendshipList.filter((f) => f.a === id || f.b === id));
  }
  async addFriendship(a: string, b: string, at: number) {
    const [x, y] = a < b ? [a, b] : [b, a];
    if (!this.friendshipList.some((f) => f.a === x && f.b === y)) this.friendshipList.push({ a: x, b: y, since: at });
    this.requestList = this.requestList.filter((r) => !((r.from === a && r.to === b) || (r.from === b && r.to === a)));
  }
  async removeFriendship(a: string, b: string) {
    const [x, y] = a < b ? [a, b] : [b, a];
    this.friendshipList = this.friendshipList.filter((f) => !(f.a === x && f.b === y));
    this.requestList = this.requestList.filter((r) => !((r.from === a && r.to === b) || (r.from === b && r.to === a)));
  }
  async requests(id: string) {
    return { incoming: clone(this.requestList.filter((r) => r.to === id)), outgoing: clone(this.requestList.filter((r) => r.from === id)) };
  }
  async addRequest(r: FriendRequestRecord) {
    if (!this.requestList.some((q) => q.from === r.from && q.to === r.to)) this.requestList.push(clone(r));
  }
  async removeRequest(from: string, to: string) {
    this.requestList = this.requestList.filter((r) => !(r.from === from && r.to === to));
  }

  // ---- 招待 ----
  async insertInvite(inv: InviteRecord) {
    this.inviteMap.set(inv.id, clone(inv));
  }
  async invite(id: string) {
    const i = this.inviteMap.get(id);
    return i ? clone(i) : null;
  }
  async updateInvite(id: string, patch: Partial<Pick<InviteRecord, 'status' | 'expiresAt' | 'createdAt'>>) {
    const i = this.inviteMap.get(id);
    if (i) this.inviteMap.set(id, { ...i, ...patch });
  }
  async invites(id: string, since: number) {
    const all = [...this.inviteMap.values()].filter((i) => i.createdAt >= since);
    return { received: clone(all.filter((i) => i.to === id)), sent: clone(all.filter((i) => i.from === id)) };
  }
  async removeInvitesOlderThan(time: number) {
    for (const [id, i] of this.inviteMap) if (i.createdAt < time) this.inviteMap.delete(id);
  }

  // ---- 回数の記録 ----
  async countEvents(kind: RateKind, key: string, since: number) {
    return this.events.filter((e) => e.kind === kind && e.key === key && e.at >= since).length;
  }
  async addEvent(kind: RateKind, key: string, at: number) {
    this.events.push({ kind, key, at });
  }
  async removeEventsOlderThan(time: number) {
    this.events = this.events.filter((e) => e.at >= time);
  }

  // ---- 成績 ----
  async insertMatch(m: MatchRecord) {
    if (!this.matches.has(m.id)) this.matches.set(m.id, clone(m));
  }
  async records(me: string, others: readonly string[]) {
    const out = new Map<string, RecordCount>();
    for (const m of this.matches.values()) {
      const seat = m.players[0] === me ? 0 : m.players[1] === me ? 1 : -1;
      if (seat < 0) continue;
      const opp = m.players[1 - seat]!;
      if (!others.includes(opp) || opp === me) continue;
      const r = out.get(opp) ?? { opponentId: opp, win: 0, loss: 0, draw: 0 };
      if (m.winner === null) r.draw++;
      else if (m.winner === seat) r.win++;
      else r.loss++;
      out.set(opp, r);
    }
    return [...out.values()];
  }

  // ---- 公開デッキ ----
  async putSharedDeck(d: SharedDeckRecord) {
    this.decks.set(`${d.ownerId}\n${d.deckId}`, clone(d));
  }
  async removeSharedDeck(ownerId: string, deckId: string) {
    this.decks.delete(`${ownerId}\n${deckId}`);
  }
  async sharedDeckSummaries(ownerIds: readonly string[]): Promise<SharedDeckSummaryRecord[]> {
    return [...this.decks.values()]
      .filter((d) => ownerIds.includes(d.ownerId))
      .map(({ ownerId, deckId, name, count, size, updatedAt }) => ({ ownerId, deckId, name, count, size, updatedAt }));
  }
  async sharedDecks(ownerId: string, deckId?: string) {
    return clone([...this.decks.values()].filter((d) => d.ownerId === ownerId && (deckId === undefined || d.deckId === deckId)));
  }

  // ---- 部屋の要約 ----
  async listedRooms(minSeen: number, limit: number): Promise<RoomSummary[]> {
    return [...this.rooms.values()]
      .filter((r) => r.status === 'waiting' && r.meta?.listed === true && !r.meta.closed && (r.seats[0]?.lastSeen ?? 0) >= minSeen)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
      .map((r) => clone(summaryOf(r)));
  }
  async roomSummaries(codes: readonly string[]): Promise<RoomSummary[]> {
    return codes.flatMap((c) => (this.rooms.has(c) ? [clone(summaryOf(this.rooms.get(c)!))] : []));
  }
}
