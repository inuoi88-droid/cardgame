// ルール違反で作成できないケース
import { describe, expect, it } from 'vitest';
import { analyzeCard, type CardDef, type EffectInstance } from '../src/engine/index.ts';
import { EXAMPLES, card, codes } from './helpers.ts';

const fx = (e: Partial<EffectInstance> & { id: string }): EffectInstance => ({
  timing: 'play',
  target: 'chosen',
  condition: null,
  ...e,
});

function expectViolation(c: CardDef, code: string) {
  const a = analyzeCard(c);
  expect(a.valid).toBe(false);
  expect(codes(a.violations)).toContain(code);
  // 理由は日本語の文で返る
  expect(a.violations.find((v) => v.code === code)!.message.length).toBeGreaterThan(0);
  return a;
}

describe('ポイント', () => {
  it('上限を超えると作れない（コモンでダメージ3＋やけど＝8pt）', () => {
    const a = expectViolation(
      { ...EXAMPLES.hinoko, effects: [fx({ id: 'damage', value: 3 }), fx({ id: 'burn', value: 0 })] },
      'POINTS_OVER_CAP',
    );
    expect(a.points.total).toBe(8);
    expect(a.points.remaining).toBe(-3);
    expect(a.violations[0]!.message).toBe('合計ポイントが上限を3pt超えています（8 / 5）');
  });

  it('呪いカードは、デメリットの合計がレアリティ上限以上でないと作れない', () => {
    // コモン（上限5）に自傷2（1.5×2＝3pt）だけ
    expectViolation(
      card({ effects: [fx({ id: 'damage', value: 3 })], drawbacks: [{ id: 'selfDamage', value: 2, timing: 'play' }] }),
      'CURSE_TOO_WEAK',
    );
  });

  it('呪いカードでも合計ポイントは上限以下でないと作れない', () => {
    // レジェンド：筋力5（40）＋筋力…ではなくダメージ20（40）を足して 80−10−18＝52 > 18
    expectViolation(
      { ...EXAMPLES.kyosenshi, effects: [...EXAMPLES.kyosenshi.effects, fx({ id: 'damage', value: 20 })] },
      'POINTS_OVER_CAP',
    );
  });
});

describe('安全装置', () => {
  // 決定事項 #66：コモン3つ・レア以上4つ（仕様の「コモン2つ・それ以外3つ」から1つずつ増やした）
  const ones = (n: number) => Array.from({ length: n }, () => fx({ id: 'damage', value: 1 }));

  it('コモンの効果は3つまで', () => {
    expect(analyzeCard(card({ cost: 1, effects: ones(3) })).valid).toBe(true);
    expectViolation(card({ cost: 2, effects: ones(4) }), 'EFFECT_TOO_MANY');
  });

  it('レア以上の効果は4つまで', () => {
    expect(analyzeCard(card({ rarity: 'rare', cost: 1, effects: ones(4) })).valid).toBe(true);
    expectViolation(card({ rarity: 'rare', cost: 2, effects: ones(5) }), 'EFFECT_TOO_MANY');
  });

  it('キーワード・デメリット・防御無視は効果の数に含めない', () => {
    const c = card({
      rarity: 'legend',
      cost: 3,
      stats: { attack: 1, hp: 1, defense: 0 },
      keywords: [{ id: 'taunt' }],
      effects: [
        fx({ id: 'damage', value: 1, timing: 'summon', mods: ['pierce', 'drain'] }),
        fx({ id: 'shield', value: 1, timing: 'summon', target: 'self' }),
        fx({ id: 'multiHit', value: 1, hits: 2, timing: 'summon', mods: ['pierce'] }),
      ],
      drawbacks: [{ id: 'upkeep', timing: null }, { id: 'betrayal', timing: null }, { id: 'recoil', timing: 'summon' }],
    });
    expect(codes(analyzeCard(c).violations)).not.toContain('EFFECT_TOO_MANY');
  });

  it('守備力の上限は3', () => {
    expectViolation(card({ rarity: 'legend', cost: 3, stats: { attack: 0, hp: 1, defense: 4 } }), 'STAT_DEFENSE');
  });

  it('同じデメリットは1枚に1回まで', () => {
    expectViolation(
      {
        ...EXAMPLES.kyosenshi,
        drawbacks: [
          { id: 'selfDamage', value: 4, timing: 'turnStart' },
          { id: 'selfDamage', value: 1, timing: 'play' },
        ],
      },
      'DRAWBACK_DUPLICATE',
    );
  });

  it('同じキーワードは1回まで', () => {
    expectViolation(
      card({ rarity: 'legend', cost: 3, stats: { attack: 1, hp: 1, defense: 0 }, keywords: [{ id: 'taunt' }, { id: 'taunt' }] }),
      'KEYWORD_DUPLICATE',
    );
  });
});

describe('レアリティ限定の効果', () => {
  it('蘇生はレアでは使えない（エピック以上）', () => {
    expectViolation(card({ rarity: 'rare', cost: 2, effects: [fx({ id: 'revive', value: 1, target: 'self' })] }), 'EFFECT_RARITY');
    expect(analyzeCard(card({ rarity: 'epic', cost: 2, effects: [fx({ id: 'revive', value: 1, target: 'self' })] })).valid).toBe(true);
  });

  it('全体破壊はエピックでは使えない（レジェンドのみ）', () => {
    expectViolation(card({ rarity: 'epic', cost: 2, effects: [fx({ id: 'wipe', target: 'board' })] }), 'EFFECT_RARITY');
    expect(analyzeCard(card({ rarity: 'legend', cost: 1, effects: [fx({ id: 'wipe', target: 'board' })] })).valid).toBe(true);
  });
});

describe('カードの種類に応じた制限', () => {
  it('キーワードはモンスター専用', () => {
    expectViolation({ ...EXAMPLES.hinoko, keywords: [{ id: 'taunt' }] }, 'KEYWORD_NOT_MONSTER');
  });

  it('「攻撃するたび」はモンスター以外では使えない', () => {
    expectViolation(card({ effects: [fx({ id: 'poison', value: 1, timing: 'attack' })] }), 'EFFECT_TIMING');
  });

  it('「カードを使うたび」「使用時」はモンスターでは使えない', () => {
    const monster = { ...EXAMPLES.dokugaNezumi };
    expectViolation({ ...monster, effects: [fx({ id: 'draw', value: 1, timing: 'cardPlayed', target: 'self' })] }, 'EFFECT_TIMING');
    expectViolation({ ...monster, effects: [fx({ id: 'draw', value: 1, timing: 'play', target: 'self' })] }, 'EFFECT_TIMING');
  });

  it('維持費・裏切りはモンスター専用', () => {
    expectViolation({ ...EXAMPLES.kyosenshi, drawbacks: [...EXAMPLES.kyosenshi.drawbacks, { id: 'upkeep', timing: null }] }, 'DRAWBACK_MONSTER_ONLY');
  });

  it('倍率込み固定値のデメリットはタイミングを選べない', () => {
    expectViolation(
      { ...EXAMPLES.dokugaNezumi, rarity: 'common', drawbacks: [{ id: 'parasite', timing: 'summon' }] },
      'DRAWBACK_TIMING',
    );
  });

  it('モンスター以外は効果が1つ以上必要（デメリットだけのカードは不可）', () => {
    expectViolation(card({ cost: 0, drawbacks: [{ id: 'parasite', timing: null }] }), 'EFFECT_REQUIRED');
  });
});

describe('対象と条件', () => {
  it('回復の対象は自分だけ', () => {
    expectViolation(card({ cost: 2, effects: [fx({ id: 'heal', value: 1, target: 'enemyAll' })] }), 'EFFECT_TARGET');
  });

  it('自動で発動するタイミングでは「選んだ1体」を選べない', () => {
    expectViolation(card({ rarity: 'legend', cost: 1, effects: [fx({ id: 'damage', value: 1, timing: 'turnStart', target: 'chosen' })] }), 'EFFECT_TARGET');
    // 代わりに相手プレイヤー（×1.0）
    expect(
      analyzeCard(card({ rarity: 'legend', cost: 1, effects: [fx({ id: 'damage', value: 1, timing: 'turnStart', target: 'enemyPlayer' })] })).valid,
    ).toBe(true);
  });

  it('バウンスは相手全体を選べない（1体限定）', () => {
    expectViolation(card({ rarity: 'epic', cost: 1, effects: [fx({ id: 'bounce', target: 'enemyMonsters' })] }), 'EFFECT_TARGET');
  });

  it('条件「このターン3枚目以降」はターン開始時には付けられない', () => {
    expectViolation(
      card({ rarity: 'legend', cost: 1, effects: [fx({ id: 'draw', value: 1, timing: 'turnStart', target: 'self', condition: 'nthCard' })] }),
      'EFFECT_CONDITION',
    );
  });

  it('防御無視・吸収はダメージと連撃にしか付けられない', () => {
    expectViolation(card({ cost: 1, effects: [fx({ id: 'poison', value: 1, mods: ['pierce'] })] }), 'EFFECT_MODS');
  });
});

describe('入力値', () => {
  it('カード名が空', () => {
    expectViolation({ ...EXAMPLES.hinoko, name: '  ' }, 'NAME_EMPTY');
  });

  it('カード名が長すぎる', () => {
    expectViolation({ ...EXAMPLES.hinoko, name: 'あ'.repeat(17) }, 'NAME_TOO_LONG');
  });

  it('コストは0〜5', () => {
    expectViolation({ ...EXAMPLES.hinoko, cost: 6 }, 'COST_RANGE');
    expectViolation({ ...EXAMPLES.hinoko, cost: -1 }, 'COST_RANGE');
    expectViolation({ ...EXAMPLES.hinoko, cost: 1.5 }, 'COST_RANGE');
  });

  it('モンスターの体力は1以上、攻撃力は0以上', () => {
    expectViolation({ ...EXAMPLES.dokugaNezumi, stats: { attack: 1, hp: 0, defense: 0 } }, 'STAT_HP');
    expectViolation({ ...EXAMPLES.dokugaNezumi, stats: { attack: -1, hp: 2, defense: 0 } }, 'STAT_ATTACK');
    // 攻撃力0の壁は作れる
    expect(analyzeCard({ ...EXAMPLES.dokugaNezumi, effects: [], stats: { attack: 0, hp: 5, defense: 0 } }).valid).toBe(true);
  });

  it('効果の数値が範囲外', () => {
    expectViolation(card({ cost: 1, effects: [fx({ id: 'damage', value: 0 })] }), 'EFFECT_VALUE');
    expectViolation(card({ rarity: 'legend', cost: 2, effects: [fx({ id: 'energy', value: 31, target: 'self' })] }), 'EFFECT_VALUE');
    expectViolation(card({ rarity: 'rare', cost: 1, effects: [fx({ id: 'multiHit', value: 1, hits: 1 })] }), 'EFFECT_HITS');
  });

  it('不明な効果', () => {
    expectViolation(card({ effects: [fx({ id: 'nonexistent' })] }), 'EFFECT_UNKNOWN');
  });

  it('サーチの種類が正しくない（未指定なら初期値のモンスター）', () => {
    expectViolation(card({ rarity: 'rare', cost: 1, effects: [fx({ id: 'search', target: 'self', option: 'dragon' })] }), 'EFFECT_OPTION');
    expect(analyzeCard(card({ rarity: 'rare', cost: 1, effects: [fx({ id: 'search', target: 'self' })] })).valid).toBe(true);
  });
});
