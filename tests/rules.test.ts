// ポイント計算と種類判定の細部（決定事項ログの内容を含む。価格表は #67・#68）
import { describe, expect, it } from 'vitest';
import { analyzeCard, BALANCE, type CardDef, type EffectInstance } from '../src/engine/index.ts';
import { ceilPoints, floorPoints } from '../src/engine/math.ts';
import { card } from './helpers.ts';

const fx = (e: Partial<EffectInstance> & { id: string }): EffectInstance => ({
  timing: 'play',
  target: 'chosen',
  condition: null,
  ...e,
});

const effectLine = (e: EffectInstance, extra: Partial<CardDef> = {}) =>
  analyzeCard(card({ rarity: 'legend', cost: 5, stats: null, effects: [e], ...extra })).points.lines.find((l) => l.kind === 'effect')!;
const effectValue = (e: EffectInstance, stats = false) => effectLine(e, stats ? { stats: { attack: 1, hp: 1, defense: 0 } } : {}).value;

describe('効果のポイント', () => {
  it('防御無視は+40%、吸収と両方なら+80%（加算）', () => {
    expect(effectValue(fx({ id: 'damage', value: 2 }))).toBe(4);
    expect(effectValue(fx({ id: 'damage', value: 2, mods: ['pierce'] }))).toBe(6); // 5.6 → 6
    expect(effectValue(fx({ id: 'damage', value: 2, mods: ['pierce', 'drain'] }))).toBe(8); // 7.2 → 8
    expect(effectValue(fx({ id: 'damage', value: 5, mods: ['pierce'] }))).toBe(14);
  });

  it('防御無視は他の倍率より先に掛け、最後に1回だけ切り上げる', () => {
    // 4 × 1.4 × 0.6 = 3.36 → 4
    expect(effectValue(fx({ id: 'damage', value: 2, mods: ['pierce'], target: 'random' }))).toBe(4);
  });

  it('連撃は N×M×2', () => {
    expect(effectValue(fx({ id: 'multiHit', value: 3, hits: 2 }))).toBe(12);
  });

  it('ランダム1体 ×0.6 は切り上げ（毒1：4×0.6＝2.4 → 3）', () => {
    expect(effectValue(fx({ id: 'poison', value: 1, target: 'random' }))).toBe(3);
  });

  it('相手全体 ×3.5、相手モンスター全体 ×2.0', () => {
    expect(effectValue(fx({ id: 'poison', value: 1, target: 'enemyAll' }))).toBe(14);
    expect(effectValue(fx({ id: 'damage', value: 1, target: 'enemyAll' }))).toBe(7);
    expect(effectValue(fx({ id: 'poison', value: 2, target: 'enemyMonsters' }))).toBe(16);
  });

  it('敵味方すべては ×1.0。モンスターにしか効かない効果（処刑・封印など）なら ×1.4', () => {
    expect(effectValue(fx({ id: 'poison', value: 2, target: 'everyone' }))).toBe(8);
    expect(effectLine(fx({ id: 'poison', value: 2, target: 'everyone' })).formula).toBe('2×4');
    expect(effectValue(fx({ id: 'execute', value: 10, target: 'everyone' }))).toBe(21);
    expect(effectLine(fx({ id: 'execute', value: 10, target: 'everyone' })).formula).toBe('15 × 1.4（敵味方すべて）');
    expect(effectValue(fx({ id: 'execute', value: 4, target: 'everyone' }))).toBe(9); // 6 × 1.4 = 8.4 → 9
    expect(effectValue(fx({ id: 'seal', target: 'everyone' }))).toBe(12); // 8 × 1.4 = 11.2 → 12
  });

  it('やけどは延長1ターンごとに+3pt（延長は5ターンまで）', () => {
    expect(effectValue(fx({ id: 'burn', value: 0 }))).toBe(10);
    expect(effectValue(fx({ id: 'burn', value: 2 }))).toBe(16);
    expect(analyzeCard(card({ rarity: 'legend', cost: 5, effects: [fx({ id: 'burn', value: 6 })] })).violations.map((v) => v.code)).toEqual([
      'EFFECT_VALUE',
    ]);
  });

  it('蘇生は 10 + 7×N', () => {
    expect(effectValue(fx({ id: 'revive', value: 2, target: 'self' }))).toBe(24);
  });

  it('バウンスは 8 + 4×N（コストN以下の相手モンスターを戻せる）', () => {
    expect(effectValue(fx({ id: 'bounce', value: 0 }))).toBe(8);
    expect(effectValue(fx({ id: 'bounce', value: 1 }))).toBe(12);
    expect(effectValue(fx({ id: 'bounce', value: 3 }))).toBe(20);
    expect(effectValue(fx({ id: 'bounce', value: 5 }))).toBe(28);
    const a = analyzeCard(card({ rarity: 'epic', cost: 2, effects: [fx({ id: 'bounce', value: 2 })] }));
    expect(a.text.effects).toEqual(['コスト2以下の相手モンスター1体を持ち主の手札に戻す。']);
    expect(analyzeCard(card({ rarity: 'epic', cost: 2, effects: [fx({ id: 'bounce', value: 6 })] })).violations.map((v) => v.code)).toEqual([
      'EFFECT_VALUE',
    ]);
  });

  it('弱体・脆弱は3ターンまで、弱化は5まで', () => {
    const codes = (e: EffectInstance) => analyzeCard(card({ rarity: 'legend', cost: 5, effects: [e] })).violations.map((v) => v.code);
    expect(effectValue(fx({ id: 'weak', value: 3 }))).toBe(15);
    expect(codes(fx({ id: 'weak', value: 4 }))).toEqual(['EFFECT_VALUE']);
    expect(effectValue(fx({ id: 'vulnerable', value: 3 }))).toBe(21);
    expect(codes(fx({ id: 'vulnerable', value: 4 }))).toEqual(['EFFECT_VALUE']);
    expect(effectValue(fx({ id: 'weaken', value: 5 }))).toBe(15);
    expect(codes(fx({ id: 'weaken', value: 6 }))).toEqual(['EFFECT_VALUE']);
  });

  it('毎ターン開始時はモンスター ×2.0、パワー ×8.0。終了時は ×2.5、×8.5（#74。シールドは2につき7pt、#75）', () => {
    expect(effectValue(fx({ id: 'shield', value: 2, timing: 'turnStart', target: 'self' }), true)).toBe(14);
    expect(effectValue(fx({ id: 'shield', value: 2, timing: 'turnStart', target: 'self' }))).toBe(56);
    expect(effectValue(fx({ id: 'shield', value: 2, timing: 'turnEnd', target: 'self' }), true)).toBe(18); // 17.5 → 18
    expect(effectValue(fx({ id: 'shield', value: 2, timing: 'turnEnd', target: 'self' }))).toBe(60); // 59.5 → 60
  });

  it('カードを使うたび ×8.0、破壊されたとき ×0.7、ダメージを受けたとき ×1.5', () => {
    expect(effectValue(fx({ id: 'draw', value: 1, timing: 'cardPlayed', target: 'self' }))).toBe(32);
    expect(effectValue(fx({ id: 'damage', value: 3, timing: 'destroyed', target: 'enemyPlayer' }), true)).toBe(5); // 4.2→5
    expect(effectValue(fx({ id: 'damage', value: 3, timing: 'damaged', target: 'chosen' }), true)).toBe(9);
  });

  it('「攻撃するたび」は攻撃回数を掛け、速攻なら+1.0（二回攻撃＋速攻で ×5.0）', () => {
    const monster = (keywords: CardDef['keywords']) =>
      effectLine(fx({ id: 'poison', value: 1, timing: 'attack', target: 'chosen' }), {
        stats: { attack: 1, hp: 1, defense: 0 },
        keywords,
      });
    expect(monster([]).value).toBe(8);
    expect(monster([]).formula).toBe('4 × 2.0（攻撃するたび）');
    expect(monster([{ id: 'doubleAttack' }]).value).toBe(16);
    expect(monster([{ id: 'doubleAttack' }]).formula).toBe('4 × 2.0×2（攻撃するたび・二回攻撃）');
    expect(monster([{ id: 'haste' }]).value).toBe(12);
    expect(monster([{ id: 'haste' }]).formula).toBe('4 × 2.0+1.0（攻撃するたび・速攻）');
    expect(monster([{ id: 'haste' }, { id: 'doubleAttack' }]).value).toBe(20);
    expect(monster([{ id: 'haste' }, { id: 'doubleAttack' }]).formula).toBe('4 × 2.0×2+1.0（攻撃するたび・二回攻撃・速攻）');
  });

  it('条件は条件ごとの倍率（場にモンスター 0.9 … 毒とやけど 0.5）', () => {
    const v = (condition: EffectInstance['condition']) => effectValue(fx({ id: 'damage', value: 5, condition }));
    expect(v('hasMonster')).toBe(9);
    expect(v('smallHand')).toBe(8);
    expect(v('enemyPoisoned')).toBe(7);
    expect(v('nthCard')).toBe(7);
    expect(v('manyMonsters')).toBe(6);
    expect(v('enemyHpHigher')).toBe(6);
    expect(v('lowHp')).toBe(5);
    expect(v('enemyPoisonBurn')).toBe(5);
    expect(Object.values(BALANCE.condition)).toEqual([0.9, 0.8, 0.7, 0.7, 0.6, 0.6, 0.5, 0.5]);
  });

  it('条件「手札が3枚以下」はパワーのターン開始時・終了時では選べない（モンスターや使用時では選べる）', () => {
    const power = (timing: EffectInstance['timing']) =>
      analyzeCard(card({ rarity: 'legend', cost: 2, effects: [fx({ id: 'draw', value: 1, timing, target: 'self', condition: 'smallHand' })] }));
    expect(power('turnStart').violations.map((v) => v.code)).toEqual(['EFFECT_CONDITION']);
    expect(power('turnEnd').violations.map((v) => v.code)).toEqual(['EFFECT_CONDITION']);
    expect(power('play').valid).toBe(true);
    const monster = analyzeCard(
      card({
        rarity: 'legend',
        cost: 2,
        stats: { attack: 1, hp: 1, defense: 0 },
        effects: [fx({ id: 'shield', value: 1, timing: 'turnEnd', target: 'self', condition: 'smallHand' })],
      }),
    );
    expect(monster.valid).toBe(true);
  });
});

describe('キーワード・ステータス・デメリット', () => {
  it('速攻は攻撃力×2、二回攻撃は攻撃力×4', () => {
    const a = analyzeCard(
      card({ rarity: 'legend', cost: 3, stats: { attack: 3, hp: 1, defense: 1 }, keywords: [{ id: 'haste' }, { id: 'doubleAttack' }] }),
    );
    const v = Object.fromEntries(a.points.lines.map((l) => [l.label, l.value]));
    expect(v).toMatchObject({ 攻撃力3: 9, 体力1: 2, 守備力1: 4, 速攻: 6, 二回攻撃: 12, コスト3: -32 });
  });

  it('貫通は max(2, 攻撃力×0.5)、隠密は 2+攻撃力、不屈は 3+攻撃力、挑発6、飛行3', () => {
    const kw = (attack: number, id: string) =>
      analyzeCard(card({ rarity: 'legend', cost: 5, stats: { attack, hp: 1, defense: 0 }, keywords: [{ id }] })).points.lines.find(
        (l) => l.kind === 'keyword',
      )!;
    expect(kw(1, 'trample').value).toBe(2);
    expect(kw(5, 'trample').value).toBe(3); // 2.5 → 3
    expect(kw(5, 'trample').formula).toBe('max(2, 攻撃力5×0.5)');
    expect(kw(8, 'trample').value).toBe(4);
    expect(kw(4, 'stealth').value).toBe(6);
    expect(kw(4, 'undying').value).toBe(7);
    expect(kw(4, 'taunt').value).toBe(6);
    expect(kw(4, 'flying').value).toBe(3);
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

  it('裏切りは 6 + 攻撃力×3（固定値。攻撃力2なら12、7なら27）', () => {
    const betrayal = (attack: number) =>
      analyzeCard(card({ rarity: 'legend', cost: 2, stats: { attack, hp: 1, defense: 0 }, drawbacks: [{ id: 'betrayal', timing: null }] })).points;
    expect(betrayal(2).drawbackTotal).toBe(12);
    expect(betrayal(7).drawbackTotal).toBe(27);
    expect(betrayal(7).lines.find((l) => l.kind === 'drawback')!.formula).toBe('6+攻撃力7×3（固定）');
    // 維持費6・寄生5はステータスによらない
    const fixed = analyzeCard(
      card({ rarity: 'legend', cost: 2, stats: { attack: 7, hp: 1, defense: 0 }, drawbacks: [{ id: 'upkeep', timing: null }, { id: 'parasite', timing: null }] }),
    );
    expect(fixed.points.drawbackTotal).toBe(11);
  });
});

describe('コストと上限', () => {
  const cost = (c: number, rarity: CardDef['rarity'] = 'legend') =>
    analyzeCard(card({ rarity, cost: c, effects: [fx({ id: 'damage', value: 1 })] })).points;

  it('コストの差し引きは表（0／10／20／32／45／58）', () => {
    expect(BALANCE.card.costPoints).toEqual([0, 10, 20, 32, 45, 58]);
    for (const c of [1, 2, 3, 4, 5]) {
      const line = cost(c).lines.find((l) => l.kind === 'cost')!;
      expect(line.label).toBe(`コスト${c}`);
      expect(line.formula).toBe(`−${BALANCE.card.costPoints[c]}`);
      expect(line.value).toBe(-BALANCE.card.costPoints[c]!);
    }
    expect(cost(0).lines.some((l) => l.kind === 'cost')).toBe(false);
  });

  it('コスト0のカードはレアリティ上限が2下がる（コモン3・レア6・エピック10・レジェンド16）', () => {
    expect(cost(0, 'common').cap).toBe(3);
    expect(cost(0, 'rare').cap).toBe(6);
    expect(cost(0, 'epic').cap).toBe(10);
    expect(cost(0, 'legend').cap).toBe(16);
    expect(cost(1, 'common').cap).toBe(5);
    expect(cost(1, 'legend').cap).toBe(18);
    // コモン・コスト0：攻撃力アップ1（3pt）は作れる、エナジー+1（8pt）は作れない
    expect(analyzeCard(card({ cost: 0, effects: [fx({ id: 'attackUp', value: 1 })] })).valid).toBe(true);
    const over = analyzeCard(card({ cost: 0, effects: [fx({ id: 'energy', value: 1, target: 'self' })] }));
    expect(over.points.remaining).toBe(3 - 8);
    expect(over.violations.map((v) => v.code)).toEqual(['POINTS_OVER_CAP']);
    expect(over.violations[0]!.message).toBe('合計ポイントが上限を5pt超えています（8 / 3）');
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
});

describe('複製のコピーが残る版', () => {
  it('残らない版は12pt、残る版は15pt', () => {
    const v = (option?: string) =>
      analyzeCard(card({ rarity: 'epic', cost: 1, effects: [fx({ id: 'duplicate', target: 'self', option })] })).points.lines[0]!.value;
    expect(v()).toBe(12);
    expect(v('temp')).toBe(12);
    expect(v('keep')).toBe(15);
  });
});
