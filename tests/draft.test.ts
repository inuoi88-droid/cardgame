// ドラフト戦（MTG 要素 △ バッチD）の純粋な関数とコスト分布。倍率1
import { describe, expect, it } from 'vitest';
import { analyzeDeck, BALANCE, type CardDef } from '../src/engine/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { addPick, canAdd, cardsOf, countTotal, cpuPick, deckFromCounts, draftPool, makeOffer, runCpuDraft, type DraftCounts } from '../src/ui/battle/draft.ts';
import { costCurve } from '../src/ui/components/costCurve.ts';
import { card } from './helpers.ts';

/** 決まった乱数（線形合同法） */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const allPresetCards = PRESET_DECKS.flatMap((p) => p.cards);
const D = BALANCE.draft;

describe('ドラフト戦', () => {
  it('候補の山：ID の重なり・ルール違反・レジェンドを除く', () => {
    const legend = card({ id: 'lg', name: '伝説', rarity: 'legend', cost: 1, effects: [{ id: 'draw', value: 1, timing: 'play', target: 'self', condition: null }] });
    const broken = card({ id: 'bad', name: '壊れ', cost: 0, effects: [{ id: 'damage', value: 99, timing: 'play', target: 'chosen', condition: null }] });
    const pool = draftPool([...allPresetCards, ...allPresetCards, legend, broken]);
    expect(pool.some((c) => c.id === 'lg' || c.id === 'bad')).toBe(false);
    expect(new Set(pool.map((c) => c.id)).size).toBe(pool.length);
    expect(pool.length).toBeGreaterThanOrEqual(D.offer);
  });

  for (const seed of [1, 2, 3, 4, 5]) {
    it(`${D.rounds}回選ぶと${D.rounds * D.copies}枚の合法なデッキになる（候補はいつもルールを破らない。seed ${seed}）`, () => {
      const pool = draftPool(allPresetCards);
      const byId = new Map(pool.map((c) => [c.id, c]));
      const rand = seeded(seed);
      let counts: DraftCounts = {};
      for (let r = 0; r < D.rounds; r++) {
        const offer = makeOffer(pool, counts, rand);
        expect(offer.length).toBe(D.offer);
        expect(new Set(offer.map((c) => c.id)).size).toBe(offer.length);
        for (const c of offer) expect(canAdd(counts, c, byId)).toBe(true);
        // いちばん高いレアリティを取り続けても破らない
        const pick = [...offer].sort((a, b) => ['common', 'rare', 'epic'].indexOf(b.rarity) - ['common', 'rare', 'epic'].indexOf(a.rarity))[0]!;
        counts = addPick(counts, pick);
      }
      expect(countTotal(counts)).toBe(BALANCE.deck.size);
      const a = analyzeDeck(deckFromCounts(counts, 'd', 'ドラフト'), byId);
      expect(a.violations).toEqual([]);
      expect(cardsOf(counts, pool).length).toBe(Object.keys(counts).length);
      // 30枚になったら、もう足せない
      expect(makeOffer(pool, counts, rand)).toEqual([]);
    });
  }

  it('CPU のドラフトも合法な30枚になり、ポイントの高いものを選ぶ', () => {
    const pool = draftPool(allPresetCards);
    const byId = new Map(pool.map((c) => [c.id, c]));
    const counts = runCpuDraft(pool, seeded(9));
    expect(countTotal(counts)).toBe(BALANCE.deck.size);
    expect(analyzeDeck(deckFromCounts(counts, 'c', 'CPU'), byId).violations).toEqual([]);
    const weak = card({ id: 'w', name: '弱', cost: 1, effects: [{ id: 'draw', value: 1, timing: 'play', target: 'self', condition: null }] });
    const strong = card({ id: 's', name: '強', cost: 2, stats: { attack: 3, hp: 3, defense: 0 } });
    expect(cpuPick([weak, strong], {}, new Map([[weak.id, weak], [strong.id, strong]]))?.id).toBe('s');
  });

  it('エピックは同名2枚まで・計4枚までなので、2回目は候補に出ない', () => {
    const epic: CardDef = card({ id: 'ep', name: '叙事', rarity: 'epic', cost: 2, stats: { attack: 3, hp: 3, defense: 0 } });
    const byId = new Map([[epic.id, epic]]);
    expect(canAdd({}, epic, byId)).toBe(true);
    expect(canAdd({ ep: D.copies }, epic, byId)).toBe(false);
  });
});

describe('コスト分布', () => {
  it('コスト0〜5の枚数（モンスター／それ以外）・平均・一言', () => {
    const m1 = card({ id: 'm1', name: 'm1', cost: 1, stats: { attack: 1, hp: 1, defense: 0 } });
    const s4 = card({ id: 's4', name: 's4', cost: 4 });
    const c = costCurve({ entries: [{ cardId: 'm1', count: 1 }, { cardId: 's4', count: 9 }] }, [m1, s4]);
    expect(c.bars.map((b) => b.cost)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(c.bars[1]).toEqual({ cost: 1, monster: 1, other: 0 });
    expect(c.bars[4]).toEqual({ cost: 4, monster: 0, other: 9 });
    expect(c.total).toBe(10);
    expect(c.average).toBeCloseTo(3.7);
    expect(c.advice).toContain('軽いカード');
    expect(costCurve({ entries: [] }, []).average).toBe(0);
    for (const p of PRESET_DECKS) expect(costCurve(p.deck, p.cards).total).toBe(BALANCE.deck.size);
  });
});
