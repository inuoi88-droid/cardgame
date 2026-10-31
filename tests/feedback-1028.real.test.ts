// プレイヤーの報告（2026-10-28 受付 #15〜#18）から直した不具合を実際の倍率で固定する
import { describe, expect, it } from 'vitest';
import { BALANCE, analyzeCard, battle, type CardDef } from '../src/engine/index.ts';
import { act, giveCard, rich, startGame, P } from './battle/helpers.ts';

/** 報告 #15 の形：ダメージを受けたときに「全員」へ連撃・自分を回復。召喚時にも全員へ連撃 */
const echo = {
  v: 1, id: 'echo', cost: 3, icon: 'gi:small-fire', name: 'こだま', scale: 20, rarity: 'legend',
  // 守備力0（守備力があると1ダメージの連撃は0になり、連鎖が起きない：決定事項 #148）
  stats: { hp: 20, attack: 0, defense: 0 },
  effects: [
    { id: 'train', value: 200, target: 'random', timing: 'damaged', condition: 'loneMonster' },
    { id: 'heal', value: 20, target: 'self', timing: 'damaged', condition: 'loneMonster' },
    { id: 'multiHit', hits: 5, value: 1, target: 'everyone', timing: 'summon', condition: 'loneMonster' },
    { id: 'multiHit', hits: 5, value: 1, target: 'everyone', timing: 'damaged', condition: 'loneMonster' },
  ],
  keywords: [{ id: 'haste' }],
  abilities: [{ id: 'costCut', value: 1, condition: 'notFirstCard' }],
  drawbacks: [],
} as unknown as CardDef;

describe('報告 #15：ダメージを受けたときの効果で自分を傷つける連鎖が止まる', () => {
  it('「ダメージを受けたとき」は1体につき1ターン maxRepeatTriggersPerTurn 回まで。相手は倒れず、処理の打ち切りも起きない', () => {
    let g = startGame();
    rich(g, 0);
    const uid = giveCard(g, 0, echo);
    const hp = g.players[1].hp;
    g = act(g, { type: 'playCard', player: 0, cardUid: uid, chosen: {} });
    expect(g.result).toBeNull();
    expect(g.log.some((e) => e.text.includes('処理が多すぎる'))).toBe(false);
    const fired = g.log.filter((e) => e.text.includes('ダメージを受けたとき') && e.text.includes('もう発動しない')).length;
    expect(fired).toBe(1);
    // 召喚時の5発＋連鎖2回ぶんの5発ずつ（1発1ダメージ）。相手の HP はほとんど減らない
    expect(hp - g.players[1].hp).toBeLessThanOrEqual(15);
  });
});

describe('報告 #16：ノイズ投入の枚数は1ターンに受け取れる上限まで', () => {
  const noise = (value: number) =>
    ({
      v: 1, id: 'nz', cost: 1, icon: 'gi:small-fire', name: 'ざつおん', scale: 20, rarity: 'common', stats: null,
      effects: [{ id: 'noise', value, target: 'enemyPlayer', timing: 'play', condition: null }],
      keywords: [], drawbacks: [],
    }) as unknown as CardDef;
  it('上限（maxNoiseReceivedPerTurn）までは作れ、超えるとルール違反', () => {
    const max = BALANCE.battle.maxNoiseReceivedPerTurn;
    expect(analyzeCard(noise(max)).violations).toEqual([]);
    expect(analyzeCard(noise(max + 1)).violations.length).toBeGreaterThan(0);
  });
});

/** 報告 #18 の形：コスト1・疾走・一撃離脱・召喚時に軽減 */
const loop = {
  v: 1, id: 'loop', cost: 1, icon: 'gi:small-fire', name: 'くりかえし', scale: 20, rarity: 'common',
  stats: { hp: 1, attack: 20, defense: 0 },
  effects: [{ id: 'discount', target: 'self', timing: 'summon', condition: null }],
  keywords: [{ id: 'haste' }, { id: 'hitAndRun' }],
  drawbacks: [],
} as unknown as CardDef;

describe('報告 #18：軽減と一撃離脱で出し直すループが止まる', () => {
  it('軽減はエナジーの増加と合わせて1ターン maxEnergyGainPerTurn まで。エナジー1なら 1＋上限 回で止まる', () => {
    let g = startGame();
    rich(g, 0, 1);
    const uid = giveCard(g, 0, loop);
    let plays = 0;
    for (let i = 0; i < 30; i++) {
      const r = battle.applyAction(g, { type: 'playCard', player: 0, cardUid: uid, chosen: {} });
      if (!r.ok) break;
      g = r.state;
      plays += 1;
      const m = g.players[0].board.find((x) => x.card.uid === uid);
      if (!m) break;
      g = act(g, { type: 'attack', player: 0, attackerUid: m.uid, target: P(1) });
      if (!g.players[0].hand.some((c) => c.uid === uid)) break;
    }
    expect(plays).toBe(1 + BALANCE.battle.maxEnergyGainPerTurn);
  });
});

/** 報告 #17 の形：試作・条件付き軽減・一撃離脱、召喚時に複写・軽減（3体以上）・エナジー・他の味方の一時強化 */
const benkei = {
  v: 1, id: 'benkei', cost: 4, icon: 'gi:troll', name: 'べんけい', scale: 20, rarity: 'legend',
  stats: { hp: 1, attack: 0, defense: 0 },
  effects: [
    { id: 'offspring', target: 'self', timing: 'summon', condition: null },
    { id: 'discount', target: 'self', timing: 'summon', condition: 'manyMonsters' },
    { id: 'energy', value: 1, target: 'self', timing: 'summon', condition: null },
    { id: 'pump', value: 60, target: 'otherAllies', timing: 'summon', condition: null },
  ],
  keywords: [{ id: 'hitAndRun' }, { id: 'haste' }, { id: 'flying' }, { id: 'doubleAttack' }],
  abilities: [{ id: 'prototype', value: 2 }, { id: 'costCut', value: 1, condition: 'notFirstCard' }],
  drawbacks: [],
} as unknown as CardDef;

describe('報告 #17：試作と一撃離脱で出し直し、複写に一時強化を積み上げる1ターンキルが止まる', () => {
  it('記録と同じ流れ（先に2枚目以降にしてエナジー+2）で出し直しても3回まで。1ターンでは倒れない', () => {
    let g = startGame();
    const ps = g.players[0];
    // 記録では1枚目の「さーち」でエナジー2を使って2を得た（エナジーの増加は1ターン+2まで使った状態）
    ps.energy = 2;
    ps.turn.cardsPlayed = 1;
    ps.limits = { turnIndex: g.turnIndex, drawn: 0, energyGained: 2, noiseIn: 0 };
    const uid = giveCard(g, 0, benkei);
    let plays = 0;
    for (let i = 0; i < 30; i++) {
      const r = battle.applyAction(g, { type: 'playCard', player: 0, cardUid: uid, chosen: {}, alt: 'prototype' });
      if (!r.ok) break;
      g = r.state;
      plays += 1;
      const m = g.players[0].board.find((x) => x.card.uid === uid);
      if (!m) break;
      g = act(g, { type: 'attack', player: 0, attackerUid: m.uid, target: P(1) });
      if (!g.players[0].hand.some((c) => c.uid === uid)) break;
    }
    for (const m of [...g.players[0].board]) {
      for (let k = 0; k < 2 && !g.result; k++) {
        const r = battle.applyAction(g, { type: 'attack', player: 0, attackerUid: m.uid, target: P(1) });
        if (r.ok) g = r.state;
      }
    }
    expect(plays).toBeLessThanOrEqual(3);
    expect(g.result).toBeNull();
    // 直す前は軽減がたまり続けて5回出し直し、2400 を削り切った。今は3回で、出したコピーで殴り切っても3分の1より多く残る
    expect(g.players[1].hp).toBeGreaterThan(g.players[1].maxHp / 3);
  });
});

describe('報告 #17：試作・条件付き軽減の値段（ユーザー回答）', () => {
  it('試作は「下がるコストの価値 − 半分で失う攻撃力・体力の価値」以上。攻撃力・体力の低いモンスターでは高くなる', () => {
    const line = (c: CardDef) => analyzeCard(c).points.lines.find((l) => l.kind === 'ability' && l.label.startsWith('能力 試作'))!.value;
    const C = BALANCE.card.costPoints;
    // 体力1・攻撃力0：失うものが無いので、コスト4→2 の差（900−400）そのまま
    expect(line(benkei)).toBe(C[4]! - C[2]!);
    expect(analyzeCard(benkei).violations.map((v) => v.code)).toContain('POINTS_OVER_CAP');
    // 攻撃力・体力の高いモンスターは、失う分だけ安い（下限は perCost×K）
    const big = { ...benkei, rarity: 'legend', stats: { hp: 400, attack: 400, defense: 0 }, effects: [], keywords: [] } as unknown as CardDef;
    expect(line(big)).toBe(BALANCE.abilities.prototype.perCost * 2);
  });
  it('条件付き軽減は1段 x(13)×条件の倍率', () => {
    expect(BALANCE.abilities.costCut.perStep).toBe(13 * 20);
  });
});

describe('報告 #19：攻撃力0の疾走・二回攻撃と全体の一時強化', () => {
  /** 報告の形：コスト0・攻撃力0・体力20、分身・疾走・二回攻撃 */
  const pack = {
    v: 1, id: 'pack', cost: 0, icon: 'gi:wolf-head', name: 'むれ', scale: 20, rarity: 'common', tribe: 'beast',
    stats: { hp: 20, attack: 0, defense: 0 }, effects: [],
    keywords: [{ id: 'doubleTeam' }, { id: 'haste' }, { id: 'doubleAttack' }], drawbacks: [],
  } as unknown as CardDef;
  it('キーワードの値段は攻撃力を最低 keywordMinAttack として数える。報告のコスト0の群れは作れない', () => {
    const kw = (id: string) => analyzeCard(pack).points.lines.find((l) => l.kind === 'keyword' && l.label === id)!.value;
    expect(BALANCE.stats.keywordMinAttack).toBe(20);
    expect(kw('疾走')).toBe(BALANCE.keywords.haste.flat + BALANCE.keywords.haste.perAttack * 20);
    expect(kw('二回攻撃')).toBe(BALANCE.keywords.doubleAttack.perAttack * 20);
    expect(analyzeCard(pack).violations.map((v) => v.code)).toContain('POINTS_OVER_CAP');
    // コスト1なら作れる（疾走・二回攻撃の群れそのものは残る）
    expect(analyzeCard({ ...pack, cost: 1 }).violations).toEqual([]);
  });
  it('一時強化は1体につき合計 tempAttackCap まで。効果の数値の上限も同じ', () => {
    let g = startGame();
    rich(g, 0);
    const pump = (value: number) =>
      ({
        v: 1, id: `pump${value}`, cost: 1, icon: 'gi:wolf-howl', name: 'ほえる', scale: 20, rarity: 'legend', stats: null,
        effects: [{ id: 'pump', value, target: 'allyMonsters', timing: 'play', condition: null }], keywords: [], drawbacks: [],
      }) as unknown as CardDef;
    const cap = BALANCE.battle.tempAttackCap;
    expect(cap).toBe(100);
    expect(BALANCE.effects.pump.maxValue).toBe(cap);
    expect(analyzeCard(pump(cap + 20)).violations.length).toBeGreaterThan(0);
    const body = { ...pack, cost: 1 } as CardDef;
    g = act(g, { type: 'playCard', player: 0, cardUid: giveCard(g, 0, body), chosen: {} });
    for (let i = 0; i < 3; i++) g = act(g, { type: 'playCard', player: 0, cardUid: giveCard(g, 0, pump(60)), chosen: {} });
    const m = g.players[0].board.find((x) => x.card.cardId.endsWith(':pack'))!;
    expect(m.tempAttack).toBe(cap);
    expect(g.log.some((e) => e.text.includes(`一時強化は1体+${cap}まで`))).toBe(true);
  });
});

describe('報告 #6：「相手が毒状態」の条件の割引を弱める（ユーザー回答）', () => {
  it('相手が毒状態 0.45→0.6→0.8・毒とやけど 0.35→0.45→0.6（#144・#146）。作成例「とどめの一撃」は11ダメージで作れる', () => {
    expect(BALANCE.condition.enemyPoisoned).toBe(0.8);
    expect(BALANCE.condition.enemyPoisonBurn).toBe(0.6);
  });
});
