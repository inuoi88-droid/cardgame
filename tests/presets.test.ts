// プリセットデッキはすべてカード作成ルールとデッキルールを守る
import { describe, expect, it } from 'vitest';
import { analyzeCard, analyzeDeck } from '../src/engine/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';

describe('プリセットデッキ', () => {
  it('3つある（毒・モンスター・呪い）', () => {
    expect(PRESET_DECKS.map((d) => d.name)).toEqual(['毒沼の魔女', '獣の群れ', '呪いの契約']);
  });

  for (const p of PRESET_DECKS) {
    it(`${p.name}：すべてのカードが作成ルールを守る`, () => {
      for (const card of p.cards) {
        const a = analyzeCard(card);
        expect(a.violations.map((v) => `${card.name}: ${v.message}`)).toEqual([]);
      }
    });
    it(`${p.name}：デッキルールを守る`, () => {
      const a = analyzeDeck(p.deck, new Map(p.cards.map((c) => [c.id, c])));
      expect(a.violations.map((v) => v.message)).toEqual([]);
    });
  }

  it('呪いデッキは呪いカードが中心', () => {
    const p = PRESET_DECKS[2]!;
    const a = analyzeDeck(p.deck, new Map(p.cards.map((c) => [c.id, c])));
    expect(a.curseCount).toBeGreaterThanOrEqual(15);
  });
});
