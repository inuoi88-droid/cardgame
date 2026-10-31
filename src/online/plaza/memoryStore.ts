/**
 * みんなの広場・運営・公式カードの上書き（決定事項 #141）のメモリの保存場所（手元のサーバー・テスト）。
 * 約束は types.ts の PlazaStore。SQL 版は supabase/functions/cardgame/sqlStore.ts の makePlazaStore
 */
import type { OfficialHistoryRecord, OverrideData, PlazaCursor, PlazaStore, PublicItemRecord, PublicItemSummaryRecord, PublicKind } from './types.ts';

const clone = <T>(x: T): T => structuredClone(x);

export function createMemoryPlazaStore(opts: { staffPassword?: string | null } = {}): PlazaStore & { setStaffPassword(v: string | null): void } {
  let password: string | null = opts.staffPassword ?? null;
  const staff = new Map<string, number>();
  const items = new Map<string, PublicItemRecord>();
  const overrides = new Map<string, OverrideData>();
  const history: OfficialHistoryRecord[] = [];
  const summary = (r: PublicItemRecord): PublicItemSummaryRecord => {
    const { card: _c, deck: _d, cards: _cs, ...rest } = clone(r);
    return rest;
  };
  const newer = (a: { updatedAt: number; id: string }, b: { updatedAt: number; id: string }) => b.updatedAt - a.updatedAt || (b.id < a.id ? -1 : b.id > a.id ? 1 : 0);
  const before = (r: { updatedAt: number; id: string }, c: PlazaCursor) => r.updatedAt < c.at || (r.updatedAt === c.at && r.id < c.id);
  return {
    setStaffPassword(v) {
      password = v;
    },
    async staffPassword() {
      return password;
    },
    async isStaff(id) {
      return staff.has(id);
    },
    async setStaff(id, on, at) {
      if (on) staff.set(id, at);
      else staff.delete(id);
    },
    async putItem(item) {
      const same = [...items.values()].find((r) => r.ownerId === item.ownerId && r.kind === item.kind && r.sourceId === item.sourceId);
      const saved = same ? { ...clone(item), id: same.id, createdAt: same.createdAt } : clone(item);
      if (same) items.delete(same.id);
      items.set(saved.id, saved);
      return saved.id;
    },
    async item(id) {
      const r = items.get(id);
      return r ? clone(r) : null;
    },
    async removeItem(id) {
      items.delete(id);
    },
    async listItems({ kind, before: cur, limit }: { kind?: PublicKind; before?: PlazaCursor; limit: number }) {
      return [...items.values()]
        .filter((r) => (kind === undefined || r.kind === kind) && (cur === undefined || before(r, cur)))
        .sort(newer)
        .slice(0, limit)
        .map(summary);
    },
    async itemsByOwner(ownerId) {
      return [...items.values()].filter((r) => r.ownerId === ownerId).map(summary);
    },
    async officialOverrides() {
      return { version: history.length > 0 ? history[history.length - 1]!.version : 0, items: [...overrides.values()].map(clone) };
    },
    async saveOfficial(cardId, card, by, at) {
      if (card) overrides.set(cardId, clone(card));
      else overrides.delete(cardId);
      const version = history.length + 1;
      history.push({ version, cardId, card: card ? clone(card) : null, by, at });
      return version;
    },
    async officialHistory(cardId, limit) {
      return history
        .filter((h) => h.cardId === cardId)
        .reverse()
        .slice(0, limit)
        .map(clone);
    },
  };
}
