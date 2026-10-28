// MTG 要素の採用：バッチ2（キーワード6・効果12・デメリット5＋トークン・付与キーワード・一時強化・呪縛）。倍率1で確かめる
import { describe, expect, it } from 'vitest';
import {
  ai,
  analyzeCard,
  analyzeDeck,
  availableDrawbacks,
  BALANCE,
  battle,
  createDrawback,
  describeDrawback,
  describeEffect,
  fitDrawback,
  getEffect,
  targetsForEffect,
  allowedTargets,
  type CardDef,
  type DrawbackInstance,
  type EffectInstance,
  type KeywordInstance,
} from '../src/engine/index.ts';
import { checkCondition } from '../src/engine/battle/conditions.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { card, codes } from './helpers.ts';
import { act, actError, attack, endTurn, fx, giveCard, logText, M, monster, P, play, putMonster, rich, startGame } from './battle/helpers.ts';

type G = battle.GameState;

let seq = 0;
const MON = (a: number, h: number, extra: Partial<CardDef> = {}) =>
  card({ id: `b2m${++seq}`, name: `獣${seq}`, rarity: 'legend', stats: { attack: a, hp: h, defense: 0 }, ...extra });
const SPELL = (effects: EffectInstance[], extra: Partial<CardDef> = {}) =>
  card({ id: `b2s${++seq}`, name: `呪文${seq}`, rarity: 'legend', effects, ...extra });
const KW = (...ids: string[]): KeywordInstance[] => ids.map((id) => ({ id }));
const DB = (id: string, extra: Partial<DrawbackInstance> = {}): DrawbackInstance => ({ id, timing: null, ...extra });
const BOLT = (v = 5) => SPELL([fx({ id: 'damage', value: v })]);

const effectLine = (e: EffectInstance, extra: Partial<CardDef> = {}) =>
  analyzeCard(card({ rarity: 'legend', cost: 5, effects: [e], ...extra })).points.lines.find((l) => l.kind === 'effect')!;
const kwPoints = (k: KeywordInstance, attack = 4) =>
  analyzeCard(card({ rarity: 'legend', stats: { attack, hp: 1, defense: 0 }, keywords: [k] })).points.lines.find((l) => l.kind === 'keyword')!.value;
const dbPoints = (d: DrawbackInstance, extra: Partial<CardDef> = {}) =>
  analyzeCard(card({ rarity: 'legend', cost: 3, ...extra, drawbacks: [d] })).points.lines.find((l) => l.kind === 'drawback')!.value;

/** P0 の手番で、P1 の場に敵、P0 の場に味方を置いた盤面 */
function arena(): G {
  return rich(startGame());
}

// ---------------------------------------------------------------- キーワード
describe('キーワード（バッチ2）', () => {
  it('ポイントと説明', () => {
    expect(kwPoints({ id: 'deathtouch' })).toBe(6);
    // 体力が高いと max(6, 体力×1)（決定事項 #89）
    expect(analyzeCard(card({ rarity: 'legend', stats: { attack: 1, hp: 10, defense: 0 }, keywords: [{ id: 'deathtouch' }] })).points.lines.find((l) => l.kind === 'keyword')!.value).toBe(10);
    expect(kwPoints({ id: 'firstStrike' }, 2)).toBe(2); // max(2, 1)
    expect(kwPoints({ id: 'firstStrike' }, 6)).toBe(3);
    expect(kwPoints({ id: 'hexproof' })).toBe(4);
    expect(kwPoints({ id: 'lifelink' }, 0)).toBe(1);
    expect(kwPoints({ id: 'lifelink' }, 4)).toBe(4);
    expect(kwPoints({ id: 'bushido', value: 3 })).toBe(6);
    expect(kwPoints({ id: 'divineShield' })).toBe(4);
    const text = analyzeCard(MON(1, 1, { keywords: [{ id: 'bushido', value: 2 }, { id: 'deathtouch' }] })).text.keywords;
    expect(text).toEqual([
      { name: '武士道2', text: 'モンスターと戦うとき（攻撃・反撃・格闘）、攻撃力+2' },
      { name: '接死', text: 'このモンスターが攻撃・反撃・格闘でダメージを与えたモンスターは破壊される' },
    ]);
    expect(codes(analyzeCard(card({ rarity: 'legend', stats: { attack: 1, hp: 1, defense: 0 }, keywords: [{ id: 'bushido', value: 6 }] })).violations)).toContain('KEYWORD_VALUE');
  });

  it('接死：攻撃・反撃・格闘でダメージを与えたモンスターを破壊する（不屈も効かない）', () => {
    let g = startGame();
    const viper = putMonster(g, 0, MON(1, 5, { keywords: KW('deathtouch') }));
    const big = putMonster(g, 1, MON(0, 20, { keywords: KW('undying') }));
    g = attack(g, viper, M(big));
    expect(monster(g, big)).toBeUndefined();
    expect(logText(g)).toContain('接死');
    // 反撃でも
    let h = startGame();
    const brute = putMonster(h, 0, MON(3, 20));
    const guard = putMonster(h, 1, MON(1, 9, { keywords: KW('deathtouch') }));
    h = attack(h, brute, M(guard));
    expect(monster(h, brute)).toBeUndefined();
    expect(monster(h, guard)!.hp).toBe(6);
  });

  it('接死：効果のダメージ（hit）には働かない。聖盾で0なら働かない', () => {
    let g = rich(startGame());
    const pinger = putMonster(g, 0, MON(1, 5, { keywords: KW('deathtouch'), effects: [fx({ id: 'damage', value: 1, timing: 'attack', target: 'random' })] }));
    const big = putMonster(g, 1, MON(0, 20));
    g = attack(g, pinger, P(1));
    expect(monster(g, big)!.hp).toBe(19); // 攻撃するたびのダメージ1では破壊されない
    let h = startGame();
    const viper = putMonster(h, 0, MON(1, 5, { keywords: KW('deathtouch') }));
    const holy = putMonster(h, 1, MON(0, 20, { keywords: KW('divineShield') }));
    h = attack(h, viper, M(holy));
    expect(monster(h, holy)!.hp).toBe(20);
    expect(monster(h, holy)!.shieldUsed).toBe(true);
  });

  it('先制攻撃：倒したら反撃を受けない。倒せなければ反撃を受ける', () => {
    let g = startGame();
    const fs = putMonster(g, 0, MON(5, 10, { keywords: KW('firstStrike') }));
    const weak = putMonster(g, 1, MON(3, 5));
    g = attack(g, fs, M(weak));
    expect(monster(g, weak)).toBeUndefined();
    expect(monster(g, fs)!.hp).toBe(10);
    expect(logText(g)).toContain('先制攻撃');
    let h = startGame();
    const fs2 = putMonster(h, 0, MON(5, 10, { keywords: KW('firstStrike') }));
    const tough = putMonster(h, 1, MON(3, 9));
    h = attack(h, fs2, M(tough));
    expect(monster(h, fs2)!.hp).toBe(7);
  });

  it('呪禁：カードの「選んだ1体」に選べない。呪禁の挑発はカードの対象を縛らない。ランダム・攻撃は当たる', () => {
    let g = arena();
    const hex = putMonster(g, 1, MON(1, 9, { keywords: KW('hexproof', 'taunt') }));
    const other = putMonster(g, 1, MON(1, 9));
    const bolt = BOLT();
    expect(actError(g, { type: 'playCard', player: 0, cardUid: giveCard(g, 0, bolt), chosen: { enemy: M(hex) } })).toBe('その対象は選べません');
    // 呪禁の挑発しかいないので、相手プレイヤーとほかのモンスターを選べる
    g = play(g, giveCard(g, 0, bolt), { enemy: M(other) });
    expect(monster(g, other)!.hp).toBe(4);
    g = play(g, giveCard(g, 0, bolt), { enemy: P(1) });
    expect(g.players[1].hp).toBe(115);
    // ランダムは当たる
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'damage', value: 1, target: 'enemyMonsters' })])));
    expect(monster(g, hex)!.hp).toBe(8);
    // モンスターの攻撃は挑発に従う（呪禁でも挑発）
    const a = putMonster(g, 0, MON(1, 9));
    expect(battle.attackTargets(g, monster(g, a)!)).toEqual([M(hex)]);
    const info = battle.playInfo(g, 0, g.players[0].hand.find((c) => c.cardId.endsWith(bolt.id))!);
    expect(info.tauntLimited).toBe(false);
  });

  it('絆魂：実際に減らしたぶん回復。シールドで防がれた分は回復しない', () => {
    let g = startGame();
    g.players[0].hp = 100;
    const leech = putMonster(g, 0, MON(4, 9, { keywords: KW('lifelink') }));
    g.players[1].shield = 3;
    g = attack(g, leech, P(1));
    expect(g.players[1].hp).toBe(119);
    expect(g.players[0].hp).toBe(101);
    // 反撃でも（相手のモンスターの体力が残り2なら2）
    g = endTurn(g);
    const atk = putMonster(g, 1, MON(1, 2));
    g = attack(g, atk, M(leech));
    expect(monster(g, atk)).toBeUndefined();
    expect(g.players[0].hp).toBe(103);
  });

  it('武士道：モンスターと戦うときだけ攻撃力+N（顔には乗らない。反撃にも乗る）', () => {
    let g = startGame();
    const sam = putMonster(g, 0, MON(2, 9, { keywords: [{ id: 'bushido', value: 3 }] }));
    const d = putMonster(g, 1, MON(1, 20));
    g = attack(g, sam, M(d));
    expect(monster(g, d)!.hp).toBe(15);
    g = endTurn(endTurn(g));
    g = attack(g, sam, P(1));
    expect(g.players[1].hp).toBe(118);
    // 反撃
    g = endTurn(g);
    const x = putMonster(g, 1, MON(0, 20));
    g = attack(g, x, M(sam));
    expect(monster(g, x)!.hp).toBe(15);
  });

  it('聖盾：最初のダメージ1回だけ0。毒は防がない', () => {
    let g = rich(arena());
    const holy = putMonster(g, 1, MON(0, 10, { keywords: KW('divineShield') }));
    g = play(g, giveCard(g, 0, BOLT(5)), { enemy: M(holy) });
    expect(monster(g, holy)!.hp).toBe(10);
    g = play(g, giveCard(g, 0, BOLT(5)), { enemy: M(holy) });
    expect(monster(g, holy)!.hp).toBe(5);
    const h = rich(arena());
    const holy2 = putMonster(h, 1, MON(0, 10, { keywords: KW('divineShield') }));
    monster(h, holy2)!.status.poison = 3;
    const h2 = endTurn(h);
    expect(monster(h2, holy2)!.hp).toBe(7);
    expect(monster(h2, holy2)!.shieldUsed).toBeFalsy();
  });
});

// ---------------------------------------------------------------- 効果
describe('効果（バッチ2）：テキストとポイント', () => {
  const STATS = { stats: { attack: 1, hp: 1, defense: 0 } };
  it.each<[string, EffectInstance, string, number, Partial<CardDef>?]>([
    ['token', fx({ id: 'token', value: 1, hits: 2, target: 'self' }), '攻撃力1・体力1の小鬼を2体出す。', 10],
    ['train', fx({ id: 'train', value: 2, target: 'chosen' }), '自分のモンスター1体の攻撃力と体力を+2する。', 9],
    ['train thisMonster', fx({ id: 'train', value: 1, timing: 'attack', target: 'thisMonster' }), '攻撃するたび、このモンスターの攻撃力と体力を+1する。', 9, STATS],
    ['wither', fx({ id: 'wither', value: 1 }), '相手モンスター1体の攻撃力と体力を−1する（体力が0になると破壊）。', 5],
    ['grantKeyword', fx({ id: 'grantKeyword', option: 'taunt', target: 'chosen' }), '自分のモンスター1体に挑発を与える。', 7],
    ['grantKeyword deathtouch', fx({ id: 'grantKeyword', option: 'deathtouch', target: 'allyMonsters' }), '自分のモンスター全体に接死を与える。', 18],
    ['fight', fx({ id: 'fight' }), '自分のモンスター1体と相手モンスター1体を戦わせる（互いに攻撃力ぶんのダメージを与える）。', 9],
    ['fight random', fx({ id: 'fight', target: 'random' }), 'ランダムな自分のモンスター1体とランダムな相手モンスター1体を戦わせる（互いに攻撃力ぶんのダメージを与える）。', 6],
    ['ready', fx({ id: 'ready', target: 'chosen' }), '自分のモンスター1体をもう一度攻撃できるようにする（1体につき1ターン1回）。', 10],
    ['scry', fx({ id: 'scry', value: 2, target: 'self' }), '山札の上2枚を見て、好きな枚数を山札の下に置く。', 3],
    ['scry discard', fx({ id: 'scry', value: 3, target: 'self', option: 'discard' }), '山札の上3枚を見て、好きな枚数を捨て札に置く。', 5],
    ['loot', fx({ id: 'loot', value: 1, target: 'self' }), 'カードを1枚引き、手札を1枚選んで捨てる。', 3],
    ['purge', fx({ id: 'purge', target: 'self' }), '手札か捨て札のカードを1枚選んで除外する。', 3],
    ['double', fx({ id: 'double', target: 'self' }), `相手の毒を2倍にする（増えるのは最大${BALANCE.effects.poison.maxValue}）。`, 12],
    ['double strength', fx({ id: 'double', target: 'self', option: 'strength' }), `自分の筋力を2倍にする（合計${BALANCE.battle.strengthCap}まで）。`, 12],
    ['doom', fx({ id: 'doom', value: 1, target: 'enemyPlayer' }), '相手に呪縛1を与える（相手のターン開始時に1ダメージ。減らず、浄化で消える）。', 15],
    ['pump', fx({ id: 'pump', value: 2, target: 'chosen' }), '自分のモンスター1体の攻撃力をこのターンだけ+2する。', 3],
  ])('%s', (_name, e, text, points, extra = {}) => {
    expect(describeEffect(e)).toBe(text);
    expect(effectLine(e, extra).value).toBe(points);
  });

  it('使えるタイミング・対象の制限（再行動・格闘・倍化・トークン）', () => {
    const ready = getEffect('ready')!;
    expect(targetsForEffect(ready, 'summon', 'monster')).toEqual(['chosen', 'random', 'weakestAlly']);
    const v = (c: CardDef) => codes(analyzeCard(c).violations);
    expect(v(SPELL([fx({ id: 'ready', timing: 'turnEnd', target: 'random' })]))).toContain('EFFECT_TIMING');
    expect(v(MON(1, 1, { effects: [fx({ id: 'ready', timing: 'summon', target: 'thisMonster' })] }))).toContain('EFFECT_TARGET');
    expect(v(SPELL([fx({ id: 'ready', target: 'allyMonsters' })]))).toContain('EFFECT_TARGET');
    expect(allowedTargets('fight', 'play')).toEqual(['chosen', 'random']);
    expect(allowedTargets('fight', 'turnStart')).toEqual(['random']);
    expect(v(card({ rarity: 'common', effects: [fx({ id: 'double', target: 'self' })] }))).toContain('EFFECT_RARITY');
    expect(v(SPELL([fx({ id: 'token', value: 1, hits: 4, target: 'self' })]))).toContain('EFFECT_HITS');
    expect(v(SPELL([fx({ id: 'token', value: 6, hits: 1, target: 'self' })]))).toContain('EFFECT_VALUE');
    expect(v(SPELL([fx({ id: 'doom', value: 3, target: 'enemyPlayer' })]))).toContain('EFFECT_VALUE');
    // 数値の倍数を付けられる（scalable）のは鍛錬・衰弱・一時強化
    expect(['train', 'wither', 'pump'].every((id) => getEffect(id)!.scalable)).toBe(true);
    expect(['token', 'doom', 'scry', 'loot'].some((id) => getEffect(id)!.scalable)).toBe(false);
  });
});

describe('効果（バッチ2）：対戦での動き', () => {
  it('トークン生成：N/N を M 体。場に5体まで。破壊・バウンスでどこにも行かない。出るたびが働く', () => {
    let g = arena();
    const flag = card({ id: 'flag', name: '旗', rarity: 'legend', effects: [fx({ id: 'attackUp', value: 1, timing: 'allySummoned', target: 'chosen' })] });
    g = play(g, giveCard(g, 0, flag));
    const tokens = SPELL([fx({ id: 'token', value: 2, hits: 3, target: 'self' })]);
    g = play(g, giveCard(g, 0, tokens));
    expect(g.players[0].board.map((m) => [m.attack, m.hp])).toEqual([
      [3, 2],
      [3, 2],
      [2, 2],
    ]); // 出るたびは1ターン2回まで
    expect(g.players[0].board.every((m) => m.card.token && m.card.cardId === battle.TOKEN_CARD_ID)).toBe(true);
    expect(g.cards[battle.TOKEN_CARD_ID]!.name).toBe(BALANCE.battle.tokenName);
    expect(checkCondition(g, 0, 'twoSummonsThisTurn')).toBe(true);
    g = play(g, giveCard(g, 0, tokens));
    expect(battle.tokenCount(g, 0)).toBe(BALANCE.battle.maxTokens);
    expect(logText(g)).toContain(`トークンは1人${BALANCE.battle.maxTokens}体までなので`);
    // 破壊されても捨て札に行かない
    g = endTurn(g);
    const discard = g.players[0].discard.length;
    rich(g, 1);
    const t0 = g.players[0].board[0]!.uid;
    g = play(g, giveCard(g, 1, BOLT(9)), { enemy: M(t0) });
    expect(monster(g, t0)).toBeUndefined();
    expect(g.players[0].discard.length).toBe(discard);
    // バウンスでも消える
    const t1 = g.players[0].board[0]!.uid;
    g = play(g, giveCard(g, 1, SPELL([fx({ id: 'bounce', value: 5 })])), { enemy: M(t1) });
    expect(monster(g, t1)).toBeUndefined();
    expect(g.players[0].hand.some((c) => c.uid === t1)).toBe(false);
  });

  it('鍛錬・衰弱：攻撃力と体力（最大値も）。衰弱で体力0なら破壊（不屈・聖盾は効かない）', () => {
    let g = arena();
    const mine = putMonster(g, 0, MON(1, 5));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'train', value: 2, target: 'chosen' })])), { ally: mine });
    expect(monster(g, mine)).toMatchObject({ attack: 3, hp: 7, maxHp: 7 });
    const foe = putMonster(g, 1, MON(1, 3, { keywords: KW('undying', 'divineShield') }));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'wither', value: 2 })])), { enemy: M(foe) });
    expect(monster(g, foe)).toMatchObject({ attack: 0, hp: 1, maxHp: 1 });
    expect(monster(g, foe)!.shieldUsed).toBeFalsy();
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'wither', value: 2 })])), { enemy: M(foe) });
    expect(monster(g, foe)).toBeUndefined();
  });

  it('キーワード付与：働く・重ねても1つ・封印中は働かない・不屈は使えるようになる', () => {
    let g = arena();
    const mine = putMonster(g, 0, MON(1, 5, { keywords: KW('undying') }), { undyingUsed: true });
    const grant = (option: string) => SPELL([fx({ id: 'grantKeyword', option, target: 'chosen' })]);
    g = play(g, giveCard(g, 0, grant('taunt')), { ally: mine });
    g = play(g, giveCard(g, 0, grant('taunt')), { ally: mine });
    expect(monster(g, mine)!.granted).toEqual(['taunt']);
    expect(battle.keywordFlags(g, monster(g, mine)!).taunt).toBe(true);
    expect(battle.targetableTaunts(g, 0).map((m) => m.uid)).toEqual([mine]);
    g = play(g, giveCard(g, 0, grant('undying')), { ally: mine });
    expect(monster(g, mine)!.undyingUsed).toBe(false);
    monster(g, mine)!.sealed = true;
    expect(battle.keywordFlags(g, monster(g, mine)!).taunt).toBeUndefined();
  });

  it('格闘：互いに攻撃力（＋一時強化）ぶん。反撃・攻撃するたびは起きない。片方がいなければ不発', () => {
    let g = arena();
    const mine = putMonster(g, 0, MON(3, 10, { effects: [fx({ id: 'heal', value: 9, timing: 'attack', target: 'self' })] }));
    const foe = putMonster(g, 1, MON(2, 10));
    monster(g, mine)!.tempAttack = 1;
    g.players[0].hp = 100;
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'fight' })])), { ally: mine, enemy: M(foe) });
    expect(monster(g, foe)!.hp).toBe(6);
    expect(monster(g, mine)!.hp).toBe(8);
    expect(g.players[0].hp).toBe(100);
    expect(monster(g, mine)!.attacksUsed).toBe(0);
    // 接死は格闘でも働く
    const viper = putMonster(g, 0, MON(1, 10, { keywords: KW('deathtouch') }));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'fight' })])), { ally: viper, enemy: M(foe) });
    expect(monster(g, foe)).toBeUndefined();
    // 相手がいなければ不発（ランダム）
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'fight', target: 'random' })])));
    expect(logText(g)).toContain('対象がいないため何も起きない');
    // 選ぶとき、両方が要る
    putMonster(g, 1, MON(1, 1));
    const err = actError(g, { type: 'playCard', player: 0, cardUid: giveCard(g, 0, SPELL([fx({ id: 'fight' })])), chosen: { ally: mine } });
    expect(err).toBe('対象を選んでください');
  });

  it('再行動：もう一度攻撃できる。1体につき1ターン1回。召喚酔いは解除しない', () => {
    let g = arena();
    const mine = putMonster(g, 0, MON(3, 10));
    g = attack(g, mine, P(1));
    const ready = SPELL([fx({ id: 'ready', target: 'chosen' })]);
    g = play(g, giveCard(g, 0, ready), { ally: mine });
    g = attack(g, mine, P(1));
    expect(g.players[1].hp).toBe(114);
    g = play(g, giveCard(g, 0, ready), { ally: mine });
    expect(logText(g)).toContain('このターンもう再行動した');
    expect(battle.attackBlockReason(g, monster(g, mine)!)).toBe('このターンはもう攻撃しました');
    const fresh = putMonster(g, 0, MON(3, 10), { enteredTurn: g.turnIndex });
    g = play(g, giveCard(g, 0, ready), { ally: fresh });
    expect(battle.attackBlockReason(g, monster(g, fresh)!)).toBe('場に出たターンは攻撃できません');
  });

  it('占術：山札の上N枚から選んで下へ／捨て札へ。山札が足りなければある分', () => {
    let g = arena();
    const top = g.players[0].deck.slice(0, 2).map((c) => c.uid);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'scry', value: 2, target: 'self' })])));
    expect(g.pending?.options.map((o) => o.id)).toEqual(top);
    expect(g.pending).toMatchObject({ min: 0, max: 2 });
    // 相手には選択肢が見えない
    expect(battle.viewFor(g, 1).pending?.options).toEqual([]);
    g = act(g, { type: 'choose', player: 0, picks: [top[0]!] });
    expect(g.players[0].deck.at(-1)!.uid).toBe(top[0]);
    expect(g.players[0].deck[0]!.uid).toBe(top[1]);
    // 捨て札へ・山札が1枚
    g.players[0].deck = g.players[0].deck.slice(0, 1);
    const only = g.players[0].deck[0]!.uid;
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'scry', value: 3, target: 'self', option: 'discard' })])));
    expect(g.pending?.options).toHaveLength(1);
    g = act(g, { type: 'choose', player: 0, picks: [only] });
    expect(g.players[0].deck).toHaveLength(0);
    expect(g.players[0].discard.some((c) => c.uid === only)).toBe(true);
  });

  it('手札整理：引いてから1枚選んで捨てる。手札が0なら何もしない', () => {
    let g = arena();
    g.players[0].hand = [];
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'loot', value: 2, target: 'self' })])));
    expect(g.pending?.options).toHaveLength(2);
    const keep = g.pending!.options[1]!.id;
    g = act(g, { type: 'choose', player: 0, picks: [g.pending!.options[0]!.id] });
    expect(g.players[0].hand.map((c) => c.uid)).toEqual([keep]);
    // 山札も手札もない
    g.players[0].hand = [];
    g.players[0].deck = [];
    g.players[0].discard = [];
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'loot', value: 1, target: 'self' })])));
    expect(g.pending).toBeNull();
    expect(logText(g)).toContain('捨てる手札がない');
  });

  it('処分：手札か捨て札から1枚除外。選ばなくてもよい', () => {
    let g = arena();
    g.players[0].hand = [{ uid: 'nz', cardId: battle.NOISE_CARD_ID, owner: 0 }];
    const purge = SPELL([fx({ id: 'purge', target: 'self' })]);
    g = play(g, giveCard(g, 0, purge));
    expect(g.pending?.options[0]).toMatchObject({ id: 'nz', label: '手札：ノイズ' });
    g = act(g, { type: 'choose', player: 0, picks: ['nz'] });
    expect(g.players[0].exile.some((c) => c.uid === 'nz')).toBe(true);
    g = play(g, giveCard(g, 0, purge));
    g = act(g, { type: 'choose', player: 0, picks: [] });
    expect(g.pending).toBeNull();
  });

  it('倍化：毒は毒の上限まで、出血は bleedMaxAdd まで、筋力は上限まで増える', () => {
    let g = arena();
    const dbl = (option: string) => card({ id: `dbl-${option}`, name: '倍', rarity: 'rare', effects: [fx({ id: 'double', target: 'self', option })] });
    g.players[1].status.poison = 4;
    g = play(g, giveCard(g, 0, dbl('poison')));
    expect(g.players[1].status.poison).toBe(8);
    g.players[1].status.poison = 30;
    g = play(g, giveCard(g, 0, dbl('poison')));
    expect(g.players[1].status.poison).toBe(30 + BALANCE.effects.poison.maxValue);
    g.players[1].status.bleed = 9;
    g = play(g, giveCard(g, 0, dbl('bleed')));
    expect(g.players[1].status.bleed).toBe(9 + BALANCE.effects.double.bleedMaxAdd);
    g.players[0].status.strength = 7;
    g = play(g, giveCard(g, 0, dbl('strength')));
    expect(g.players[0].status.strength).toBe(BALANCE.battle.strengthCap);
  });

  it('呪縛：相手のターン開始時にダメージ（無効化を通る・減らない）。上限・浄化', () => {
    let g = arena();
    const doom = SPELL([fx({ id: 'doom', value: 2, target: 'enemyPlayer' })]);
    g = play(g, giveCard(g, 0, doom));
    g = play(g, giveCard(g, 0, doom));
    g = play(g, giveCard(g, 0, doom));
    expect(g.players[1].status.doom).toBe(BALANCE.battle.doomCap);
    g.players[1].status.nullify = 1;
    g = endTurn(g);
    expect(g.players[1].hp).toBe(120 - BALANCE.battle.doomCap);
    expect(g.players[1].status.nullify).toBe(1);
    expect(g.players[1].status.doom).toBe(BALANCE.battle.doomCap);
    rich(g, 1);
    g = play(g, giveCard(g, 1, SPELL([fx({ id: 'cleanse', target: 'self' })])));
    expect(g.players[1].status.doom).toBe(0);
  });

  it('一時強化：攻撃・反撃・条件に乗り、ターン終了で消える', () => {
    let g = arena();
    const mine = putMonster(g, 0, MON(2, 10));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'pump', value: 3, target: 'chosen' })])), { ally: mine });
    expect(monster(g, mine)!.tempAttack).toBe(3);
    expect(checkCondition(g, 0, 'bigMonster')).toBe(true);
    g = attack(g, mine, P(1));
    expect(g.players[1].hp).toBe(115);
    g = endTurn(g);
    expect(monster(g, mine)!.tempAttack).toBeUndefined();
  });
});

// ---------------------------------------------------------------- デメリット
describe('デメリット（バッチ2）', () => {
  it('ポイントとテキスト', () => {
    const atk = (a: number) => ({ stats: { attack: a, hp: 1, defense: 0 } });
    expect(dbPoints(DB('defender'), atk(3))).toBe(-6);
    expect(dbPoints(DB('defender'), atk(0))).toBe(-1);
    expect([1, 2, 3].map((n) => dbPoints(DB('lifespan', { value: n }), atk(1)))).toEqual([-6, -4, -2]);
    expect(dbPoints(DB('decay'), atk(2))).toBe(-2);
    expect(dbPoints(DB('exhaust'))).toBe(-3);
    expect(dbPoints(DB('sacrifice', { timing: 'play' }))).toBe(-5);
    expect(describeDrawback(DB('lifespan', { value: 1 }))).toBe('寿命1：1回目の自分のターン終了時に場から消える（モンスターは破壊される）。');
    expect(describeDrawback(DB('sacrifice', { timing: 'summon' }))).toBe('召喚時、自分のモンスター1体を選んで破壊する（いなければ使えない）。');
    expect(describeDrawback(DB('defender'))).toBe('このモンスターは攻撃できない。');
  });

  it('付けられるカード（validate とエディター）', () => {
    const v = (c: CardDef) => codes(analyzeCard(c).violations);
    expect(v(MON(1, 1, { drawbacks: [DB('defender'), DB('betrayal')] }))).toContain('DRAWBACK_CONFLICT');
    expect(v(MON(1, 1, { drawbacks: [DB('defender'), DB('betrayal')] })).filter((c) => c === 'DRAWBACK_CONFLICT')).toHaveLength(1);
    expect(v(SPELL([fx({ id: 'heal', value: 1, target: 'self' })], { drawbacks: [DB('lifespan', { value: 1 })] }))).toContain('DRAWBACK_CARD_TYPE');
    expect(v(SPELL([fx({ id: 'heal', value: 1, target: 'self', timing: 'turnStart' })], { drawbacks: [DB('lifespan', { value: 1 })] }))).not.toContain('DRAWBACK_CARD_TYPE');
    expect(v(MON(1, 1, { drawbacks: [DB('exhaust')] }))).toContain('DRAWBACK_CARD_TYPE');
    expect(v(SPELL([fx({ id: 'heal', value: 1, target: 'self', timing: 'turnStart' })], { drawbacks: [DB('exhaust')] }))).toContain('DRAWBACK_CARD_TYPE');
    expect(v(SPELL([fx({ id: 'heal', value: 1, target: 'self' })], { drawbacks: [DB('sacrifice', { timing: 'turnStart' })] }))).toContain('DRAWBACK_TIMING');
    expect(v(SPELL([fx({ id: 'heal', value: 1, target: 'self' })], { drawbacks: [DB('defender')] }))).toContain('DRAWBACK_MONSTER_ONLY');
    // エディター
    const mon = MON(1, 1, { drawbacks: [DB('betrayal')] });
    expect(availableDrawbacks(mon).map((d) => d.id)).not.toContain('defender');
    expect(availableDrawbacks(mon).map((d) => d.id)).not.toContain('exhaust');
    expect(availableDrawbacks(SPELL([fx({ id: 'heal', value: 1, target: 'self' })])).map((d) => d.id)).toEqual(expect.arrayContaining(['exhaust', 'lifespan', 'sacrifice']));
    expect(createDrawback('sacrifice', 'monster').timing).toBe('summon');
    expect(fitDrawback(DB('sacrifice', { timing: 'turnEnd' }), 'spell').timing).toBe('play');
  });

  it('防衛：攻撃できない（自動攻撃もしない）。反撃はする', () => {
    let g = startGame();
    const wall = putMonster(g, 0, MON(3, 9, { drawbacks: [DB('defender')] }));
    expect(battle.attackBlockReason(g, monster(g, wall)!)).toBe('防衛：このモンスターは攻撃できない');
    expect(battle.legalActions(g, 0).some((a) => a.type === 'attack')).toBe(false);
    g = endTurn(g);
    const x = putMonster(g, 1, MON(1, 9));
    g = attack(g, x, M(wall));
    expect(monster(g, x)!.hp).toBe(6);
    // 混乱しても自動で攻撃しない
    monster(g, wall)!.status.confusePending = true;
    g = endTurn(g);
    expect(g.log.filter((e) => e.ev?.kind === 'attack' && e.turn === g.turnIndex)).toHaveLength(0);
  });

  it('寿命：出たターンも数える。モンスターは破壊（破壊されたときが出る）、パワーは消える', () => {
    let g = arena();
    g.players[0].hp = 100;
    const once = MON(3, 3, { drawbacks: [DB('lifespan', { value: 1 })], effects: [fx({ id: 'heal', value: 5, timing: 'destroyed', target: 'self' })] });
    g = play(g, giveCard(g, 0, once));
    const uid = g.players[0].board[0]!.uid;
    g = endTurn(g);
    expect(monster(g, uid)).toBeUndefined();
    expect(g.players[0].hp).toBe(105);
    // 寿命2のパワー
    let h = arena();
    const power = card({ id: 'lp', name: '短い力', rarity: 'legend', effects: [fx({ id: 'shield', value: 1, timing: 'turnEnd', target: 'self' })], drawbacks: [DB('lifespan', { value: 2 })] });
    h = play(h, giveCard(h, 0, power));
    expect(h.players[0].powers[0]!.life).toBe(2);
    h = endTurn(h);
    expect(h.players[0].powers[0]!.life).toBe(1);
    h = endTurn(h);
    h = endTurn(h);
    expect(h.players[0].powers).toHaveLength(0);
    expect(logText(h)).toContain('寿命が尽きて消えた');
  });

  it('腐乱：攻撃したターンの終了時に破壊。攻撃しなければ残る', () => {
    let g = startGame();
    const a = putMonster(g, 0, MON(3, 9, { drawbacks: [DB('decay')] }));
    const b = putMonster(g, 0, MON(3, 9, { drawbacks: [DB('decay')] }));
    g = attack(g, a, P(1));
    g = endTurn(g);
    expect(monster(g, a)).toBeUndefined();
    expect(monster(g, b)).toBeDefined();
  });

  it('廃棄：使ったあと除外へ', () => {
    let g = arena();
    const uid = giveCard(g, 0, SPELL([fx({ id: 'draw', value: 1, target: 'self' })], { drawbacks: [DB('exhaust')] }));
    g = play(g, uid);
    expect(g.players[0].exile.some((c) => c.uid === uid)).toBe(true);
    expect(g.players[0].discard.some((c) => c.uid === uid)).toBe(false);
  });

  it('生け贄：いなければ使えない。選んだモンスターを破壊し、破壊されたとき・他のモンスターが破壊されるたびが出る', () => {
    let g = arena();
    g.players[0].hp = 100;
    const sac = SPELL([fx({ id: 'draw', value: 1, target: 'self' })], { drawbacks: [DB('sacrifice', { timing: 'play' })] });
    const uid = giveCard(g, 0, sac);
    expect(actError(g, { type: 'playCard', player: 0, cardUid: uid })).toBe('生け贄にするモンスターがいません');
    expect(battle.playInfo(g, 0, g.players[0].hand.find((c) => c.uid === uid)!).blocked).toBe('生け贄にするモンスターがいません');
    const a = putMonster(g, 0, MON(1, 1, { effects: [fx({ id: 'heal', value: 3, timing: 'destroyed', target: 'self' })] }));
    const b = putMonster(g, 0, MON(1, 1, { effects: [fx({ id: 'heal', value: 4, timing: 'allyDestroyed', target: 'self' })] }));
    g = play(g, uid);
    expect(g.pending?.options.map((o) => o.id)).toEqual([a, b]);
    g = act(g, { type: 'choose', player: 0, picks: [a] });
    expect(monster(g, a)).toBeUndefined();
    expect(g.players[0].hp).toBe(107);
    // 召喚時：出たモンスター自身は選べない（残り1体なら自動）
    const summoner = MON(2, 2, { drawbacks: [DB('sacrifice', { timing: 'summon' })] });
    g = play(g, giveCard(g, 0, summoner));
    expect(g.pending).toBeNull();
    expect(monster(g, b)).toBeUndefined();
    expect(g.players[0].board).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- 価格の確かめ（仕様の例）
describe('価格の確かめ（倍率1）', () => {
  const ok = (c: CardDef) => {
    const a = analyzeCard(c);
    expect(a.violations, c.name).toEqual([]);
    return a.points.total;
  };
  it('仕様の例が作れる', () => {
    expect(ok(card({ name: '小鬼の群れ', cost: 1, effects: [fx({ id: 'token', value: 1, hits: 2, target: 'self' })] }))).toBe(0);
    expect(ok(card({ name: '毒蛇', rarity: 'rare', cost: 1, stats: { attack: 1, hp: 2, defense: 0 }, keywords: KW('deathtouch') }))).toBe(2);
    expect(ok(card({ name: '呪いの言葉', cost: 1, effects: [fx({ id: 'doom', value: 1, target: 'enemyPlayer' })] }))).toBe(5);
    // 仕様の例「攻撃力2・体力8・挑発・防衛」は防衛が4ptで呪いの条件（デメリット5pt以上）を満たさないので、攻撃力3で確かめる
    expect(codes(analyzeCard(card({ name: '壁2', cost: 2, stats: { attack: 2, hp: 8, defense: 0 }, keywords: KW('taunt'), drawbacks: [DB('defender')] })).violations)).toEqual(['CURSE_TOO_WEAK']);
    // 9＋12＋8 − 20 − 防衛6（差し引けるのは上限5まで）＝ 4
    expect(ok(card({ name: '壁3', cost: 2, stats: { attack: 3, hp: 8, defense: 0 }, keywords: KW('taunt'), drawbacks: [DB('defender')] }))).toBe(4);
  });
});

// ---------------------------------------------------------------- CPU
describe('CPU（バッチ2の要素）', () => {
  it('選択待ちの方針：占術は重いカードを下へ、手札整理はノイズを捨てる、処分はノイズ、生け贄はトークンを選ぶ', () => {
    // 生け贄
    let g = arena();
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'token', value: 1, hits: 1, target: 'self' })])));
    const strong = putMonster(g, 0, MON(5, 9));
    const tokenUid = g.players[0].board.find((m) => m.card.token)!.uid;
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'draw', value: 1, target: 'self' })], { drawbacks: [DB('sacrifice', { timing: 'play' })] })));
    const a1 = ai.cpuAction(g, 0, 1, 'normal');
    expect(a1).toEqual({ type: 'choose', player: 0, picks: [tokenUid] });
    g = act(g, a1);
    expect(monster(g, strong)).toBeDefined();
    // 手札整理：ノイズを捨てる
    g.players[0].hand = [{ uid: 'nz', cardId: battle.NOISE_CARD_ID, owner: 0 }];
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'loot', value: 1, target: 'self' })])));
    expect(ai.cpuAction(g, 0, 1, 'normal')).toEqual({ type: 'choose', player: 0, picks: ['nz'] });
    g = act(g, ai.cpuAction(g, 0, 1, 'normal'));
    // 処分：捨て札のノイズを除外する。ノイズも呪いもなければ選ばない
    g.players[0].hand = [];
    const purge = SPELL([fx({ id: 'purge', target: 'self' })]);
    g = play(g, giveCard(g, 0, purge));
    expect(ai.cpuAction(g, 0, 1, 'normal')).toEqual({ type: 'choose', player: 0, picks: ['nz'] });
    g = act(g, ai.cpuAction(g, 0, 1, 'normal'));
    expect(g.players[0].exile.some((c) => c.uid === 'nz')).toBe(true);
    // 次は捨て札の呪いカード（生け贄の呪文）
    g = play(g, giveCard(g, 0, purge));
    const cursePick = ai.cpuAction(g, 0, 1, 'normal');
    const curseUid = cursePick.type === 'choose' ? cursePick.picks[0] : undefined;
    expect(g.cards[g.players[0].discard.find((c) => c.uid === curseUid)!.cardId]!.drawbacks.length).toBeGreaterThan(0);
    g = act(g, cursePick);
    g.players[0].discard = g.players[0].discard.filter((c) => !g.cards[c.cardId]?.drawbacks.length);
    g = play(g, giveCard(g, 0, purge));
    expect(ai.cpuAction(g, 0, 1, 'normal')).toEqual({ type: 'choose', player: 0, picks: [] });
    g = act(g, ai.cpuAction(g, 0, 1, 'normal'));
    // 占術：コスト5（次のターンのエナジーより重い）を下へ、コスト1は残す
    const heavy = card({ id: 'heavy', name: '重い', cost: 5, effects: [fx({ id: 'heal', value: 1, target: 'self' })] });
    const light = card({ id: 'light', name: '軽い', cost: 1, effects: [fx({ id: 'heal', value: 1, target: 'self' })] });
    g.cards['p0:heavy'] = heavy;
    g.cards['p0:light'] = light;
    g.players[0].deck = [
      { uid: 'h1', cardId: 'p0:heavy', owner: 0 },
      { uid: 'l1', cardId: 'p0:light', owner: 0 },
    ];
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'scry', value: 2, target: 'self' })])));
    expect(ai.cpuAction(g, 0, 1, 'normal')).toEqual({ type: 'choose', player: 0, picks: ['h1'] });
  });

  const m = (id: string, name: string, a: number, h: number, extra: Partial<CardDef> = {}) =>
    card({ id, name, stats: { attack: a, hp: h, defense: 0 }, ...extra });
  const s = (id: string, name: string, effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id, name, effects, ...extra });
  const cards: CardDef[] = [
    s('tok', '小鬼の群れ', [fx({ id: 'token', value: 1, hits: 2, target: 'self' })]),
    m('dt', '毒蛇', 1, 2, { rarity: 'rare', keywords: KW('deathtouch') }),
    s('doom', '呪いの言葉', [fx({ id: 'doom', value: 1, target: 'enemyPlayer' })]),
    s('fight', '決闘', [fx({ id: 'fight' })]),
    s('pump', '雄叫び', [fx({ id: 'pump', value: 5, target: 'chosen' })]),
    s('train', '鍛錬', [fx({ id: 'train', value: 3, target: 'chosen' })]),
    s('loot', '手札整理', [fx({ id: 'loot', value: 2, target: 'self' })]),
    s('scry', '占い', [fx({ id: 'scry', value: 2, target: 'self' })], { cost: 0 }),
    s('sac', '生け贄の儀式', [fx({ id: 'damage', value: 5 }), fx({ id: 'draw', value: 1, target: 'self' })], { drawbacks: [DB('sacrifice', { timing: 'play' })] }),
    m('wall', '防衛の壁', 3, 8, { cost: 2, keywords: KW('taunt'), drawbacks: [DB('defender')] }),
    m('leech', '吸血鬼', 3, 6, { cost: 2, keywords: KW('lifelink') }),
    m('knight', '聖騎士', 2, 6, { rarity: 'rare', cost: 2, keywords: KW('divineShield', 'firstStrike') }),
    m('samurai', '侍', 2, 2, { keywords: [{ id: 'bushido', value: 1 }] }),
    m('ghost', '幽霊', 2, 3, { keywords: KW('hexproof') }),
    m('rush', '使い捨ての兵', 4, 3, { drawbacks: [DB('decay'), DB('lifespan', { value: 1 })] }),
    s('ready', '再行動', [fx({ id: 'ready', target: 'chosen' })], { rarity: 'rare' }),
    s('purge', '処分', [fx({ id: 'purge', target: 'self' })], { cost: 0 }),
    s('double', '毒の倍化', [fx({ id: 'double', target: 'self' })], { rarity: 'rare' }),
    s('exhaust', '一度きりの知恵', [fx({ id: 'draw', value: 3, target: 'self' })], { drawbacks: [DB('exhaust'), DB('selfDamage', { value: 2, timing: 'play' })] }),
    s('wither', '枯らす', [fx({ id: 'wither', value: 2 })]),
    s('grant', '加護', [fx({ id: 'grantKeyword', option: 'deathtouch', target: 'chosen' })]),
  ];
  const counts: Record<string, number> = {
    tok: 2, dt: 2, doom: 1, fight: 1, pump: 1, train: 1, loot: 1, scry: 1, sac: 1, wall: 2, leech: 2,
    knight: 2, samurai: 2, ghost: 2, rush: 1, ready: 2, purge: 1, double: 2, exhaust: 1, wither: 1, grant: 1,
  };
  const deck = { v: 1 as const, id: 'mtg2', name: 'MTG2', entries: Object.entries(counts).map(([cardId, count]) => ({ cardId, count })) };

  it('カードとデッキはすべて作れる', () => {
    for (const c of cards) expect(analyzeCard(c).violations, c.name).toEqual([]);
    expect(analyzeDeck(deck, new Map(cards.map((c) => [c.id, c]))).violations).toEqual([]);
  });

  for (const level of ['easy', 'normal'] as const) {
    it(`${ai.CPU_LEVEL_LABEL[level]}：プリセットと最後まで不正な行動なしで戦える`, () => {
      for (const seed of [3, 8]) {
        const r = battle.createGame({ seed, players: [{ name: 'MTG2', deck, cards }, { name: PRESET_DECKS[3]!.name, deck: PRESET_DECKS[3]!.deck, cards: PRESET_DECKS[3]!.cards }] });
        if (!r.ok) throw new Error(r.error);
        let g = r.state;
        let steps = 0;
        while (g.phase !== 'ended') {
          const p = g.phase === 'mulligan' ? (g.players[0].mulligan.done ? 1 : 0) : g.pending ? g.pending.player : g.active;
          const next = battle.applyAction(g, ai.cpuAction(g, p, steps, level));
          expect(next.ok, next.ok ? '' : next.error).toBe(true);
          if (!next.ok) return;
          g = next.state;
          expect(++steps).toBeLessThan(5000);
        }
        expect(g.result).not.toBeNull();
        expect(JSON.parse(JSON.stringify(g))).toEqual(g); // 状態は JSON にできる
      }
    });
  }
});
