// 「残りのポイントで入れられるもの」（決定事項 #140）：足しても予算に収まる最大の数値を、本物のポイント計算で探す（倍率1）
import { describe, expect, it } from 'vitest';
import { analyzeCard } from '../src/engine/index.ts';
import { fitsWithin, fitValueText } from '../src/ui/editor/fits.ts';
import { EXAMPLES, card } from './helpers.ts';
import { fx } from './battle/helpers.ts';

describe('残りのポイントで入れられるもの', () => {
  it('空のコモン（コスト1）：ダメージは予算いっぱいの最大値。1つ上げると超える', () => {
    const c = card({ rarity: 'common', cost: 1, effects: [] });
    const f = fitsWithin(c);
    expect(f.remaining).toBe(analyzeCard(c).points.remaining);
    const dmg = f.effects.find((x) => x.id === 'damage')!;
    expect(dmg.max).toBeGreaterThan(0);
    expect(dmg.left).toBeGreaterThanOrEqual(0);
    const over = analyzeCard({ ...c, effects: [dmg.effect!, ...[]].map((e) => ({ ...e, value: dmg.max! + 1 })) });
    expect(over.points.remaining).toBeLessThan(0);
    expect(analyzeCard({ ...c, effects: [dmg.effect!] }).valid).toBe(true);
    expect(fitValueText(dmg)).toContain(`最大 ${dmg.max}`);
  });

  it('上限ちょうどのカード（作成例「火の粉」）には、ポイントを使うものは入らない', () => {
    const f = fitsWithin(EXAMPLES.hinoko);
    expect(f.remaining).toBe(0);
    for (const it of [...f.effects, ...f.keywords, ...f.abilities, ...f.stats]) expect(it.points).toBeLessThanOrEqual(0);
  });

  it('超過しているカードは空', () => {
    const c = card({ rarity: 'common', cost: 1, effects: [fx({ id: 'damage', value: 9 })] });
    const f = fitsWithin(c);
    expect(f.remaining).toBeLessThan(0);
    expect([...f.effects, ...f.keywords, ...f.abilities, ...f.stats]).toEqual([]);
  });

  it('モンスター：ステータスとキーワードも並び、足したカードは予算内', () => {
    const c = card({ rarity: 'rare', cost: 3, stats: { attack: 1, hp: 1, defense: 0 }, effects: [] });
    const f = fitsWithin(c);
    const atk = f.stats.find((s) => s.stat === 'attack')!;
    expect(atk.max).toBeGreaterThan(0);
    expect(analyzeCard({ ...c, stats: { ...c.stats!, attack: c.stats!.attack + atk.max! } }).points.remaining).toBeGreaterThanOrEqual(0);
    expect(f.keywords.length).toBeGreaterThan(0);
    for (const k of f.keywords) expect(analyzeCard({ ...c, keywords: [k.keyword!] }).points.remaining).toBeGreaterThanOrEqual(0);
  });

  it('効果が上限まで入っていれば、効果は並べずに理由を出す', () => {
    const c = card({ rarity: 'common', cost: 5, effects: [fx({ id: 'damage', value: 1 }), fx({ id: 'damage', value: 1 }), fx({ id: 'damage', value: 1 })] });
    const f = fitsWithin(c);
    expect(f.effects).toEqual([]);
    expect(f.effectsFull).toContain('効果は');
  });
});
