/**
 * ドラフト戦（MTG 要素 △ バッチD：#119 リミテッドのアレンジ。CPU 戦だけ）の純粋な関数。
 * カードの山（保存したカード＋プリセットのカード。ルール違反・レジェンドは除く）から offer 枚ずつ見せて1枚を選ぶのを rounds 回、
 * 1回で copies 枚ずつデッキに入る。候補はデッキのルール（レアリティの枚数・同名の上限）を破らないものだけ。
 * 乱数は呼び出し側が渡す（UI の Math.random でよい。エンジンの外）。
 */
import { analyzeCard, analyzeDeck, BALANCE, classifyCard, type CardDef, type Deck } from '../../engine/index.ts';

const D = BALANCE.draft;

/** カードID → 枚数 */
export type DraftCounts = Readonly<Record<string, number>>;

/** CPU のピックで、同じ種類（モンスター・アタック・スキル・パワー）が1枚選ばれるごとに点を下げる割合（偏りを避ける。表示・CPU 用の目安） */
const SAME_TYPE_PENALTY = 0.06;

/** 候補の山：ID の重なりを除き、ルール違反とレジェンドを外す */
export function draftPool(cards: readonly CardDef[]): CardDef[] {
  const seen = new Set<string>();
  const out: CardDef[] = [];
  for (const c of cards) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    if (c.rarity === 'legend') continue;
    if (!analyzeCard(c).valid) continue;
    out.push(c);
  }
  return out;
}

export function countTotal(counts: DraftCounts): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

export function deckFromCounts(counts: DraftCounts, id: string, name: string): Deck {
  return { v: 1, id, name, entries: Object.entries(counts).map(([cardId, count]) => ({ cardId, count })) };
}

/** このカードを copies 枚足しても、デッキのルール（レアリティの枚数・同名の上限・30枚）を破らないか */
export function canAdd(counts: DraftCounts, def: CardDef, byId: ReadonlyMap<string, CardDef>): boolean {
  if (countTotal(counts) + D.copies > BALANCE.deck.size) return false;
  const next = { ...counts, [def.id]: (counts[def.id] ?? 0) + D.copies };
  const map = byId.has(def.id) ? byId : new Map([...byId, [def.id, def]]);
  const a = analyzeDeck(deckFromCounts(next, 'draft', 'ドラフト'), map);
  return a.violations.every((v) => v.code === 'DECK_SIZE');
}

/** 今回の候補（足せるものから offer 枚。足せるものが少なければその数だけ） */
export function makeOffer(pool: readonly CardDef[], counts: DraftCounts, random: () => number): CardDef[] {
  const byId = new Map(pool.map((c) => [c.id, c]));
  const ok = pool.filter((c) => canAdd(counts, c, byId));
  const out: CardDef[] = [];
  const rest = [...ok];
  while (out.length < D.offer && rest.length > 0) {
    const i = Math.floor(random() * rest.length);
    out.push(rest.splice(Math.min(i, rest.length - 1), 1)[0]!);
  }
  return out;
}

export function addPick(counts: DraftCounts, def: CardDef): Record<string, number> {
  return { ...counts, [def.id]: (counts[def.id] ?? 0) + D.copies };
}

/** CPU のピックの点：ポイント（コストで引く前の強さの目安）を、すでに多い種類ほど下げる */
export function cpuPickScore(def: CardDef, counts: DraftCounts, byId: ReadonlyMap<string, CardDef>): number {
  const type = classifyCard(def);
  let same = 0;
  for (const [id, n] of Object.entries(counts)) {
    const c = byId.get(id);
    if (c && classifyCard(c) === type) same += n / D.copies;
  }
  // コストで引く分を戻した「中身の強さ」（デメリットは引いたまま）
  const power = analyzeCard(def).points.lines.filter((l) => l.kind !== 'cost').reduce((sum, l) => sum + l.value, 0);
  return power * Math.max(0.1, 1 - SAME_TYPE_PENALTY * same);
}

export function cpuPick(offer: readonly CardDef[], counts: DraftCounts, byId: ReadonlyMap<string, CardDef>): CardDef | undefined {
  let best: CardDef | undefined;
  let bestScore = -Infinity;
  for (const c of offer) {
    const s = cpuPickScore(c, counts, byId);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}

/** CPU のドラフト（同じ山から自分の rounds 回を選ぶ） */
export function runCpuDraft(pool: readonly CardDef[], random: () => number): Record<string, number> {
  const byId = new Map(pool.map((c) => [c.id, c]));
  let counts: Record<string, number> = {};
  for (let r = 0; r < D.rounds; r++) {
    const pick = cpuPick(makeOffer(pool, counts, random), counts, byId);
    if (!pick) break;
    counts = addPick(counts, pick);
  }
  return counts;
}

/** デッキで使うカードの定義 */
export function cardsOf(counts: DraftCounts, pool: readonly CardDef[]): CardDef[] {
  return pool.filter((c) => (counts[c.id] ?? 0) > 0);
}
