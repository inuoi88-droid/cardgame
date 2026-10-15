// デッキの枚数とレアリティ制限
import { describe, expect, it } from 'vitest';
import { analyzeDeck, type CardDef, type Deck } from '../src/engine/index.ts';
import { EXAMPLES, card, codes } from './helpers.ts';

// 有効なカードを用意する
const common = EXAMPLES.hinoko; // コモン
const rare = (n: number) => card({ id: `rare${n}`, name: `レア${n}`, rarity: 'rare', cost: 1, effects: [{ id: 'damage', value: 9, timing: 'play', target: 'chosen', condition: null }] });
const epic = (n: number) => card({ id: `epic${n}`, name: `エピック${n}`, rarity: 'epic', cost: 1, effects: [{ id: 'damage', value: 11, timing: 'play', target: 'chosen', condition: null }] });
const legend = (n: number) => card({ id: `legend${n}`, name: `レジェンド${n}`, rarity: 'legend', cost: 1, effects: [{ id: 'damage', value: 14, timing: 'play', target: 'chosen', condition: null }] });
const curseLegend = EXAMPLES.kyosenshi;

function deckOf(entries: [CardDef, number][], name = 'テストデッキ'): [Deck, Map<string, CardDef>] {
  const map = new Map<string, CardDef>();
  for (const [c] of entries) map.set(c.id, c);
  return [{ v: 1, id: 'd1', name, entries: entries.map(([c, count]) => ({ cardId: c.id, count })) }, map];
}

describe('デッキ', () => {
  it('30枚ちょうどで作れる', () => {
    const a = analyzeDeck(...deckOf([[common, 30]]));
    expect(a.total).toBe(30);
    expect(a.violations).toEqual([]);
    expect(a.valid).toBe(true);
  });

  it('29枚・31枚では作れない', () => {
    expect(codes(analyzeDeck(...deckOf([[common, 29]])).violations)).toEqual(['DECK_SIZE']);
    expect(codes(analyzeDeck(...deckOf([[common, 31]])).violations)).toEqual(['DECK_SIZE']);
  });

  it('レアは計16枚まで、同名5枚まで', () => {
    const ok = deckOf([[rare(1), 5], [rare(2), 5], [rare(3), 5], [rare(4), 1], [common, 14]]);
    expect(analyzeDeck(...ok).valid).toBe(true);
    const over = deckOf([[rare(1), 5], [rare(2), 5], [rare(3), 5], [rare(4), 2], [common, 13]]);
    expect(codes(analyzeDeck(...over).violations)).toEqual(['DECK_RARITY_LIMIT']);
    const sameName = deckOf([[rare(1), 6], [common, 24]]);
    expect(codes(analyzeDeck(...sameName).violations)).toEqual(['DECK_SAME_NAME']);
  });

  it('エピックは計8枚まで、同名3枚まで', () => {
    expect(analyzeDeck(...deckOf([[epic(1), 3], [epic(2), 3], [epic(3), 2], [common, 22]])).valid).toBe(true);
    expect(codes(analyzeDeck(...deckOf([[epic(1), 3], [epic(2), 3], [epic(3), 3], [common, 21]])).violations)).toEqual(['DECK_RARITY_LIMIT']);
    expect(codes(analyzeDeck(...deckOf([[epic(1), 4], [common, 26]])).violations)).toEqual(['DECK_SAME_NAME']);
  });

  it('レジェンドは計4枚まで、同名1枚まで', () => {
    expect(analyzeDeck(...deckOf([[legend(1), 1], [legend(2), 1], [legend(3), 1], [legend(4), 1], [common, 26]])).valid).toBe(true);
    const five = deckOf([[legend(1), 1], [legend(2), 1], [legend(3), 1], [legend(4), 1], [legend(5), 1], [common, 25]]);
    expect(codes(analyzeDeck(...five).violations)).toEqual(['DECK_RARITY_LIMIT']);
    expect(codes(analyzeDeck(...deckOf([[legend(1), 2], [common, 28]])).violations)).toEqual(['DECK_SAME_NAME']);
  });

  it('同名判定は名前で行う（別IDでも同じ名前なら合算）', () => {
    const a = legend(1);
    const b = { ...legend(2), name: a.name };
    expect(codes(analyzeDeck(...deckOf([[a, 1], [b, 1], [common, 28]])).violations)).toEqual(['DECK_SAME_NAME']);
  });

  it('呪いカードには枚数制限がない（呪いレジェンド10枚でもよい）', () => {
    const a = analyzeDeck(...deckOf([[curseLegend, 10], [common, 20]]));
    expect(a.valid).toBe(true);
    expect(a.curseCount).toBe(10);
    expect(a.rarityRows.find((r) => r.rarity === 'legend')!.count).toBe(0);
  });

  it('ルール違反のカードが入っていると作れない', () => {
    const broken = { ...common, id: 'broken', name: '壊れたカード', cost: 0 };
    expect(codes(analyzeDeck(...deckOf([[broken, 1], [common, 29]])).violations)).toEqual(['DECK_INVALID_CARD']);
  });

  it('削除されたカードが入っていると作れない', () => {
    const [deck, map] = deckOf([[common, 30]]);
    map.delete(common.id);
    expect(codes(analyzeDeck(deck, map).violations)).toContain('DECK_MISSING_CARD');
  });

  it('デッキ名が空だと作れない', () => {
    expect(codes(analyzeDeck(...deckOf([[common, 30]], ' ')).violations)).toEqual(['DECK_NAME_EMPTY']);
  });
});
