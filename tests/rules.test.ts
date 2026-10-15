// ポイント計算と種類判定の細部（決定事項ログの内容を含む）
import { describe, expect, it } from 'vitest';
import { analyzeCard, BALANCE, type EffectInstance } from '../src/engine/index.ts';
import { ceilPoints, floorPoints } from '../src/engine/math.ts';
import { card } from './helpers.ts';

const fx = (e: Partial<EffectInstance> & { id: string }): EffectInstance => ({
  timing: 'play',
  target: 'chosen',
  condition: null,
  ...e,
});

const effectValue = (e: EffectInstance, stats = false) =>
  analyzeCard(card({ rarity: 'legend', cost: 5, stats: stats ? { attack: 1, hp: 1, defense: 0 } : null, effects: [e] })).points.lines.find(
    (l) => l.kind === 'effect',
  )!.value;

describe('効果のポイント', () => {
  it('防御無視は+50%、吸収と両方なら+100%（加算）', () => {
    expect(effectValue(fx({ id: 'damage', value: 2 }))).toBe(4);
    expect(effectValue(fx({ id: 'damage', value: 2, mods: ['pierce'] }))).toBe(6);
    expect(effectValue(fx({ id: 'damage', value: 2, mods: ['pierce', 'drain'] }))).toBe(8);
  });

  it('防御無視は他の倍率より先に掛け、最後に1回だけ切り上げる', () => {
    // 4 × 1.5 × 0.7 = 4.2 → 5
    expect(effectValue(fx({ id: 'damage', value: 2, mods: ['pierce'], target: 'random' }))).toBe(5);
  });

  it('連撃は N×M×2', () => {
    expect(effectValue(fx({ id: 'multiHit', value: 3, hits: 2 }))).toBe(12);
  });

  it('ランダム1体 ×0.7 は切り上げ（毒1：3×0.7＝2.1 → 3）', () => {
    expect(effectValue(fx({ id: 'poison', value: 1, target: 'random' }))).toBe(3);
  });

  it('相手全体 ×2.0、敵味方すべて ×1.2、相手モンスター全体 ×1.5', () => {
    expect(effectValue(fx({ id: 'poison', value: 1, target: 'enemyAll' }))).toBe(6);
    expect(effectValue(fx({ id: 'poison', value: 2, target: 'everyone' }))).toBe(8); // 7.2 → 8
    expect(effectValue(fx({ id: 'poison', value: 2, target: 'enemyMonsters' }))).toBe(9);
  });

  it('やけどは延長1ターンごとに+3pt', () => {
    expect(effectValue(fx({ id: 'burn', value: 0 }))).toBe(10);
    expect(effectValue(fx({ id: 'burn', value: 2 }))).toBe(16);
  });

  it('蘇生は 10 + 5×N', () => {
    expect(effectValue(fx({ id: 'revive', value: 2, target: 'self' }))).toBe(20);
  });

  it('毎ターン開始時はモンスター ×2.5、パワー ×3.0', () => {
    expect(effectValue(fx({ id: 'shield', value: 2, timing: 'turnStart', target: 'self' }), true)).toBe(8); // 3×2.5=7.5→8
    expect(effectValue(fx({ id: 'shield', value: 2, timing: 'turnStart', target: 'self' }))).toBe(9);
  });

  it('カードを使うたび ×4.0、破壊されたとき ×0.8、ダメージを受けたとき ×1.5', () => {
    expect(effectValue(fx({ id: 'draw', value: 1, timing: 'cardPlayed', target: 'self' }))).toBe(20);
    expect(effectValue(fx({ id: 'damage', value: 3, timing: 'destroyed', target: 'enemyPlayer' }), true)).toBe(5); // 4.8→5
    expect(effectValue(fx({ id: 'damage', value: 3, timing: 'damaged', target: 'chosen' }), true)).toBe(9);
  });

  it('条件：ゆるい ×0.8、ふつう ×0.6、きびしい ×0.4', () => {
    expect(effectValue(fx({ id: 'damage', value: 5, condition: 'hasMonster' }))).toBe(8);
    expect(effectValue(fx({ id: 'damage', value: 5, condition: 'lowHp' }))).toBe(6);
    expect(effectValue(fx({ id: 'damage', value: 5, condition: 'manyMonsters' }))).toBe(4);
  });
});

describe('キーワード・ステータス・デメリット', () => {
  it('速攻は攻撃力×2、二回攻撃は攻撃力×3', () => {
    const a = analyzeCard(
      card({ rarity: 'legend', cost: 3, stats: { attack: 3, hp: 1, defense: 1 }, keywords: [{ id: 'haste' }, { id: 'doubleAttack' }] }),
    );
    const v = Object.fromEntries(a.points.lines.map((l) => [l.label, l.value]));
    expect(v).toMatchObject({ 攻撃力3: 9, 体力1: 2, 守備力1: 4, 速攻: 6, 二回攻撃: 9, コスト3: -30 });
  });

  it('デメリットは切り捨て（自傷1：1.5 → 1）', () => {
    const a = analyzeCard(card({ effects: [fx({ id: 'damage', value: 1 })], drawbacks: [{ id: 'selfDamage', value: 1, timing: 'play' }] }));
    expect(a.points.drawbackTotal).toBe(1);
  });

  it('倍率込み固定値のデメリット（寄生5）でコモンの呪い条件を満たせる', () => {
    const a = analyzeCard(card({ effects: [fx({ id: 'damage', value: 5 })], drawbacks: [{ id: 'parasite', timing: null }] }));
    expect(a.points.drawbackTotal).toBe(5);
    expect(a.points.total).toBe(10 - 10 - 5);
    expect(a.isCurse).toBe(true);
    expect(a.valid).toBe(true);
  });
});

describe('カードの種類の自動判定', () => {
  const type = (c: Parameters<typeof card>[0]) => analyzeCard(card({ rarity: 'legend', cost: 5, ...c })).cardType;

  it('ステータスがあればモンスター（筋力があっても）', () => {
    expect(type({ stats: { attack: 1, hp: 1, defense: 0 }, effects: [fx({ id: 'strength', value: 1, timing: 'summon', target: 'self' })] })).toBe('monster');
  });

  it('筋力と使用時ダメージ → パワー・アタック', () => {
    expect(type({ effects: [fx({ id: 'damage', value: 3 }), fx({ id: 'strength', value: 1, target: 'self' })] })).toBe('powerAttack');
  });

  it('パワー用タイミングの効果 → パワー', () => {
    expect(type({ effects: [fx({ id: 'draw', value: 1, timing: 'cardPlayed', target: 'self' })] })).toBe('power');
  });

  it('パワー用タイミングのダメージだけならパワー（使用時のダメージだけで判定）', () => {
    expect(type({ effects: [fx({ id: 'damage', value: 2, timing: 'turnStart', target: 'enemyPlayer' })] })).toBe('power');
  });

  it('パワー用タイミングのデメリットは永続効果として数える', () => {
    const drawbacks = [{ id: 'selfDamage', value: 4, timing: 'turnStart' as const }];
    expect(type({ effects: [fx({ id: 'damage', value: 3 })], drawbacks })).toBe('powerAttack');
    expect(type({ effects: [fx({ id: 'shield', value: 3, target: 'self' })], drawbacks })).toBe('power');
  });

  it('使用時のダメージ → アタック', () => {
    expect(type({ effects: [fx({ id: 'multiHit', value: 1, hits: 3 })] })).toBe('attack');
  });

  it('処刑・毒はダメージ効果に含めない → スキル', () => {
    expect(type({ effects: [fx({ id: 'execute', value: 3 })] })).toBe('skill');
    expect(type({ effects: [fx({ id: 'poison', value: 3 })] })).toBe('skill');
  });
});

describe('丸め', () => {
  it('浮動小数の誤差で切り上げ・切り捨てがずれない', () => {
    expect(ceilPoints(0.1 * 3 * 10)).toBe(3); // 3.0000000000000004
    expect(floorPoints(4.35 * 100)).toBe(435); // 434.99999999999994
    expect(ceilPoints(2.1)).toBe(3);
    expect(floorPoints(1.5)).toBe(1);
  });

  it('balance.ts の値を使っている（コスト1あたり）', () => {
    expect(BALANCE.card.pointsPerCost).toBe(10);
  });
});
