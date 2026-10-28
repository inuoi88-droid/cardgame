// プレイヤーの報告 #4・#5（決定事項 #133）と #17・#19（決定事項 #144）の OTK を測る。CPU（つよい）同士で、席A のデッキが自分の1ターン目・2ターン目までに勝った回数。
// node scripts/sim/otk-feedback.mts [試合数] [デッキのキー…]   例：node scripts/sim/otk-feedback.mts 20 spark dragon loop1
// 変える前後を比べるときは、同じ試合数で回す（シードは固定）。AFF_MIN=2 で親和の下限だけ差し替えて試せる。
import { BALANCE, B0, buildDeck, playGame, type DeckSpec } from './lib.mts';
import type { CardDef } from '../../src/engine/index.ts';

if (process.env.AFF_MIN) (BALANCE.abilities.affinity as { minCost: number }).minCost = Number(process.env.AFF_MIN);
// TEMP_CAP=100 で一時強化の上限（1体あたり）だけ差し替えて試せる
if (process.env.TEMP_CAP) (BALANCE.battle as { tempAttackCap: number }).tempAttackCap = Number(process.env.TEMP_CAP);

const base = { v: 1 as const, icon: 'x', scale: 20, drawbacks: [] };
const def = (d: Omit<CardDef, 'v' | 'icon' | 'scale' | 'drawbacks'>): CardDef => ({ ...base, ...d }) as CardDef;

// 報告 #4 のカード（倍率20のまま。報告の定義どおり）
const searcher = def({ id: 'searcher', name: 'サーチャー', rarity: 'common', cost: 1, stats: { hp: 20, attack: 0, defense: 0 },
  effects: [{ id: 'search', mode: 1, option: 'monster', target: 'self', timing: 'summon', condition: null }, { id: 'recall', mode: 2, target: 'self', timing: 'summon', condition: null }],
  keywords: [{ id: 'haste' }, { id: 'doubleAttack' }, { id: 'flying' }] });
const spark = def({ id: 'spark', name: '火花聖霊', rarity: 'epic', cost: 3, stats: { hp: 40, attack: 0, defense: 0 },
  effects: [{ id: 'energy', value: 1, target: 'self', timing: 'summon', condition: 'hasMonster' }, { id: 'pump', value: 160, target: 'allyMonsters', timing: 'summon', condition: 'hasMonster' }],
  keywords: [{ id: 'hitAndRun' }, { id: 'haste' }, { id: 'doubleAttack' }, { id: 'flying' }], abilities: [{ id: 'affinity', option: 'monsters' }] });
const puppet = def({ id: 'puppet', name: '傀儡', rarity: 'common', cost: 0, stats: { hp: 1, attack: 0, defense: 0 }, effects: [],
  keywords: [{ id: 'haste' }, { id: 'doubleAttack' }, { id: 'trample' }] });

// 報告 #5 のカード（定義は報告どおり。デッキの枚数は記録に無いので、引いたカードから組み直した目安）
const salamander = def({ id: 'salamander', name: 'サラマンダー', rarity: 'common', cost: 0, tribe: 'beast', stats: { hp: 1, attack: 0, defense: 0 }, effects: [],
  keywords: [{ id: 'haste' }, { id: 'doubleAttack' }, { id: 'stealth' }, { id: 'doubleTeam' }], abilities: [{ id: 'jumpStart' }] });
const hydra = def({ id: 'hydra', name: 'ヒドラの咆哮', rarity: 'epic', cost: 3, tribe: 'dragon', stats: null,
  effects: [
    { id: 'double', mods: ['nextTurn'], option: 'poison', target: 'self', timing: 'play', condition: 'enemyPoisonBurn' },
    { id: 'train', mods: ['gamble'], value: 200, target: 'allyMonsters', timing: 'play', condition: 'enemyPoisonBurn' },
    { id: 'grantKeyword', option: 'haste', target: 'allyMonsters', timing: 'play', condition: 'enemyPoisonBurn' },
    { id: 'exileMill', value: 3, target: 'enemyPlayer', timing: 'play', condition: 'enemyPoisonBurn' },
  ], keywords: [], abilities: [{ id: 'affinity', option: 'monsters' }] });
const elder = def({ id: 'elder', name: '伝説の原種', rarity: 'common', cost: 3, tribe: 'dragon', stats: { hp: 80, attack: 100, defense: 0 },
  effects: [
    { id: 'discount', target: 'self', timing: 'summon', condition: 'enemyPoisonBurn' },
    { id: 'energy', value: 1, target: 'self', timing: 'summon', condition: 'enemyPoisonBurn' },
    { id: 'draw', value: 1, target: 'self', timing: 'summon', condition: 'enemyPoisonBurn' },
  ], keywords: [], abilities: [{ id: 'affinity', option: 'monsters' }] });
const dragon = def({ id: 'dragon', name: '竜', rarity: 'common', cost: 2, tribe: 'dragon', stats: { hp: 120, attack: 80, defense: 0 }, effects: [], keywords: [{ id: 'divineShield' }] });
const fireBreath = def({ id: 'fireb', name: 'ファイアーブレス', rarity: 'common', cost: 1, tribe: 'dragon', stats: null,
  effects: [{ id: 'burn', value: 0, target: 'chosen', timing: 'play', condition: null }, { id: 'damage', value: 20, target: 'enemyMonsters', timing: 'play', condition: null }], keywords: [] });
const poisonBreath = def({ id: 'poisonb', name: 'ポイズンブレス', rarity: 'common', cost: 1, tribe: 'dragon', stats: null,
  effects: [{ id: 'poison', mods: ['gamble'], value: 20, target: 'chosen', timing: 'play', condition: 'hasMonster' }, { id: 'poison', value: 20, target: 'enemyPlayer', timing: 'turnEnd', condition: 'enemyPoisoned' }], keywords: [] });
const director = def({ id: 'director', name: '竜研究所・所長', rarity: 'epic', cost: 1, tribe: 'human', stats: { hp: 1, attack: 0, defense: 0 },
  effects: [{ id: 'revive', value: 5, target: 'self', timing: 'destroyed', condition: 'enemyPoisonBurn' }], keywords: [{ id: 'taunt' }, { id: 'reach' }] });

// 1枚で回るループ：コスト1・召喚時エナジー+1・一撃離脱・速攻（エピックなら攻撃力40まで作れる）
const loopCard = def({ id: 'loop1', name: '往復の精', rarity: 'epic', cost: 1, stats: { hp: 20, attack: 40, defense: 0 },
  effects: [{ id: 'energy', value: 1, target: 'self', timing: 'summon', condition: null }], keywords: [{ id: 'hitAndRun' }, { id: 'haste' }] });

// 報告 #17 のカード（倍率20のまま）：試作・条件付き軽減・一撃離脱、召喚時に複写・軽減・エナジー・他の味方の一時強化
const scout = def({ id: 'scout', name: 'さーち', rarity: 'common', cost: 2, stats: null,
  effects: [
    { id: 'search', option: 'monster', target: 'self', timing: 'play', condition: null },
    { id: 'energy', value: 2, target: 'self', timing: 'play', condition: 'monsterInHand' },
    { id: 'seal', target: 'random', timing: 'play', condition: 'monsterInHand' },
  ], keywords: [] });
const benkei = def({ id: 'benkei', name: '弁慶', rarity: 'legend', cost: 4, stats: { hp: 1, attack: 0, defense: 0 },
  effects: [
    { id: 'offspring', target: 'self', timing: 'summon', condition: null },
    { id: 'discount', target: 'self', timing: 'summon', condition: 'manyMonsters' },
    { id: 'energy', value: 1, target: 'self', timing: 'summon', condition: null },
    { id: 'pump', value: 60, target: 'otherAllies', timing: 'summon', condition: null },
  ], keywords: [{ id: 'hitAndRun' }, { id: 'haste' }, { id: 'flying' }, { id: 'doubleAttack' }],
  abilities: [{ id: 'prototype', value: 2 }, { id: 'costCut', value: 1, condition: 'notFirstCard' }] });

// 報告 #19 のカード（倍率20のまま。デッキの枚数は記録に無いので、出てきたカードから組んだ目安）
const wolfRush = def({ id: 'wolfRush', name: '狼の猛襲', rarity: 'common', cost: 1, tribe: 'beast', stats: { hp: 1, attack: 0, defense: 0 },
  effects: [
    { id: 'token', hits: 3, value: 1, option: 'mobilize', target: 'self', timing: 'summon', condition: 'hasMonster' },
    { id: 'pump', value: 60, target: 'chosen', timing: 'summon', condition: 'manyMonsters' },
  ], keywords: [{ id: 'haste' }, { id: 'trample' }, { id: 'doubleAttack' }, { id: 'onslaught', value: 100 }] });
const wolfPack = def({ id: 'wolfPack', name: '狼の群れ', rarity: 'common', cost: 0, tribe: 'beast', stats: { hp: 20, attack: 0, defense: 0 }, effects: [],
  keywords: [{ id: 'doubleTeam' }, { id: 'haste' }, { id: 'doubleAttack' }] });
const howl = def({ id: 'howl', name: '雄たけび', rarity: 'common', cost: 1, tribe: 'beast', stats: null,
  effects: [{ id: 'pump', value: 160, target: 'allyMonsters', timing: 'play', condition: 'manyMonsters' }], keywords: [] });
const whiteWolf = def({ id: 'whiteWolf', name: '白狼', rarity: 'epic', cost: 1, tribe: 'beast', stats: { hp: 1, attack: 0, defense: 0 },
  effects: [
    { id: 'token', hits: 3, value: 1, option: 'mobilize', target: 'self', timing: 'summon', condition: 'manyMonsters' },
    { id: 'pump', value: 200, target: 'allyMonsters', timing: 'summon', condition: 'manyMonsters' },
  ], keywords: [{ id: 'haste' }, { id: 'trample' }, { id: 'doubleAttack' }] });
const werewolf = def({ id: 'werewolf', name: '狼男', rarity: 'rare', cost: 1, tribe: 'beast', stats: { hp: 20, attack: 0, defense: 0 },
  effects: [{ id: 'vulnerable', value: 1, target: 'chosen', timing: 'summon', condition: 'manyMonsters' }],
  keywords: [{ id: 'haste' }, { id: 'trample' }, { id: 'doubleAttack' }, { id: 'onslaught', value: 100 }] });
const sealAll = def({ id: 'sealAll', name: '封印', rarity: 'rare', cost: 1, stats: null,
  effects: [{ id: 'seal', target: 'enemyMonsters', timing: 'play', condition: null }, { id: 'finality', target: 'chosen', timing: 'play', condition: null }], keywords: [] });

// 報告 #19 の狼を、キーワードの値段の最低の攻撃力・一時強化の上限（決定事項 #144）のあとに作れる形で組み直したもの（同じ考えで予算いっぱい）
const wolfPackC1 = def({ id: 'wolfPackC1', name: '狼の群れ・改', rarity: 'common', cost: 1, tribe: 'beast', stats: { hp: 20, attack: 20, defense: 0 }, effects: [],
  keywords: [{ id: 'doubleTeam' }, { id: 'haste' }, { id: 'doubleAttack' }] });
const wolfPackC0 = def({ id: 'wolfPackC0', name: '子狼', rarity: 'common', cost: 0, tribe: 'beast', stats: { hp: 1, attack: 0, defense: 0 }, effects: [],
  keywords: [{ id: 'doubleTeam' }, { id: 'haste' }] });
const wolfRush2 = def({ id: 'wolfRush2', name: '狼の猛襲・改', rarity: 'common', cost: 1, tribe: 'beast', stats: { hp: 1, attack: 0, defense: 0 },
  effects: [
    { id: 'token', hits: 3, value: 1, option: 'mobilize', target: 'self', timing: 'summon', condition: 'hasMonster' },
    { id: 'pump', value: 60, target: 'chosen', timing: 'summon', condition: 'manyMonsters' },
  ], keywords: [{ id: 'haste' }, { id: 'doubleAttack' }, { id: 'onslaught', value: 60 }] });
const whiteWolf2 = def({ id: 'whiteWolf2', name: '白狼・改', rarity: 'epic', cost: 1, tribe: 'beast', stats: { hp: 1, attack: 0, defense: 0 },
  effects: [
    { id: 'token', hits: 3, value: 1, option: 'mobilize', target: 'self', timing: 'summon', condition: 'manyMonsters' },
    { id: 'pump', value: 100, target: 'allyMonsters', timing: 'summon', condition: 'manyMonsters' },
  ], keywords: [{ id: 'haste' }, { id: 'doubleAttack' }] });
const howl2 = def({ id: 'howl2', name: '雄たけび・改', rarity: 'common', cost: 1, tribe: 'beast', stats: null,
  effects: [{ id: 'pump', value: 100, target: 'allyMonsters', timing: 'play', condition: 'manyMonsters' }], keywords: [] });
const werewolf2 = def({ id: 'werewolf2', name: '狼男・改', rarity: 'rare', cost: 1, tribe: 'beast', stats: { hp: 20, attack: 0, defense: 0 },
  effects: [{ id: 'vulnerable', value: 1, target: 'chosen', timing: 'summon', condition: 'manyMonsters' }],
  keywords: [{ id: 'haste' }, { id: 'doubleAttack' }, { id: 'onslaught', value: 80 }] });

const b0 = B0();
const withB0 = (name: string, extra: [CardDef, number][]): DeckSpec => {
  const n = extra.reduce((s, [, c]) => s + c, 0);
  let left = 30 - n;
  const rest: [CardDef, number][] = [];
  for (const e of b0.deck.entries) {
    const c = Math.min(e.count, left);
    if (c > 0) rest.push([b0.cards.find((x) => x.id === e.cardId)!, c]);
    left -= c;
  }
  return buildDeck(name, [...extra, ...rest]);
};

const DECKS: Record<string, () => DeckSpec> = {
  spark: () => buildDeck('報告#4 火花聖霊', [[searcher, 18], [spark, 2], [puppet, 10]]),
  dragon: () => buildDeck('報告#5 竜（組み直し）', [[salamander, 8], [poisonBreath, 4], [fireBreath, 4], [elder, 6], [dragon, 4], [hydra, 2], [director, 2]]),
  loop1: () => withB0('1枚のループ', [[loopCard, 2]]),
  benkei: () => buildDeck('報告#17 弁慶', [[scout, 29], [benkei, 1]]),
  wolves: () => buildDeck('報告#19 狼', [[wolfPack, 9], [wolfRush, 7], [howl, 7], [whiteWolf, 2], [werewolf, 3], [sealAll, 2]]),
  wolves2: () => buildDeck('報告#19 狼（組み直し）', [[wolfPackC1, 6], [wolfPackC0, 4], [wolfRush2, 6], [howl2, 7], [whiteWolf2, 2], [werewolf2, 3], [sealAll, 2]]),
};

const n = Number(process.argv[2] ?? 20);
const keys = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(DECKS);
const opp = B0();
console.log(`親和の下限 ${BALANCE.abilities.affinity.minCost}・各 ${n} 試合（CPU つよい、相手は基準デッキ B0）`);
console.log('デッキ                  席     勝ち  1T目で決着  2T目まで  平均ターン');
for (const key of keys) {
  let deck: DeckSpec;
  try {
    deck = DECKS[key]!();
  } catch (e) {
    console.log(`${key.padEnd(20)}  （今の値段では作れない：${(e as Error).message.slice(0, 60)}…）`);
    continue;
  }
  for (const first of [0, 1] as const) {
    let wins = 0, t1 = 0, t2 = 0, turns = 0;
    for (let i = 0; i < n; i++) {
      const r = playGame(deck, opp, 5000 + i, { level: 'hard', first });
      turns += r.turnsTaken[0];
      if (r.winner !== 0) continue;
      wins++;
      if (r.turnsTaken[0] <= 1) t1++;
      if (r.turnsTaken[0] <= 2) t2++;
    }
    console.log(`${deck.name.padEnd(20)}  ${first === 0 ? '先攻' : '後攻'}  ${String(wins).padStart(4)}  ${String(t1).padStart(10)}  ${String(t2).padStart(8)}  ${(turns / n).toFixed(1).padStart(9)}`);
  }
}
