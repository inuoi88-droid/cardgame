/**
 * デッキ箱のタイル（対戦の準備・ロビーの DeckPicker。UI2）の見どころ：代表カード・レアリティごとの枚数・ミニのコスト分布。純粋関数
 * （tests/battle/deckSummary.test.ts）。
 * - 代表カード：いちばん高いレアリティ → 同じなら枚数の多いもの → 同じなら先に入っているもの
 * - コスト分布：BALANCE.card.costMin〜costMax の各コストの枚数（ミニの柱。高さの比だけを使う）
 */
import { BALANCE, RARITIES, type CardDef, type Deck, type Rarity } from '../../engine/index.ts';

export interface DeckSummary {
  total: number;
  best: CardDef | undefined;
  gems: Record<Rarity, number>;
  curve: number[];
}

export function deckSummary(deck: Pick<Deck, 'entries'>, cards: readonly CardDef[]): DeckSummary {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const gems = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
  const min = BALANCE.card.costMin;
  const curve = Array.from({ length: BALANCE.card.costMax - min + 1 }, () => 0);
  let total = 0;
  let best: { def: CardDef; n: number } | undefined;
  for (const e of deck.entries) {
    total += e.count;
    const def = byId.get(e.cardId);
    if (!def) continue;
    gems[def.rarity] += e.count;
    const i = Math.min(curve.length - 1, Math.max(0, def.cost - min));
    curve[i]! += e.count;
    const rank = RARITIES.indexOf(def.rarity);
    if (!best || rank > RARITIES.indexOf(best.def.rarity) || (rank === RARITIES.indexOf(best.def.rarity) && e.count > best.n)) best = { def, n: e.count };
  }
  return { total, best: best?.def, gems, curve };
}
