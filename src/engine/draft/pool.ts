/** ドラフトのカードの山と、デッキのルールに照らした「足せるか」（決定事項 #115） */
import { analyzeCard } from '../analyze.ts';
import { BALANCE } from '../balance.ts';
import { analyzeDeck, normalizeName } from '../deck.ts';
import { RARITY_LABEL } from '../labels.ts';
import type { CardDef, Deck } from '../types.ts';
import type { DraftBlockReason, DraftCounts } from './types.ts';

const D = BALANCE.draft;

/**
 * 候補の山：ID の重なりを除き、ルール違反を外す。レジェンドは場から交互に取る形式（legends: true）だけに出す
 * （1回で copies 枚入るひとりで選ぶ形式には、同名1枚のレジェンドは入れられない：決定事項 #134）
 */
export function draftPool(cards: readonly CardDef[], opts: { legends?: boolean } = {}): CardDef[] {
  const seen = new Set<string>();
  const out: CardDef[] = [];
  for (const c of cards) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    if (c.rarity === 'legend' && !opts.legends) continue;
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

/** 1回取るとデッキに入る枚数（レジェンドは同名1枚の決まりがあるので1枚：決定事項 #134） */
export function copiesOf(def: Pick<CardDef, 'rarity'>): number {
  return def.rarity === 'legend' ? 1 : D.copies;
}

export function addPick(counts: DraftCounts, def: CardDef): Record<string, number> {
  return { ...counts, [def.id]: (counts[def.id] ?? 0) + copiesOf(def) };
}

/** 取ったレジェンドの種類の数 */
function legendsIn(counts: DraftCounts, byId: ReadonlyMap<string, CardDef>): number {
  return Object.entries(counts).filter(([id, n]) => n > 0 && byId.get(id)?.rarity === 'legend').length;
}

/** デッキで使うカードの定義 */
export function cardsOf(counts: DraftCounts, pool: readonly CardDef[]): CardDef[] {
  return pool.filter((c) => (counts[c.id] ?? 0) > 0);
}

export type AddCheck = { ok: true } | { ok: false; reason: DraftBlockReason | 'full'; message: string };

/**
 * このカードを copies 枚足しても、デッキのルール（レアリティの枚数・同名の上限・30枚）を破らないか。理由付き。
 * byId には counts のカードの定義が入っていること
 */
export function checkAdd(counts: DraftCounts, def: CardDef, byId: ReadonlyMap<string, CardDef>): AddCheck {
  const copies = copiesOf(def);
  if (countTotal(counts) + copies > BALANCE.deck.size) return { ok: false, reason: 'full', message: `デッキはもう${BALANCE.deck.size}枚です` };
  if (def.rarity === 'legend' && legendsIn(counts, byId) >= D.legendTakes) {
    return { ok: false, reason: 'rarityLimit', message: `レジェンドはもう取れません（ドラフトでは1人${D.legendTakes}枚まで）` };
  }
  const next = { ...counts, [def.id]: (counts[def.id] ?? 0) + copies };
  const map = byId.get(def.id) === def ? byId : new Map([...byId, [def.id, def]]);
  const a = analyzeDeck(deckFromCounts(next, 'draft', 'ドラフト'), map);
  const bad = a.violations.filter((v) => v.code !== 'DECK_SIZE');
  if (bad.length === 0) return { ok: true };
  const label = RARITY_LABEL[def.rarity];
  if (bad.some((v) => v.code === 'DECK_RARITY_LIMIT')) {
    const limit = BALANCE.rarity[def.rarity].deckLimit;
    return { ok: false, reason: 'rarityLimit', message: `${label}はもう取れません（デッキに計${limit ?? 0}枚まで）` };
  }
  if (bad.some((v) => v.code === 'DECK_SAME_NAME')) {
    return { ok: false, reason: 'sameName', message: `「${normalizeName(def.name)}」はもう取れません（同名の枚数の上限）` };
  }
  return { ok: false, reason: 'deckRule', message: bad[0]?.message ?? 'デッキのルールに合いません' };
}

/** このカードを copies 枚足しても、デッキのルールを破らないか */
export function canAdd(counts: DraftCounts, def: CardDef, byId: ReadonlyMap<string, CardDef>): boolean {
  return checkAdd(counts, def, byId).ok;
}

/** レアリティ1つで1人が取れる回数の上限（デッキの上限と同名の上限から。制限なしは null） */
function maxTakesOf(rarity: CardDef['rarity']): number | null {
  const r = BALANCE.rarity[rarity];
  const copies = copiesOf({ rarity });
  if (r.perNameLimit !== null && r.perNameLimit < copies) return 0;
  const byDeck = r.deckLimit === null ? null : Math.floor(r.deckLimit / copies);
  return rarity === 'legend' ? Math.min(byDeck ?? D.legendTakes, D.legendTakes) : byDeck;
}

/**
 * 場から交互に取る形式で、どちらも最後まで取れることが保証できる山か。足りなければ理由の文。
 * コモン（取る数に制限なし）が「2人分の取得回数 − 取れるレア・エピックの回数」以上あれば、どの取り方でも詰まらない
 * （コモンが尽きたときに詰まる人は、レア・エピックを取り尽くしているか上限まで取っているので、すでに取り終えている）
 */
export function poolProblem(pool: readonly CardDef[]): string | null {
  const T = D.takes;
  if (T * D.copies !== BALANCE.deck.size) return `ドラフトの設定が合いません（${T}回×${D.copies}枚がデッキの枚数と違う）`;
  let free = 0;
  let limited = 0;
  for (const rarity of ['common', 'rare', 'epic', 'legend'] as const) {
    const copies: number = D.pileCopies[rarity];
    if (copies === 0) continue;
    const cards = pool.filter((c) => c.rarity === rarity);
    const max = maxTakesOf(rarity);
    // 制限なしは山に入る枚数（pileCopies）で数える。制限ありは同名を1つに数える（同名は合わせて上限を数えるため）
    if (max === null) free += cards.length * copies;
    else limited += Math.min(new Set(cards.map((c) => normalizeName(c.name))).size, max);
  }
  const need = 2 * T - limited;
  if (free < need) return `ドラフトに使えるカードが足りません（制限なしのカードが${free}種類。${need}種類以上必要）`;
  return null;
}
