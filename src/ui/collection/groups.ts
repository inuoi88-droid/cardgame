/**
 * カードのグループ（シナジーで分ける名前つきの入れ物。決定事項 #109）の操作。純粋関数（tests/collection.test.ts）。
 * 保存は store.ts（localStorage の cardgame.v1.groups）。形の検証と書き出し・取り込みは engine の io.ts（parseGroup・mergeImport）。
 * 1枚のカードは複数のグループに入れる。グループの並びは配列の順。
 */
import { GROUP_DEFAULT_COLOR, groupKey, normalizeGroupMemo, normalizeGroupName, parseGroup, type CardGroup } from '../../engine/index.ts';

/** グループの色（暗い面の上で見分けやすい12色。名前は保存する値） */
export const GROUP_COLORS: readonly { id: string; label: string; hex: string }[] = [
  { id: 'red', label: '赤', hex: '#ff6b6b' },
  { id: 'orange', label: '橙', hex: '#ff9f45' },
  { id: 'amber', label: '琥珀', hex: '#f6c445' },
  { id: 'lime', label: '黄緑', hex: '#a3d94a' },
  { id: 'green', label: '緑', hex: '#3ccf91' },
  { id: 'teal', label: '青緑', hex: '#2fc6c0' },
  { id: 'sky', label: '空', hex: '#4fb4ff' },
  { id: 'blue', label: '青', hex: '#6f8dff' },
  { id: 'violet', label: '紫', hex: '#b47cff' },
  { id: 'pink', label: '桃', hex: '#ff7ac6' },
  { id: 'brown', label: '茶', hex: '#c8946a' },
  { id: GROUP_DEFAULT_COLOR, label: '灰', hex: '#a6afcf' },
];

export function groupHex(color: string): string {
  return (GROUP_COLORS.find((c) => c.id === color) ?? GROUP_COLORS[GROUP_COLORS.length - 1]!).hex;
}

/** まだ使っていない色（なければ並びで巡る） */
export function nextGroupColor(groups: readonly CardGroup[]): string {
  const used = new Set(groups.map((g) => g.color));
  const free = GROUP_COLORS.find((c) => c.id !== GROUP_DEFAULT_COLOR && !used.has(c.id));
  return (free ?? GROUP_COLORS[groups.length % (GROUP_COLORS.length - 1)]!).id;
}

/** 名前が手元のグループと重なるか（大文字・小文字・全角半角をならして比べる。except は自分自身の ID） */
export function groupNameTaken(groups: readonly CardGroup[], name: string, except?: string): boolean {
  const key = groupKey(name);
  return groups.some((g) => g.id !== except && groupKey(g.name) === key);
}

/** 名前の検査：空・重なりなら理由、よければ null */
export function groupNameProblem(groups: readonly CardGroup[], name: string, except?: string): string | null {
  const n = normalizeGroupName(name);
  if (n === '') return 'グループ名を入れてください';
  if (groupNameTaken(groups, n, except)) return `「${n}」というグループはもうあります`;
  return null;
}

export function makeGroup(id: string, name: string, color: string, memo?: string, cardIds: readonly string[] = []): CardGroup {
  const g: CardGroup = { v: 1, id, name: normalizeGroupName(name), color, cardIds: [...new Set(cardIds)] };
  const m = normalizeGroupMemo(memo);
  if (m !== undefined) g.memo = m;
  return g;
}

/** 保存データを読む：形の壊れたもの・同じ ID の2つ目は捨てる。cardIds を渡すと、無いカードの ID を落とす */
export function loadGroups(data: unknown, cardIds?: ReadonlySet<string>): CardGroup[] {
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const out: CardGroup[] = [];
  for (const x of data) {
    const r = parseGroup(x);
    if (!r.ok || seen.has(r.value.id)) continue;
    seen.add(r.value.id);
    out.push(cardIds ? { ...r.value, cardIds: r.value.cardIds.filter((id) => cardIds.has(id)) } : r.value);
  }
  return out;
}

export function updateGroup(groups: readonly CardGroup[], id: string, patch: { name?: string; color?: string; memo?: string | null }): CardGroup[] {
  return groups.map((g) => {
    if (g.id !== id) return g;
    const next: CardGroup = { ...g };
    if (patch.name !== undefined) {
      const n = normalizeGroupName(patch.name);
      if (n !== '') next.name = n;
    }
    if (patch.color !== undefined) next.color = patch.color;
    if (patch.memo !== undefined) {
      const m = normalizeGroupMemo(patch.memo ?? undefined);
      if (m === undefined) delete next.memo;
      else next.memo = m;
    }
    return next;
  });
}

/** 並びを動かす（delta：−1 で1つ上、+1 で1つ下）。端なら変えない */
export function moveGroup(groups: readonly CardGroup[], id: string, delta: number): CardGroup[] {
  const i = groups.findIndex((g) => g.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= groups.length) return [...groups];
  const next = [...groups];
  const [g] = next.splice(i, 1);
  next.splice(j, 0, g!);
  return next;
}

export function removeGroup(groups: readonly CardGroup[], id: string): { groups: CardGroup[]; removed: CardGroup | null; index: number } {
  const index = groups.findIndex((g) => g.id === id);
  if (index < 0) return { groups: [...groups], removed: null, index: -1 };
  return { groups: groups.filter((g) => g.id !== id), removed: groups[index]!, index };
}

/** 削除の取り消し：元の位置に戻す（同じ ID がすでにあれば置き換える） */
export function restoreGroup(groups: readonly CardGroup[], group: CardGroup, index: number): CardGroup[] {
  const rest = groups.filter((g) => g.id !== group.id);
  const at = Math.max(0, Math.min(rest.length, index));
  return [...rest.slice(0, at), group, ...rest.slice(at)];
}

/** カードを入れる（すでに入っているものはそのまま。増えた枚数も返す） */
export function addCardsToGroup(groups: readonly CardGroup[], id: string, cardIds: readonly string[]): { groups: CardGroup[]; added: number } {
  let added = 0;
  const next = groups.map((g) => {
    if (g.id !== id) return g;
    const have = new Set(g.cardIds);
    const extra = [...new Set(cardIds)].filter((c) => !have.has(c));
    added = extra.length;
    return extra.length > 0 ? { ...g, cardIds: [...g.cardIds, ...extra] } : g;
  });
  return { groups: next, added };
}

export function removeCardsFromGroup(groups: readonly CardGroup[], id: string, cardIds: readonly string[]): { groups: CardGroup[]; removed: number } {
  const drop = new Set(cardIds);
  let removed = 0;
  const next = groups.map((g) => {
    if (g.id !== id) return g;
    const kept = g.cardIds.filter((c) => !drop.has(c));
    removed = g.cardIds.length - kept.length;
    return removed > 0 ? { ...g, cardIds: kept } : g;
  });
  return { groups: next, removed };
}

/** カードの複製：元のカードが入っていたグループに、複製も入れる（pairs は 元の ID → 複製の ID） */
export function copyMemberships(groups: readonly CardGroup[], pairs: ReadonlyMap<string, string>): CardGroup[] {
  return groups.map((g) => {
    const extra = g.cardIds.flatMap((id) => {
      const copy = pairs.get(id);
      return copy && !g.cardIds.includes(copy) ? [copy] : [];
    });
    return extra.length > 0 ? { ...g, cardIds: [...g.cardIds, ...extra] } : g;
  });
}

/** カード ID → 入っているグループの ID（並びはグループの順） */
export function membershipIndex(groups: readonly CardGroup[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const g of groups) {
    for (const id of g.cardIds) {
      const xs = m.get(id);
      if (xs) xs.push(g.id);
      else m.set(id, [g.id]);
    }
  }
  return m;
}
