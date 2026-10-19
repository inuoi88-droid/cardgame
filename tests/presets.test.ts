// プリセットデッキはすべてカード作成ルールとデッキルールを守る（決定事項 #76）
import { describe, expect, it } from 'vitest';
import { analyzeCard, analyzeDeck } from '../src/engine/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { SAMPLE_CARDS } from '../src/samples.ts';

/** 使うと選ぶ画面が出る効果（CPU 戦で選択ダイアログを見せるため、どのデッキにも1枚以上入れる） */
const CHOICE_EFFECTS = ['search', 'recall', 'retain', 'dispel'];

describe('プリセットデッキ', () => {
  it('5つある（毒・モンスター・呪い・守り・コンボ）', () => {
    expect(PRESET_DECKS.map((d) => d.name)).toEqual(['毒沼の魔女', '獣の群れ', '呪いの契約', '鉄壁の砦', '歯車仕掛け']);
    expect(new Set(PRESET_DECKS.map((d) => d.id)).size).toBe(PRESET_DECKS.length);
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
    it(`${p.name}：選ぶ効果（サーチ・回収・保持・解除）のカードが入っている`, () => {
      const choice = p.cards.filter((c) => c.effects.some((e) => CHOICE_EFFECTS.includes(e.id)));
      expect(choice.length).toBeGreaterThanOrEqual(1);
    });
    it(`${p.name}：予算を使い切っている（どのカードも上限との差がレアリティ上限の3割以内）`, () => {
      for (const card of p.cards) {
        const a = analyzeCard(card);
        expect(a.points.remaining, card.name).toBeLessThanOrEqual(a.points.cap * 0.3);
      }
    });
    it(`${p.name}：説明が1行ある`, () => {
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.description).not.toContain('\n');
    });
  }

  it('呪いデッキは呪いカードが中心', () => {
    const p = PRESET_DECKS[2]!;
    const a = analyzeDeck(p.deck, new Map(p.cards.map((c) => [c.id, c])));
    expect(a.curseCount).toBeGreaterThanOrEqual(15);
  });
});

describe('サンプルカード', () => {
  it('作成例4枚と見本4枚。どれもルールを守る', () => {
    expect(SAMPLE_CARDS).toHaveLength(8);
    expect(new Set(SAMPLE_CARDS.map((c) => c.id)).size).toBe(8);
    for (const card of SAMPLE_CARDS) expect(analyzeCard(card).violations, card.name).toEqual([]);
  });

  it('見本4枚は予算をほぼ使い切っている', () => {
    for (const card of SAMPLE_CARDS.slice(4)) {
      const a = analyzeCard(card);
      expect(a.points.remaining, card.name).toBeLessThanOrEqual(a.points.cap * 0.1);
    }
  });
});
