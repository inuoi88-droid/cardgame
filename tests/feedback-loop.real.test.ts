// プレイヤーの報告から見つかったループ・OTK を実際の倍率（20）で固定する（決定事項 #133）
import { describe, expect, it } from 'vitest';
import { BALANCE, analyzeCard, battle, fromBaseScale, type CardDef } from '../src/engine/index.ts';
import { card } from './helpers.ts';

const filler = fromBaseScale(card({ id: 'f', name: '薬', effects: [{ id: 'heal', value: 1, timing: 'play', target: 'self', condition: null }] }));
const setup = (name: string): battle.PlayerSetup => ({ name, deck: { v: 1, id: 'd', name: 'd', entries: [{ cardId: 'f', count: 30 }] }, cards: [filler] });

function started(): battle.GameState {
  const r = battle.createGame({ seed: 1, first: 0, players: [setup('P0'), setup('P1')] });
  if (!r.ok) throw new Error(r.error);
  let g = r.state;
  for (const p of [0, 1] as const) {
    const n = battle.applyAction(g, { type: 'mulligan', player: p, mode: 'keep' });
    if (!n.ok) throw new Error(n.error);
    g = n.state;
  }
  return g;
}

function act(g: battle.GameState, a: battle.Action): battle.GameState {
  const r = battle.applyAction(g, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/** 報告 #3 のカード（倍率20のまま）：コスト0・相手が毒なら毒60と同じコストのサーチ・循環 */
const fuel: CardDef = card({
  id: 'fuel',
  name: '毒燃料',
  rarity: 'epic',
  cost: 0,
  scale: 20,
  effects: [
    { id: 'poison', value: 60, target: 'chosen', timing: 'play', condition: 'enemyPoisoned' },
    { id: 'search', option: 'sameCost', target: 'self', timing: 'play', condition: 'enemyPoisoned' },
  ],
  abilities: [{ id: 'shuffleBack' }],
});

describe('報告 #3：コスト0の循環＋同じコストのサーチのループ（実際の倍率）', () => {
  it('循環で山札に戻るのは同じ1枚につき1ターン1回。2枚なら1ターンに4回までで止まる', () => {
    let g = started();
    g.cards['p0:fuel'] = fuel;
    const ps = g.players[0];
    ps.hand.push({ uid: 'A', cardId: 'p0:fuel', owner: 0 });
    ps.deck.splice(3, 0, { uid: 'B', cardId: 'p0:fuel', owner: 0 });
    g.players[1].status.poison = 20;
    const before = g.players[1].status.poison;
    let plays = 0;
    for (let i = 0; i < 20; i++) {
      const inHand = g.players[0].hand.find((c) => c.cardId === 'p0:fuel');
      if (!inHand) break;
      g = act(g, { type: 'playCard', player: 0, cardUid: inHand.uid, chosen: { enemy: { kind: 'player', player: 1 } } });
      plays++;
      const pick = g.pending?.options?.[0]?.id;
      if (g.pending) g = act(g, { type: 'choose', player: 0, picks: pick ? [pick] : [] });
    }
    expect(plays).toBe(4);
    // 2回目に使った分は捨て札へ（山札には戻らない）
    expect(g.players[0].discard.filter((c) => c.cardId === 'p0:fuel').map((c) => c.uid).sort()).toEqual(['A', 'B']);
    expect(g.players[1].status.poison).toBeGreaterThan(before);
  });

  it('次のターンにはまた循環で山札に戻る（1ターン1回）', () => {
    let g = started();
    g.cards['p0:fuel'] = fuel;
    g.players[0].hand.push({ uid: 'A', cardId: 'p0:fuel', owner: 0 });
    g.players[1].status.poison = 20;
    g = act(g, { type: 'playCard', player: 0, cardUid: 'A', chosen: { enemy: { kind: 'player', player: 1 } } });
    if (g.pending) g = act(g, { type: 'choose', player: 0, picks: [] });
    expect(g.players[0].deck.some((c) => c.uid === 'A')).toBe(true);
    g = act(g, { type: 'endTurn', player: 0 });
    g = act(g, { type: 'endTurn', player: 1 });
    // 引いていなければ手札に入れて、もう一度使う
    const ps = g.players[0];
    const i = ps.deck.findIndex((c) => c.uid === 'A');
    if (i >= 0) ps.hand.push(...ps.deck.splice(i, 1));
    g.players[1].status.poison = Math.max(20, g.players[1].status.poison);
    g = act(g, { type: 'playCard', player: 0, cardUid: 'A', chosen: { enemy: { kind: 'player', player: 1 } } });
    if (g.pending) g = act(g, { type: 'choose', player: 0, picks: [] });
    expect(g.players[0].deck.some((c) => c.uid === 'A')).toBe(true);
    expect(g.players[0].discard.some((c) => c.uid === 'A')).toBe(false);
  });
});

/** 報告 #4 から：コスト1・召喚時エナジー+1・一撃離脱・速攻（エピックなら攻撃力40まで作れる）。出す→殴る→手札に戻る がエナジー0で回る */
const shuttle: CardDef = card({
  id: 'shuttle',
  name: '往復の精',
  rarity: 'epic',
  cost: 1,
  scale: 20,
  stats: { hp: 20, attack: 40, defense: 0 },
  effects: [{ id: 'energy', value: 1, target: 'self', timing: 'summon', condition: null }],
  keywords: [{ id: 'hitAndRun' }, { id: 'haste' }],
});

describe('報告 #4：一撃離脱＋召喚時のエナジーで、出して殴って戻すを繰り返す（実際の倍率）', () => {
  it('無限には回らない：増やせるエナジーは1ターン battle.maxEnergyGainPerTurn まで（エナジー1から 1＋3 回で止まる）', () => {
    let g = started();
    g.cards['p0:shuttle'] = shuttle;
    g.players[0].hand.push({ uid: 'S', cardId: 'p0:shuttle', owner: 0 });
    g.players[0].energy = 1;
    const hp = g.players[1].hp;
    let plays = 0;
    for (let i = 0; i < 10; i++) {
      if (!g.players[0].hand.some((c) => c.uid === 'S') || g.players[0].energy < 1) break;
      g = act(g, { type: 'playCard', player: 0, cardUid: 'S' });
      plays++;
      const m = g.players[0].board.find((x) => x.card.uid === 'S')!;
      g = act(g, { type: 'attack', player: 0, attackerUid: m.uid, target: { kind: 'player', player: 1 } });
    }
    expect(plays).toBe(1 + BALANCE.battle.maxEnergyGainPerTurn);
    expect(g.players[1].hp).toBe(hp - plays * 40);
  });
});

describe('報告 #4・#5：親和でコスト1まで下がり、召喚時のエナジー+1で差し引き0になる（実際の倍率）', () => {
  const spark: CardDef = card({
    id: 'spark',
    name: '火花聖霊',
    rarity: 'epic',
    cost: 3,
    scale: 20,
    stats: { hp: 40, attack: 0, defense: 0 },
    effects: [
      { id: 'energy', value: 1, target: 'self', timing: 'summon', condition: 'hasMonster' },
      { id: 'pump', value: 160, target: 'allyMonsters', timing: 'summon', condition: 'hasMonster' },
    ],
    keywords: [{ id: 'hitAndRun' }, { id: 'haste' }, { id: 'doubleAttack' }, { id: 'flying' }],
    abilities: [{ id: 'affinity', option: 'monsters' }],
  });
  const puppet: CardDef = card({ id: 'puppet', name: '傀儡', cost: 0, scale: 20, stats: { hp: 1, attack: 0, defense: 0 }, keywords: [{ id: 'haste' }] });

  it('親和で下がるのはコスト2まで（場にモンスターが何体いても）。報告のカードは今も作れる', () => {
    let g = started();
    g.cards['p0:spark'] = spark;
    g.cards['p0:puppet'] = puppet;
    g.players[0].energy = 10;
    for (const uid of ['p1', 'p2', 'p3']) {
      g.players[0].hand.push({ uid, cardId: 'p0:puppet', owner: 0 });
      g = act(g, { type: 'playCard', player: 0, cardUid: uid });
    }
    g.players[0].hand.push({ uid: 'SP', cardId: 'p0:spark', owner: 0 });
    const sp = g.players[0].hand.find((c) => c.uid === 'SP')!;
    expect(analyzeCard(spark).violations).toEqual([]);
    expect(BALANCE.abilities.affinity.minCost).toBe(2);
    expect(battle.effectiveCost(g, 0, sp)).toBe(2);
    // 出すたびにエナジーが差し引き1減る（無料では回らない）
    const before = g.players[0].energy;
    g = act(g, { type: 'playCard', player: 0, cardUid: 'SP' });
    expect(g.players[0].energy).toBe(before - 2 + 1);
  });

  it('報告 #5 の場面：場にモンスターが6体いても、親和のヒドラの咆哮（コスト3）はコスト2。エナジー2では1枚しか使えない', () => {
    const hydra: CardDef = card({
      id: 'hydra',
      name: 'ヒドラの咆哮',
      rarity: 'epic',
      cost: 3,
      scale: 20,
      effects: [{ id: 'train', mods: ['gamble'], value: 200, target: 'allyMonsters', timing: 'play', condition: 'enemyPoisonBurn' }],
      abilities: [{ id: 'affinity', option: 'monsters' }],
    });
    let g = started();
    g.cards['p0:hydra'] = hydra;
    g.cards['p0:puppet'] = puppet;
    g.players[0].energy = 10;
    for (const uid of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) {
      g.players[0].hand.push({ uid, cardId: 'p0:puppet', owner: 0 });
      g = act(g, { type: 'playCard', player: 0, cardUid: uid });
    }
    g.players[0].hand.push({ uid: 'H1', cardId: 'p0:hydra', owner: 0 }, { uid: 'H2', cardId: 'p0:hydra', owner: 0 });
    g.players[0].energy = 2;
    expect(battle.effectiveCost(g, 0, g.players[0].hand.find((c) => c.uid === 'H1')!)).toBe(2);
    g = act(g, { type: 'playCard', player: 0, cardUid: 'H1' });
    expect(g.players[0].energy).toBe(0);
    expect(battle.applyAction(g, { type: 'playCard', player: 0, cardUid: 'H2' }).ok).toBe(false);
  });
});

describe('数値1が倍率の大きさ（20・10）に引き上げられない（実際の倍率。ユーザーの指摘・決定事項 #135）', () => {
  const spell = (id: string, effects: CardDef['effects']): CardDef => card({ id, name: id, cost: 0, scale: 20, effects });

  it('脱力（#138）：150×2 の連撃は 100×2。やけどなら 3分の2 の 100×2（#139）', () => {
    let g = started();
    g.cards['p0:multi2'] = spell('multi2', [{ id: 'multiHit', value: 150, hits: 2, target: 'chosen', timing: 'play', condition: null }]);
    g.players[0].hand.push({ uid: 'W', cardId: 'p0:multi2', owner: 0 }, { uid: 'X', cardId: 'p0:multi2', owner: 0 });
    g.players[0].energy = 20;
    g.players[0].status.weak = 1;
    let hp = g.players[1].hp;
    g = act(g, { type: 'playCard', player: 0, cardUid: 'W', chosen: { enemy: { kind: 'player', player: 1 } } });
    expect(BALANCE.battle.exhaustCap).toBe(100);
    expect(g.players[1].hp).toBe(Math.max(0, hp - 200));
    expect(g.players[0].status.weak).toBe(0);
    g.players[1].hp = 1000;
    g.players[0].status.burn = 1;
    hp = g.players[1].hp;
    g = act(g, { type: 'playCard', player: 0, cardUid: 'X', chosen: { enemy: { kind: 'player', player: 1 } } });
    expect(g.players[1].hp).toBe(hp - 200);
  });

  it('ダメージ1の連撃×5 は合計5（以前は1発ごとに最低20に上がって100）', () => {
    let g = started();
    g.cards['p0:multi'] = spell('multi', [{ id: 'multiHit', value: 1, hits: 5, target: 'chosen', timing: 'play', condition: null }]);
    g.players[0].hand.push({ uid: 'M', cardId: 'p0:multi', owner: 0 });
    const hp = g.players[1].hp;
    g = act(g, { type: 'playCard', player: 0, cardUid: 'M', chosen: { enemy: { kind: 'player', player: 1 } } });
    expect(g.players[1].hp).toBe(hp - 5);
  });

  it('守備力のあるモンスターへの最低ダメージは、元のダメージを超えない（20 以上の攻撃は今までどおり最低20）', () => {
    let g = started();
    // 相手の番に守備力40の壁を出してもらう
    g = act(g, { type: 'endTurn', player: 0 });
    g.cards['p1:wall'] = card({ id: 'wall', name: '壁', rarity: 'rare', cost: 0, scale: 20, stats: { attack: 0, hp: 200, defense: 40 } });
    g.players[1].hand.push({ uid: 'W', cardId: 'p1:wall', owner: 1 });
    g = act(g, { type: 'playCard', player: 1, cardUid: 'W' });
    g = act(g, { type: 'endTurn', player: 1 });
    g.cards['p0:poke'] = spell('poke', [{ id: 'damage', value: 1, target: 'chosen', timing: 'play', condition: null }]);
    g.cards['p0:bolt'] = spell('bolt', [{ id: 'damage', value: 20, target: 'chosen', timing: 'play', condition: null }]);
    g.players[0].hand.push({ uid: 'P', cardId: 'p0:poke', owner: 0 }, { uid: 'B', cardId: 'p0:bolt', owner: 0 });
    g = act(g, { type: 'playCard', player: 0, cardUid: 'P', chosen: { enemy: { kind: 'monster', uid: 'W' } } });
    expect(g.players[1].board.find((m) => m.uid === 'W')!.hp).toBe(199);
    g = act(g, { type: 'playCard', player: 0, cardUid: 'B', chosen: { enemy: { kind: 'monster', uid: 'W' } } });
    expect(g.players[1].board.find((m) => m.uid === 'W')!.hp).toBe(199 - BALANCE.battle.minMonsterDamage);
  });

  it('ばらつきの付いた数値1は、どの倍率でも1（以前は最低の刻み10に上がった）', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      let g = started();
      g.rng = seed;
      g.cards['p0:g'] = spell('g', [{ id: 'damage', value: 1, mods: ['gamble'], target: 'chosen', timing: 'play', condition: null }]);
      g.players[0].hand.push({ uid: 'G', cardId: 'p0:g', owner: 0 });
      const hp = g.players[1].hp;
      g = act(g, { type: 'playCard', player: 0, cardUid: 'G', chosen: { enemy: { kind: 'player', player: 1 } } });
      expect(hp - g.players[1].hp).toBeLessThanOrEqual(1);
    }
  });

  it('試作で出した体力1のモンスターは体力1のまま（以前は最低の刻み10に上がった）', () => {
    let g = started();
    g.cards['p0:tiny'] = card({ id: 'tiny', name: '小', rarity: 'rare', cost: 2, scale: 20, stats: { attack: 40, hp: 1, defense: 0 }, abilities: [{ id: 'prototype', value: 1 }] });
    g.players[0].hand.push({ uid: 'T', cardId: 'p0:tiny', owner: 0 });
    g.players[0].energy = 5;
    g = act(g, { type: 'playCard', player: 0, cardUid: 'T', alt: 'prototype' });
    const m = g.players[0].board.find((x) => x.card.uid === 'T')!;
    expect(m.hp).toBe(1);
    expect(m.attack).toBe(20);
  });
});
