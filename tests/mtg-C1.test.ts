// MTG 要素 ○ バッチC1（捨て札から使う・起動型能力・サイクリング／魂力・動的コスト）。倍率1で確かめる（表で書く）
import { describe, expect, it } from 'vitest';
import {
  ai,
  analyzeCard,
  analyzeDeck,
  battle,
  conditionMultiplier,
  conditionsFor,
  costConditions,
  createAbility,
  describeEffect,
  drawbackTimings,
  effectTimings,
  getAbility,
  getDrawback,
  getEffect,
  setAbilities,
  timingMultiplier,
  type AbilityInstance,
  type CardDef,
  type EffectInstance,
} from '../src/engine/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { EXAMPLES, card, codes } from './helpers.ts';
import { act, actError, fx, giveCard, M, monster, P, putMonster, rich, startGame } from './battle/helpers.ts';

type G = battle.GameState;
type PlayerId = battle.PlayerId;

let seq = 0;
const AB = (id: string, value?: number, extra: Partial<AbilityInstance> = {}): AbilityInstance => ({ id, ...(value === undefined ? {} : { value }), ...extra });
const SPELL = (effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id: `cs${++seq}`, name: `呪文${seq}`, rarity: 'legend', cost: 2, effects, ...extra });
const MON = (a: number, h: number, extra: Partial<CardDef> = {}) =>
  card({ id: `cm${++seq}`, name: `獣${seq}`, rarity: 'legend', cost: 2, stats: { attack: a, hp: h, defense: 0 }, ...extra });
const abilityPts = (c: CardDef, i = 0) => analyzeCard(c).points.lines.filter((l) => l.kind === 'ability')[i]!.value;
const effectPts = (c: CardDef, i = 0) => analyzeCard(c).points.lines.filter((l) => l.kind === 'effect')[i]!.value;
const total = (c: CardDef) => analyzeCard(c).points.total;
const vio = (c: CardDef) => codes(analyzeCard(c).violations);

const DMG5 = fx({ id: 'damage', value: 5 });
const DRAW1 = fx({ id: 'draw', value: 1, target: 'self' });

/** 捨て札にカードを置く（uid を返す） */
function toDiscard(g: G, p: PlayerId, def: CardDef): string {
  g.cards[`p${p}:${def.id}`] = def;
  const uid = `d${++seq}`;
  g.players[p].discard.push({ uid, cardId: `p${p}:${def.id}`, owner: p });
  return uid;
}
/** パワーを直接置く（uid を返す） */
function putPower(g: G, p: PlayerId, def: CardDef): string {
  const key = `p${p}:${def.id}`;
  g.cards[key] = def;
  const uid = `pw${++seq}`;
  g.players[p].powers.push({ uid, cardId: key, name: def.name, effects: def.effects.filter((e) => e.timing === 'activated').map((effect) => ({ effect, removed: false })), drawbacks: [] });
  return uid;
}
const play = (g: G, cardUid: string, extra: Partial<Extract<battle.Action, { type: 'playCard' }>> = {}) =>
  act(g, { type: 'playCard', player: g.active, cardUid, chosen: {}, ...extra });

// ---------------------------------------------------------------- 定義：ポイントとテキスト
describe('カードの能力（○ バッチC1）：ポイントとテキスト', () => {
  // [能力, カード, 能力のポイント, 能力の表示名, テキスト]
  const table: [string, CardDef, number, string, string][] = [
    ['flashback', SPELL([DMG5], { abilities: [AB('flashback', 0)] }), 8, 'フラッシュバック', '捨て札から使える。使ったら除外'],
    ['flashback+1', SPELL([DMG5], { abilities: [AB('flashback', 1)] }), 6, 'フラッシュバック+1', '捨て札から使える（コスト+1）。使ったら除外'],
    ['flashback+2', SPELL([DMG5], { abilities: [AB('flashback', 2)] }), 5, 'フラッシュバック+2', '捨て札から使える（コスト+2）。使ったら除外'],
    ['flashback（モンスター）', MON(2, 3, { abilities: [AB('flashback', 0)] }), 6, 'フラッシュバック', '捨て札から使える。使ったら除外'],
    ['jumpStart', SPELL([DMG5], { abilities: [AB('jumpStart')] }), 6, '再活', '捨て札から、手札を1枚捨てて使える。使ったら除外'],
    ['escape3', SPELL([DMG5], { abilities: [AB('escape', 3)] }), 12, '脱出3', '捨て札から、他の捨て札を3枚除外して使える（使ったあとはまた捨て札へ）'],
    ['escape5', SPELL([DMG5], { abilities: [AB('escape', 5)] }), 9, '脱出5', '捨て札から、他の捨て札を5枚除外して使える（使ったあとはまた捨て札へ）'],
    [
      'activate',
      MON(1, 2, { abilities: [AB('activate', 1)], effects: [fx({ id: 'damage', value: 1, timing: 'activated' })] }),
      0,
      '起動（エナジー1）',
      '場にいる間、自分のターンにエナジー1を払って「起動」の効果を使える（1ターン1回）',
    ],
    ['cycling', SPELL([DMG5], { abilities: [AB('cycling')] }), 2, 'サイクリング', '手札からエナジー1を払ってこのカードを捨て、カードを1枚引く'],
    [
      'channel',
      MON(3, 4, { abilities: [AB('channel', 1)], effects: [fx({ id: 'draw', value: 2, timing: 'channel', target: 'self' })] }),
      0,
      '魂力（エナジー1）',
      '手札からエナジー1を払ってこのカードを捨て、「魂力」の効果を使う',
    ],
    ['affinity', SPELL([DMG5], { cost: 4, abilities: [AB('affinity', undefined, { option: 'monsters' })] }), 12, '親和', '自分の場のモンスター1体につきコスト−1（最大−3、コストは1まで）'],
    [
      'affinity（使ったカード）',
      SPELL([DMG5], { cost: 3, abilities: [AB('affinity', undefined, { option: 'cardsPlayed' })] }),
      8,
      '親和',
      'このターン使ったカード1枚につきコスト−1（最大−3、コストは1まで）',
    ],
    ['costCut（怒濤）', SPELL([DMG5], { abilities: [AB('costCut', 1, { condition: 'notFirstCard' })] }), 8, '条件付き軽減1', 'このターン2枚目以降なら、コスト−1'],
    [
      'costCut（罠）',
      SPELL([DMG5], { abilities: [AB('costCut', 2, { condition: 'enemyPlayedMany' })] }),
      12,
      '条件付き軽減2',
      '前の相手のターンに相手がカードを3枚以上使っていれば、コスト−2',
    ],
    [
      'kicker',
      SPELL([DMG5, fx({ id: 'damage', value: 3, condition: 'kicked' })], { abilities: [AB('kicker', 1)] }),
      0,
      'キッカー1',
      '使うときにエナジーを追加で1払ってもよい（払えば「キッカーを払っていれば」の効果も出る）',
    ],
  ];
  it.each(table)('%s：ポイント・名前・テキスト・違反なし', (_label, c, pts, name, text) => {
    expect(analyzeCard(c).violations).toEqual([]);
    expect(abilityPts(c)).toBe(pts);
    expect(analyzeCard(c).text.abilities[0]).toEqual({ name, text: `${text}。` });
  });

  it('タイミング・条件の倍率（起動のエナジー・キッカーの追加エナジーで変わる）', () => {
    const act1 = { abilities: [AB('activate', 1)] };
    expect(timingMultiplier('activated', 'monster', undefined, act1)).toBe(2.2);
    expect(timingMultiplier('activated', 'monster', undefined, { abilities: [AB('activate', 2)] })).toBe(1.6);
    expect(timingMultiplier('activated', 'monster', undefined, { abilities: [AB('activate', 3)] })).toBe(1.1);
    expect(timingMultiplier('activated', 'spell', undefined, act1)).toBe(5.0);
    expect(timingMultiplier('activated', 'spell', undefined, { abilities: [AB('activate', 3)] })).toBe(2.4);
    expect(timingMultiplier('fromDiscard', 'spell')).toBe(0.8);
    expect(timingMultiplier('channel', 'monster')).toBe(1.0);
    expect(conditionMultiplier('kicked', { abilities: [AB('kicker', 1)] })).toBe(0.6);
    expect(conditionMultiplier('kicked', { abilities: [AB('kicker', 2)] })).toBe(0.45);
  });

  it('効果のテキスト：起動のエナジーは能力の行だけ（#117）・魂力はエナジーつき、捨て札から使ったとき・キッカー', () => {
    const c = MON(1, 2, { abilities: [AB('activate', 2)], effects: [fx({ id: 'damage', value: 2, timing: 'activated' })] });
    expect(analyzeCard(c).text.effects[0]).toBe('起動：相手1体に2ダメージを与える。');
    expect(analyzeCard(c).text.abilities.map((a) => a.name)).toEqual(['起動（エナジー2）']);
    const ch = SPELL([fx({ id: 'draw', value: 2, timing: 'channel', target: 'self' })], { abilities: [AB('channel', 0)] });
    expect(analyzeCard(ch).text.effects[0]).toBe('魂力（エナジー0）：カードを2枚引く。');
    expect(describeEffect(fx({ id: 'damage', value: 3, timing: 'fromDiscard' }))).toBe('捨て札から使ったとき、相手1体に3ダメージを与える。');
    expect(describeEffect(fx({ id: 'damage', value: 3, condition: 'kicked' }))).toBe('キッカーを払っていれば、相手1体に3ダメージを与える。');
  });

  it('捨て札から使ったときの効果があるカードのフラッシュバックは、本体×率＋固定（効果は別に数える）', () => {
    const c = SPELL([DRAW1, fx({ id: 'damage', value: 5, timing: 'fromDiscard' })], { abilities: [AB('flashback', 0)] });
    expect(analyzeCard(c).violations).toEqual([]);
    expect(effectPts(c, 1)).toBe(12); // 15×0.8
    expect(abilityPts(c)).toBe(1);
  });

  it('魂力の二者択一の割引：高い方＋低い方×0.3', () => {
    const c = MON(3, 4, { cost: 1, rarity: 'rare', abilities: [AB('channel', 1)], effects: [fx({ id: 'draw', value: 2, timing: 'channel', target: 'self' })] });
    const lines = analyzeCard(c).points.lines;
    expect(lines.find((l) => l.label.startsWith('二者択一'))!.value).toBe(-5); // 8×0.7＝5.6 → 切り捨て5
    expect(total(c) + 10).toBe(18); // 15＋8×0.3＝17.4 → 18（コスト1の差し引き10を戻す）
  });
});

describe('価格の確かめ（仕様の例・倍率1）', () => {
  it('フラッシュバック：相手1体に5ダメージ（コスト2コモンに収まる）', () => {
    const c = card({ id: 'fbp', name: '火の雨', cost: 2, effects: [DMG5], abilities: [AB('flashback', 0)] });
    expect(total(c) + 20).toBe(23);
    expect(analyzeCard(c).violations).toEqual([]);
  });
  it('起動（エナジー1）：相手1体に2ダメージのパワー＝30（コスト2エピック）', () => {
    const c = card({ id: 'act', name: '砲台', rarity: 'epic', cost: 2, effects: [fx({ id: 'damage', value: 2, timing: 'activated' })], abilities: [AB('activate', 1)] });
    expect(effectPts(c)).toBe(30);
    expect(analyzeCard(c).cardType).toBe('power');
    expect(analyzeCard(c).violations).toEqual([]);
  });
  it('親和（場のモンスター）コスト4＝12、怒濤 K1＝8、キッカー1 の「払っていれば5ダメージ」＝9', () => {
    expect(abilityPts(SPELL([DMG5], { cost: 4, abilities: [AB('affinity')] }))).toBe(12);
    expect(abilityPts(SPELL([DMG5], { abilities: [AB('costCut', 1, { condition: 'notFirstCard' })] }))).toBe(8);
    expect(effectPts(SPELL([fx({ id: 'damage', value: 5, condition: 'kicked' })], { abilities: [AB('kicker', 1)] }))).toBe(9);
  });
});

// ---------------------------------------------------------------- 検証
describe('検証（○ バッチC1）', () => {
  const ACT = fx({ id: 'damage', value: 1, timing: 'activated' });
  const table: [string, CardDef, string][] = [
    ['捨て札から使ったときの効果に、捨て札から使う能力が無い', SPELL([DRAW1, fx({ id: 'damage', value: 1, timing: 'fromDiscard' })]), 'FROM_DISCARD_WITHOUT_ABILITY'],
    ['起動の効果に、起動の能力が無い', MON(1, 2, { effects: [ACT] }), 'ACTIVATE_MISMATCH'],
    ['起動の能力に、起動の効果が無い', MON(1, 2, { abilities: [AB('activate', 1)] }), 'ACTIVATE_MISMATCH'],
    ['魂力の能力に、魂力の効果が無い', SPELL([DMG5], { abilities: [AB('channel', 1)] }), 'CHANNEL_MISMATCH'],
    ['魂力の効果に、魂力の能力が無い', SPELL([DMG5, fx({ id: 'draw', value: 1, timing: 'channel', target: 'self' })]), 'CHANNEL_MISMATCH'],
    ['キッカーを払っていればの条件に、キッカーが無い', SPELL([DMG5, fx({ id: 'damage', value: 1, condition: 'kicked' })]), 'KICKER_MISMATCH'],
    ['キッカーに、払っていればの効果が無い', SPELL([DMG5], { abilities: [AB('kicker', 1)] }), 'KICKER_MISMATCH'],
    ['サイクリングと魂力は同時に付けられない', SPELL([DMG5, fx({ id: 'draw', value: 1, timing: 'channel', target: 'self' })], { abilities: [AB('cycling'), AB('channel', 1)] }), 'ABILITY_CONFLICT'],
    ['フラッシュバックと脱出は同時に付けられない', SPELL([DMG5], { abilities: [AB('flashback', 0), AB('escape', 3)] }), 'ABILITY_CONFLICT'],
    ['フラッシュバックと廃棄は同時に付けられない', SPELL([DMG5], { abilities: [AB('flashback', 0)], drawbacks: [{ id: 'exhaust', timing: null }] }), 'ABILITY_CONFLICT'],
    ['親和は印刷コスト2以上', SPELL([DMG5], { cost: 1, abilities: [AB('affinity')] }), 'AFFINITY_LOW_COST'],
    ['条件付き軽減の条件が無い', SPELL([DMG5], { abilities: [AB('costCut', 1)] }), 'COST_CUT_CONDITION'],
    ['条件付き軽減にコイン投げは使えない', SPELL([DMG5], { abilities: [AB('costCut', 1, { condition: 'coinFlip' })] }), 'COST_CUT_CONDITION'],
    ['条件付き軽減に濫用は使えない', SPELL([DMG5], { abilities: [AB('costCut', 1, { condition: 'exploit' })] }), 'COST_CUT_CONDITION'],
    ['ほかの能力に条件は付けない', SPELL([DMG5], { abilities: [AB('cycling', undefined, { condition: 'lowHp' })] }), 'ABILITY_CONDITION'],
    ['起動の値は1〜3', MON(1, 2, { abilities: [AB('activate', 4)], effects: [ACT] }), 'ABILITY_VALUE'],
    ['脱出の値は2〜5', SPELL([DMG5], { abilities: [AB('escape', 1)] }), 'ABILITY_VALUE'],
    ['脱出はレア以上', SPELL([DMG5], { rarity: 'common', abilities: [AB('escape', 3)] }), 'ABILITY_RARITY'],
    ['起動のタイミングはデメリットに使えない', MON(1, 2, { abilities: [AB('activate', 1)], effects: [ACT], drawbacks: [{ id: 'selfDamage', value: 1, timing: 'activated' }] }), 'DRAWBACK_TIMING'],
  ];
  it.each(table)('%s', (_label, c, code) => {
    expect(vio(c)).toContain(code);
  });

  it('作成例4枚は引き続き作れる', () => {
    for (const c of Object.values(EXAMPLES)) expect(analyzeCard(c).violations, c.name).toEqual([]);
  });
});

describe('エディターの補助（○ バッチC1）', () => {
  const dmg = getEffect('damage')!;
  it('起動・魂力・捨て札から使ったときは、その能力があるときだけ選べる。デメリットには出ない', () => {
    expect(effectTimings(dmg, 'monster')).not.toContain('activated');
    expect(effectTimings(dmg, 'monster', [AB('activate', 1)])).toContain('activated');
    expect(effectTimings(dmg, 'spell', [AB('channel', 1)])).toContain('channel');
    expect(effectTimings(dmg, 'spell', [AB('escape', 3)])).toContain('fromDiscard');
    expect(drawbackTimings(getDrawback('selfDamage')!, 'monster')).not.toContain('activated');
  });
  it('「キッカーを払っていれば」はキッカーがあるときだけ。条件付き軽減に使える条件から乱数・選択のものを除く', () => {
    expect(conditionsFor('play', 'spell')).not.toContain('kicked');
    expect(conditionsFor('play', 'spell', [AB('kicker', 1)])).toContain('kicked');
    const cc = costConditions();
    for (const id of ['coinFlip', 'clash', 'exploit', 'kicked', 'veteran', 'strongerAlly'] as const) expect(cc).not.toContain(id);
    expect(cc).toContain('notFirstCard');
    expect(cc).toContain('enemyPlayedMany');
  });
  it('createAbility：条件付き軽減は怒濤の条件で始まる。setAbilities は能力が無くなった効果を合わせ直す', () => {
    expect(createAbility('costCut')).toEqual({ id: 'costCut', value: 1, condition: 'notFirstCard' });
    expect(createAbility('flashback')).toEqual({ id: 'flashback', value: 0 });
    const c = MON(1, 2, { abilities: [AB('activate', 1)], effects: [fx({ id: 'damage', value: 1, timing: 'activated' })] });
    const removed = setAbilities(c, []);
    expect(removed.effects[0]!.timing).toBe('summon');
    expect('abilities' in removed).toBe(false);
    const kicked = SPELL([fx({ id: 'damage', value: 1, condition: 'kicked' })], { abilities: [AB('kicker', 1)] });
    expect(setAbilities(kicked, []).effects[0]!.condition).toBeNull();
  });
  it('能力の定義：レジストリに9つ追加され、balance.ts に値がある', () => {
    for (const id of ['flashback', 'jumpStart', 'escape', 'activate', 'cycling', 'channel', 'affinity', 'costCut', 'kicker']) expect(getAbility(id), id).toBeDefined();
  });
});

// ---------------------------------------------------------------- 対戦：捨て札から使う
describe('捨て札から使う（フラッシュバック・再活・脱出）', () => {
  it('フラッシュバック：手札から使えば捨て札へ。捨て札からはコスト+N で使え、使ったら除外。使った枚数に数える', () => {
    const fb = SPELL([fx({ id: 'damage', value: 3, target: 'enemyPlayer' })], { cost: 1, abilities: [AB('flashback', 1)] });
    let g = rich(startGame(), 0, 10);
    const uid = giveCard(g, 0, fb);
    g = play(g, uid);
    expect(g.players[0].discard.map((c) => c.uid)).toContain(uid);
    const hp = g.players[1].hp;
    const info = battle.playInfo(g, 0, g.players[0].discard.find((c) => c.uid === uid)!, { from: 'discard' });
    expect(info.cost).toBe(2);
    expect(info.blocked).toBeNull();
    expect(info.breakdown!.steps).toEqual([{ label: 'フラッシュバック', delta: 1 }]);
    const e = g.players[0].energy;
    g = play(g, uid, { from: 'discard' });
    expect(g.players[0].energy).toBe(e - 2);
    expect(g.players[1].hp).toBe(hp - 3);
    expect(g.players[0].exile.map((c) => c.uid)).toContain(uid);
    expect(g.players[0].discard.map((c) => c.uid)).not.toContain(uid);
    expect(g.players[0].turn.cardsPlayed).toBe(2);
    // 手札から使うときは捨て札から使う指定はできない／捨て札に無いものは使えない
    expect(actError(g, { type: 'playCard', player: 0, cardUid: uid, from: 'discard' })).toContain('捨て札にありません');
  });

  it('フラッシュバックのモンスターは、場を離れるとき除外（破壊・バウンス）', () => {
    const m = MON(1, 1, { cost: 1, abilities: [AB('flashback', 0)] });
    /** 捨て札から出して、相手の場に移す（自分のカードで対象にするため。持ち主は自分のまま） */
    const setup = () => {
      let g = rich(startGame(), 0, 10);
      const uid = toDiscard(g, 0, m);
      g = play(g, uid, { from: 'discard' });
      const mon = monster(g, uid)!;
      expect(mon.card.exileOnLeave).toBe(true);
      g.players[0].board = g.players[0].board.filter((x) => x.uid !== uid);
      mon.controller = 1;
      g.players[1].board.push(mon);
      return { g, uid };
    };
    const a = setup();
    const k = giveCard(a.g, 0, SPELL([fx({ id: 'damage', value: 5 })], { cost: 0 }));
    const g1 = act(a.g, { type: 'playCard', player: 0, cardUid: k, chosen: { enemy: M(a.uid) } });
    expect(g1.players[0].exile.map((c) => c.uid)).toContain(a.uid);
    expect(g1.players[0].discard.map((c) => c.uid)).not.toContain(a.uid);
    const b = setup();
    const bo = giveCard(b.g, 0, SPELL([fx({ id: 'bounce', value: 5 })], { cost: 0 }));
    const g2 = act(b.g, { type: 'playCard', player: 0, cardUid: bo, chosen: { enemy: M(b.uid) } });
    expect(g2.players[0].exile.map((c) => c.uid)).toContain(b.uid);
    expect(g2.players[0].hand.map((c) => c.uid)).not.toContain(b.uid);
  });

  it('再活：手札が無いと使えない。使うと選んだ手札を捨て、使ったら除外', () => {
    const js = SPELL([fx({ id: 'heal', value: 2, target: 'self' })], { cost: 1, abilities: [AB('jumpStart')] });
    let g = rich(startGame(), 0, 10);
    const uid = toDiscard(g, 0, js);
    g.players[0].hand = [];
    const card0 = g.players[0].discard.find((c) => c.uid === uid)!;
    expect(battle.playInfo(g, 0, card0, { from: 'discard' }).blocked).toContain('捨てる手札がありません');
    expect(actError(g, { type: 'playCard', player: 0, cardUid: uid, from: 'discard' })).toContain('捨てる手札');
    const fodder = giveCard(g, 0, SPELL([DRAW1], { cost: 5 }));
    const info = battle.playInfo(g, 0, card0, { from: 'discard' });
    expect(info.fromDiscard?.discardDefault).toBe(fodder);
    expect(actError(g, { type: 'playCard', player: 0, cardUid: uid, from: 'discard' })).toContain('捨てる手札を選んで');
    g = play(g, uid, { from: 'discard', discardUid: fodder });
    expect(g.players[0].discard.map((c) => c.uid)).toContain(fodder);
    expect(g.players[0].exile.map((c) => c.uid)).toContain(uid);
  });

  it('脱出：他の捨て札をちょうど N 枚除外して使い、また捨て札に戻る', () => {
    const es = SPELL([fx({ id: 'damage', value: 2, target: 'enemyPlayer' })], { cost: 1, rarity: 'rare', abilities: [AB('escape', 2)] });
    let g = rich(startGame(), 0, 10);
    const uid = toDiscard(g, 0, es);
    const o1 = toDiscard(g, 0, SPELL([DRAW1]));
    const card0 = g.players[0].discard.find((c) => c.uid === uid)!;
    expect(battle.playInfo(g, 0, card0, { from: 'discard' }).blocked).toContain('2枚ありません');
    const o2 = toDiscard(g, 0, SPELL([DRAW1]));
    expect(battle.playInfo(g, 0, card0, { from: 'discard' }).fromDiscard?.exileDefaults).toEqual([o1, o2]);
    expect(actError(g, { type: 'playCard', player: 0, cardUid: uid, from: 'discard', exileUids: [o1] })).toContain('2枚選んで');
    expect(actError(g, { type: 'playCard', player: 0, cardUid: uid, from: 'discard', exileUids: [o1, o1] })).toContain('2回');
    expect(actError(g, { type: 'playCard', player: 0, cardUid: uid, from: 'discard', exileUids: [o1, uid] })).toBeTruthy();
    g = play(g, uid, { from: 'discard', exileUids: [o1, o2] });
    expect(g.players[0].exile.map((c) => c.uid)).toEqual(expect.arrayContaining([o1, o2]));
    expect(g.players[0].discard.map((c) => c.uid)).toContain(uid);
  });

  it('捨て札から使ったときの効果（余波）：捨て札から使ったときだけ出て、使用時の効果の代わりになる', () => {
    const af = SPELL([fx({ id: 'heal', value: 1, target: 'self' }), fx({ id: 'damage', value: 4, timing: 'fromDiscard' })], {
      cost: 1,
      abilities: [AB('flashback', 0)],
    });
    expect(analyzeCard(af).violations).toEqual([]);
    let g = rich(startGame(), 0, 10);
    g.players[0].hp -= 10;
    const uid = giveCard(g, 0, af);
    const hp1 = g.players[1].hp;
    const myHp = g.players[0].hp;
    g = play(g, uid);
    expect(g.players[1].hp).toBe(hp1); // 手札からは出ない
    expect(g.players[0].hp).toBe(myHp + 1);
    g = play(g, uid, { from: 'discard', chosen: { enemy: P(1) } });
    expect(g.players[1].hp).toBe(hp1 - 4);
    expect(g.players[0].hp).toBe(myHp + 1); // 使用時の効果は出ない
  });

  it('捨て札から使える能力が無いカードは捨て札から使えない。ノイズも', () => {
    let g = rich(startGame(), 0, 10);
    const uid = toDiscard(g, 0, SPELL([DRAW1]));
    expect(actError(g, { type: 'playCard', player: 0, cardUid: uid, from: 'discard' })).toContain('捨て札から使えません');
    g.players[0].discard.push({ uid: 'nz', cardId: battle.NOISE_CARD_ID, owner: 0 });
    expect(actError(g, { type: 'playCard', player: 0, cardUid: 'nz', from: 'discard' })).toContain('ノイズ');
  });
});

// ---------------------------------------------------------------- 対戦：起動
describe('起動', () => {
  const TURRET = () => MON(1, 3, { cost: 1, abilities: [AB('activate', 1)], effects: [fx({ id: 'damage', value: 2, timing: 'activated', target: 'enemyPlayer' })] });

  it('エナジーを払って1ターン1回。カードを使ったことには数えない。召喚したターンも使える', () => {
    let g = rich(startGame(), 0, 3);
    const uid = giveCard(g, 0, TURRET());
    g = act(g, { type: 'playCard', player: 0, cardUid: uid, chosen: {} });
    const played = g.players[0].turn.cardsPlayed;
    const hp = g.players[1].hp;
    const info = battle.activateInfo(g, 0, uid)!;
    expect(info.blocked).toBeNull();
    expect(info.cost).toBe(1);
    g = act(g, { type: 'activate', player: 0, sourceUid: uid });
    expect(g.players[1].hp).toBe(hp - 2);
    expect(g.players[0].energy).toBe(1);
    expect(g.players[0].turn.cardsPlayed).toBe(played);
    expect(g.log.some((e) => e.ev?.kind === 'activate' && e.ev.uid === uid)).toBe(true);
    expect(actError(g, { type: 'activate', player: 0, sourceUid: uid })).toContain('もう起動しました');
    expect(battle.activateInfo(g, 0, uid)!.blocked).toContain('1ターン1回');
  });

  it('エナジー不足・封印・相手のターンは起動できない。起動の能力の無いものは null', () => {
    const g = rich(startGame(), 0, 0);
    const uid = putMonster(g, 0, TURRET());
    expect(actError(g, { type: 'activate', player: 0, sourceUid: uid })).toContain('エナジーが足りません');
    g.players[0].energy = 5;
    g.players[0].board[0]!.sealed = true;
    expect(actError(g, { type: 'activate', player: 0, sourceUid: uid })).toContain('封印');
    const plain = putMonster(g, 0, MON(1, 1));
    expect(battle.activateInfo(g, 0, plain)).toBeNull();
    const opp = putMonster(g, 1, TURRET());
    expect(actError(g, { type: 'activate', player: 0, sourceUid: opp })).toBeTruthy();
    expect(actError(g, { type: 'activate', player: 1, sourceUid: opp })).toContain('自分のターンではありません');
  });

  it('封殺は起動に掛からない。「カードを使うたび」も出ない', () => {
    let g = rich(startGame(), 0, 5);
    const uid = putMonster(g, 0, TURRET());
    g.players[0].quash = { kind: 'any', until: 99 };
    const hp = g.players[1].hp;
    g = act(g, { type: 'activate', player: 0, sourceUid: uid });
    expect(g.players[1].hp).toBe(hp - 2);
    expect(g.players[0].quash).toBeDefined();
  });

  it('対象を選ぶ起動。奪ったモンスターの起動も使える（今の持ち主）', () => {
    const sniper = MON(1, 3, { abilities: [AB('activate', 2)], effects: [fx({ id: 'damage', value: 3, timing: 'activated' })] });
    let g = rich(startGame(), 0, 5);
    const target = putMonster(g, 1, MON(1, 5));
    const uid = putMonster(g, 1, sniper);
    // 奪う
    const m = g.players[1].board.find((x) => x.uid === uid)!;
    g.players[1].board = g.players[1].board.filter((x) => x.uid !== uid);
    m.controller = 0;
    g.players[0].board.push(m);
    const info = battle.activateInfo(g, 0, uid)!;
    expect(info.enemyTargets.map((t) => (t.kind === 'monster' ? t.uid : 'p'))).toEqual(['p', target]);
    expect(actError(g, { type: 'activate', player: 0, sourceUid: uid })).toContain('対象を選んで');
    g = act(g, { type: 'activate', player: 0, sourceUid: uid, chosen: { enemy: M(target) } });
    expect(monster(g, target)!.hp).toBe(2);
    expect(g.players[0].energy).toBe(3);
  });

  it('パワーの起動（解除されたら使えない）', () => {
    const totem = card({ id: 'totem', name: '砲台', rarity: 'epic', cost: 2, effects: [fx({ id: 'damage', value: 2, timing: 'activated', target: 'enemyPlayer' })], abilities: [AB('activate', 1)] });
    let g = rich(startGame(), 0, 5);
    const uid = giveCard(g, 0, totem);
    g = act(g, { type: 'playCard', player: 0, cardUid: uid, chosen: {} });
    const pw = g.players[0].powers.find((x) => x.name === '砲台')!;
    const hp = g.players[1].hp;
    g = act(g, { type: 'activate', player: 0, sourceUid: pw.uid });
    expect(g.players[1].hp).toBe(hp - 2);
    const h = rich(startGame(), 0, 5);
    const pid = putPower(h, 0, totem);
    h.players[0].powers[0]!.effects[0]!.removed = true;
    expect(battle.activateInfo(h, 0, pid)!.blocked).toContain('解除');
  });

  it('護法の相手を対象にすると起動のエナジー+N', () => {
    const sniper = MON(1, 3, { abilities: [AB('activate', 1)], effects: [fx({ id: 'damage', value: 1, timing: 'activated' })] });
    const g = rich(startGame(), 0, 1);
    const uid = putMonster(g, 0, sniper);
    const w = putMonster(g, 1, MON(1, 5, { keywords: [{ id: 'ward', value: 1 }] }));
    const info = battle.activateInfo(g, 0, uid)!;
    expect(info.targetCosts?.[w]).toBe(2);
    expect(actError(g, { type: 'activate', player: 0, sourceUid: uid, chosen: { enemy: M(w) } })).toContain('護法');
    expect(battle.legalActions(g, 0).some((a) => a.type === 'activate' && a.chosen?.enemy?.kind === 'monster')).toBe(false);
  });
});

// ---------------------------------------------------------------- 対戦：サイクリング・魂力
describe('サイクリング・魂力', () => {
  it('サイクリング：エナジー1で捨てて1枚引く。使った枚数は増えない', () => {
    let g = rich(startGame(), 0, 3);
    const uid = giveCard(g, 0, SPELL([DMG5], { cost: 5, abilities: [AB('cycling')] }));
    const hand = g.players[0].hand.length;
    g = act(g, { type: 'handAbility', player: 0, cardUid: uid, ability: 'cycling' });
    expect(g.players[0].energy).toBe(2);
    expect(g.players[0].discard.map((c) => c.uid)).toContain(uid);
    expect(g.players[0].hand.length).toBe(hand); // 1枚捨てて1枚引いた
    expect(g.players[0].turn.cardsPlayed).toBe(0);
    expect(g.log.some((e) => e.ev?.kind === 'handAbility' && e.ev.status === 'cycling')).toBe(true);
  });

  it('魂力：エナジーNで捨てて魂力の効果。対象も選べる。持っていない能力・知らない能力は拒否', () => {
    const ch = MON(3, 4, { abilities: [AB('channel', 1)], effects: [fx({ id: 'damage', value: 3, timing: 'channel' })] });
    let g = rich(startGame(), 0, 3);
    const t = putMonster(g, 1, MON(1, 5));
    const uid = giveCard(g, 0, ch);
    expect(actError(g, { type: 'handAbility', player: 0, cardUid: uid, ability: 'cycling' })).toContain('サイクリングがありません');
    expect(actError(g, { type: 'handAbility', player: 0, cardUid: uid, ability: 'channel' })).toContain('対象を選んで');
    const info = battle.handAbilityInfo(g, 0, g.players[0].hand.find((c) => c.uid === uid)!, 'channel')!;
    expect(info.allyTargets).toEqual([]);
    expect(info.enemyTargets.length).toBe(2);
    g = act(g, { type: 'handAbility', player: 0, cardUid: uid, ability: 'channel', chosen: { enemy: M(t) } });
    expect(monster(g, t)!.hp).toBe(2);
    expect(g.players[0].energy).toBe(2);
    expect(g.players[0].board.some((m) => m.uid === uid)).toBe(false);
    expect(g.players[0].discard.map((c) => c.uid)).toContain(uid);
    expect(g.players[0].turn.cardsPlayed).toBe(0);
    expect(actError(g, { type: 'handAbility', player: 0, cardUid: 'zzz', ability: 'channel' })).toContain('手札にありません');
  });
});

// ---------------------------------------------------------------- 動的コスト
describe('動的コスト（親和・条件付き軽減・キッカー）', () => {
  it('親和：場のモンスター1体につき−1、最大−3、最低1。内訳つき', () => {
    const g = rich(startGame(), 0, 10);
    const uid = giveCard(g, 0, SPELL([DMG5], { cost: 5, abilities: [AB('affinity')] }));
    const c = g.players[0].hand.find((x) => x.uid === uid)!;
    expect(battle.effectiveCost(g, 0, c)).toBe(5);
    putMonster(g, 0, MON(1, 1));
    putMonster(g, 0, MON(1, 1));
    expect(battle.costBreakdown(g, 0, c)).toEqual({ printed: 5, steps: [{ label: '親和', delta: -2 }], total: 3 });
    putMonster(g, 0, MON(1, 1));
    putMonster(g, 0, MON(1, 1));
    expect(battle.effectiveCost(g, 0, c)).toBe(2); // 最大−3
    const cheap = giveCard(g, 0, SPELL([DMG5], { cost: 2, abilities: [AB('affinity')] }));
    expect(battle.effectiveCost(g, 0, g.players[0].hand.find((x) => x.uid === cheap)!)).toBe(1); // 最低1
  });

  it('親和（使ったカード）：これから使う1枚は数えない', () => {
    let g = rich(startGame(), 0, 10);
    const uid = giveCard(g, 0, SPELL([DMG5], { cost: 3, abilities: [AB('affinity', undefined, { option: 'cardsPlayed' })] }));
    const c = () => g.players[0].hand.find((x) => x.uid === uid)!;
    expect(battle.effectiveCost(g, 0, c())).toBe(3);
    g = act(g, { type: 'playCard', player: 0, cardUid: giveCard(g, 0, SPELL([DRAW1], { cost: 0 })), chosen: {} });
    expect(battle.effectiveCost(g, 0, c())).toBe(2);
  });

  it('条件付き軽減：条件を満たすとコスト−K（0まで）。怒濤は2枚目から', () => {
    let g = rich(startGame(), 0, 10);
    const uid = giveCard(g, 0, SPELL([DMG5], { cost: 1, abilities: [AB('costCut', 2, { condition: 'notFirstCard' })] }));
    const c = () => g.players[0].hand.find((x) => x.uid === uid)!;
    expect(battle.effectiveCost(g, 0, c())).toBe(1);
    g = act(g, { type: 'playCard', player: 0, cardUid: giveCard(g, 0, SPELL([DRAW1], { cost: 0 })), chosen: {} });
    expect(battle.costBreakdown(g, 0, c())).toEqual({ printed: 1, steps: [{ label: '条件付き軽減', delta: -1 }], total: 0 });
  });

  it('条件付き軽減と親和を両方持てば、大きい方の下限（1）で止まる。凍結・軽減効果と組み合わさる', () => {
    const g = rich(startGame(), 0, 10);
    const uid = giveCard(g, 0, SPELL([DMG5], { cost: 4, abilities: [AB('affinity'), AB('costCut', 2, { condition: 'hasMonster' })] }));
    const c = () => g.players[0].hand.find((x) => x.uid === uid)!;
    putMonster(g, 0, MON(1, 1));
    expect(battle.effectiveCost(g, 0, c())).toBe(1); // 4−1−2
    putMonster(g, 0, MON(1, 1));
    expect(battle.costBreakdown(g, 0, c()).steps).toEqual([
      { label: '親和', delta: -2 },
      { label: '条件付き軽減', delta: -1 },
    ]);
    g.players[0].turn.freezeTax = true;
    expect(battle.costBreakdown(g, 0, c()).steps.map((s) => s.label)).toEqual(['親和', '条件付き軽減', '凍結']);
    expect(battle.effectiveCost(g, 0, c())).toBe(2);
    g.players[0].discount = 1;
    expect(battle.effectiveCost(g, 0, c())).toBe(1);
  });

  it('キッカー：払えば追加エナジーと「払っていれば」の効果。払わなければ出ない。legal は両方を返す', () => {
    const k = SPELL([fx({ id: 'damage', value: 2, target: 'enemyPlayer' }), fx({ id: 'damage', value: 3, target: 'enemyPlayer', condition: 'kicked' })], {
      cost: 1,
      abilities: [AB('kicker', 1)],
    });
    let g = rich(startGame(), 0, 2);
    const uid = giveCard(g, 0, k);
    const info = battle.playInfo(g, 0, g.players[0].hand.find((x) => x.uid === uid)!);
    expect(info.kicker).toEqual({ extra: 1, payable: true });
    const plays = battle.legalActions(g, 0).filter((a) => a.type === 'playCard' && a.cardUid === uid);
    expect(plays.map((a) => (a.type === 'playCard' ? (a.kick ?? false) : null))).toEqual([false, true]);
    const hp = g.players[1].hp;
    const kicked = act(g, { type: 'playCard', player: 0, cardUid: uid, kick: true });
    expect(kicked.players[1].hp).toBe(hp - 5);
    expect(kicked.players[0].energy).toBe(0);
    g = act(g, { type: 'playCard', player: 0, cardUid: uid });
    expect(g.players[1].hp).toBe(hp - 2);
    expect(g.players[0].energy).toBe(1);
    // キッカーの無いカードで kick は拒否
    const h = rich(startGame(), 0, 5);
    const plain = giveCard(h, 0, SPELL([DRAW1]));
    expect(actError(h, { type: 'playCard', player: 0, cardUid: plain, kick: true })).toContain('キッカーがありません');
  });

  it('護法と組み合わせた実コスト（キッカー＋護法）', () => {
    const k = SPELL([fx({ id: 'damage', value: 1 }), fx({ id: 'damage', value: 1, condition: 'kicked' })], { cost: 1, abilities: [AB('kicker', 1)] });
    const g = rich(startGame(), 0, 3);
    const uid = giveCard(g, 0, k);
    const w = putMonster(g, 1, MON(1, 5, { keywords: [{ id: 'ward', value: 1 }] }));
    const c = g.players[0].hand.find((x) => x.uid === uid)!;
    expect(battle.costBreakdown(g, 0, c, { chosen: { enemy: M(w) }, kick: true })).toEqual({
      printed: 1,
      steps: [
        { label: 'キッカー', delta: 1 },
        { label: '護法', delta: 1 },
      ],
      total: 3,
    });
    expect(battle.costNotes(battle.costBreakdown(g, 0, c, { chosen: { enemy: M(w) }, kick: true }))).toBe('キッカーで+1、護法で+1');
  });
});

// ---------------------------------------------------------------- legalActions と validateAction
describe('legalActions は validateAction と食い違わない（総当たり）', () => {
  it('新しい行動を含む盤面で、返す行動はすべて合法', () => {
    const g = rich(startGame(), 0, 6);
    putMonster(g, 0, MON(2, 3, { abilities: [AB('activate', 1)], effects: [fx({ id: 'damage', value: 1, timing: 'activated' })] }));
    putMonster(g, 1, MON(1, 3));
    putMonster(g, 1, MON(1, 3, { keywords: [{ id: 'ward', value: 2 }] }));
    giveCard(g, 0, SPELL([DMG5, fx({ id: 'damage', value: 1, condition: 'kicked' })], { cost: 2, abilities: [AB('kicker', 2)] }));
    giveCard(g, 0, SPELL([DMG5], { cost: 1, abilities: [AB('cycling')] }));
    giveCard(g, 0, MON(1, 1, { abilities: [AB('channel', 0)], effects: [fx({ id: 'damage', value: 1, timing: 'channel' })] }));
    toDiscard(g, 0, SPELL([DMG5], { cost: 1, abilities: [AB('flashback', 1)] }));
    toDiscard(g, 0, SPELL([DMG5], { cost: 1, abilities: [AB('jumpStart')] }));
    toDiscard(g, 0, SPELL([DMG5], { cost: 1, rarity: 'rare', abilities: [AB('escape', 2)] }));
    const actions = battle.legalActions(g, 0);
    for (const a of actions) expect(battle.validateAction(g, a), JSON.stringify(a)).toBeNull();
    const kinds = new Set(actions.map((a) => (a.type === 'playCard' ? `${a.type}:${a.from ?? 'hand'}:${a.kick ? 'k' : ''}` : a.type)));
    for (const k of ['playCard:hand:', 'playCard:hand:k', 'playCard:discard:', 'activate', 'handAbility']) expect(kinds, k).toContain(k);
    // 実行もできる
    for (const a of actions) expect(battle.applyAction(g, a).ok, JSON.stringify(a)).toBe(true);
  });
});

// ---------------------------------------------------------------- CPU
describe('CPU（○ バッチC1）', () => {
  it('ほかにやることが無ければ、使えないカードをサイクリングで回す', () => {
    const g = rich(startGame(), 0, 1);
    g.players[0].hand = [];
    const uid = giveCard(g, 0, SPELL([DMG5], { cost: 5, abilities: [AB('cycling')] }));
    for (const level of ai.CPU_LEVELS) expect(ai.cpuAction(g, 0, 1, level), level).toEqual({ type: 'handAbility', player: 0, cardUid: uid, ability: 'cycling', chosen: {} });
  });

  it('得になる起動・捨て札からのカードを使う', () => {
    const g = rich(startGame(), 0, 3);
    g.players[0].hand = [];
    g.players[1].hp = 2;
    putMonster(g, 0, MON(0, 3, { abilities: [AB('activate', 1)], effects: [fx({ id: 'damage', value: 2, timing: 'activated', target: 'enemyPlayer' })] }));
    for (const level of ai.CPU_LEVELS) expect(ai.cpuAction(g, 0, 1, level).type, level).toBe('activate');
    const h = rich(startGame(), 0, 3);
    h.players[0].hand = [];
    h.players[1].hp = 3;
    const fb = toDiscard(h, 0, SPELL([fx({ id: 'damage', value: 3, target: 'enemyPlayer' })], { cost: 1, abilities: [AB('flashback', 0)] }));
    for (const level of ai.CPU_LEVELS) expect(ai.cpuAction(h, 0, 1, level), level).toMatchObject({ type: 'playCard', cardUid: fb, from: 'discard' });
  });

  // 新要素を詰めた30枚のデッキ
  let n = 0;
  const m = (id: string, name: string, a: number, h: number, extra: Partial<CardDef> = {}) =>
    card({ id, name: name || `c${++n}`, rarity: 'common', cost: 2, stats: { attack: a, hp: h, defense: 0 }, ...extra });
  const s = (id: string, name: string, effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id, name, rarity: 'common', cost: 2, effects, ...extra });
  const cards: CardDef[] = [
    s('fb', 'フラッシュの火', [fx({ id: 'damage', value: 4 })], { abilities: [AB('flashback', 1)] }),
    s('fbm', 'フラッシュの雨', [fx({ id: 'damage', value: 2, target: 'enemyMonsters' })], { cost: 3, abilities: [AB('flashback', 0)] }),
    m('fbmon', '帰ってくる狼', 2, 3, { abilities: [AB('flashback', 1)] }),
    s('js', '再活の薬', [fx({ id: 'heal', value: 3, target: 'self' }), fx({ id: 'draw', value: 1, target: 'self' })], { abilities: [AB('jumpStart')] }),
    s('es', '脱出の矢', [fx({ id: 'damage', value: 3 })], { rarity: 'rare', abilities: [AB('escape', 2)] }),
    s('af', '余波の刃', [fx({ id: 'draw', value: 1, target: 'self' }), fx({ id: 'damage', value: 4, timing: 'fromDiscard' })], { cost: 1, abilities: [AB('flashback', 0)] }),
    m('turret', '砲台ゴーレム', 1, 4, { abilities: [AB('activate', 1)], effects: [fx({ id: 'damage', value: 2, timing: 'activated' })] }),
    m('healer', '祈りの僧', 1, 3, { abilities: [AB('activate', 2)], effects: [fx({ id: 'heal', value: 2, timing: 'activated', target: 'self' })] }),
    s('totem', '雷のトーテム', [fx({ id: 'damage', value: 2, timing: 'activated', target: 'random' })], { rarity: 'epic', abilities: [AB('activate', 1)] }),
    s('cyc', '重い流星', [fx({ id: 'damage', value: 9 })], { rarity: 'epic', cost: 4, abilities: [AB('cycling')] }),
    m('cycm', '旅の巨人', 4, 6, { cost: 4, abilities: [AB('cycling')] }),
    m('chan', '魂の剣士', 3, 3, { abilities: [AB('channel', 1)], effects: [fx({ id: 'damage', value: 3, timing: 'channel' })] }),
    s('chans', '魂の書', [fx({ id: 'draw', value: 2, target: 'self' })], { abilities: [AB('channel', 0)], effects: [fx({ id: 'draw', value: 2, target: 'self' }), fx({ id: 'heal', value: 3, timing: 'channel', target: 'self' })] }),
    s('aff', '親和の嵐', [fx({ id: 'damage', value: 6 })], { cost: 4, rarity: 'epic', abilities: [AB('affinity')] }),
    s('affc', '連鎖の魔弾', [fx({ id: 'damage', value: 4 })], { cost: 3, abilities: [AB('affinity', undefined, { option: 'cardsPlayed' })] }),
    s('surge', '怒濤の一撃', [fx({ id: 'damage', value: 3 })], { abilities: [AB('costCut', 1, { condition: 'notFirstCard' })] }),
    s('trap', '罠の網', [fx({ id: 'freeze', target: 'chosen' })], { abilities: [AB('costCut', 2, { condition: 'enemyPlayedMany' })] }),
    s('kick', 'キッカーの槍', [fx({ id: 'damage', value: 3 }), fx({ id: 'damage', value: 3, condition: 'kicked' })], { abilities: [AB('kicker', 1)] }),
    m('kickm', '新生の獣', 2, 2, { rarity: 'rare', abilities: [AB('kicker', 2)], effects: [fx({ id: 'offspring', timing: 'summon', target: 'self', condition: 'kicked' })] }),
  ];
  const counts: Record<string, number> = Object.fromEntries(cards.map((c) => [c.id, 2]));
  counts.totem = 1;
  counts.cyc = 1;
  counts.aff = 1;
  counts.trap = 1;
  counts.kickm = 1;
  counts.chans = 1;
  counts.cycm = 1;
  counts.af = 1;
  const deck = { v: 1 as const, id: 'mtgC1', name: 'MTG-C1', entries: Object.entries(counts).map(([cardId, count]) => ({ cardId, count })) };

  it('カードとデッキはすべて作れる（30枚）', () => {
    for (const c of cards) expect(analyzeCard(c).violations, c.name).toEqual([]);
    expect(deck.entries.reduce((x, e) => x + e.count, 0)).toBe(30);
    expect(analyzeDeck(deck, new Map(cards.map((c) => [c.id, c]))).violations).toEqual([]);
  });

  const used = new Set<string>();
  const runGame = (seed: number, level: ai.CpuLevel) => {
    const opp = PRESET_DECKS[seed % PRESET_DECKS.length]!;
    const r = battle.createGame({ seed, players: [{ name: 'MTG-C1', deck, cards }, { name: opp.name, deck: opp.deck, cards: opp.cards }] });
    if (!r.ok) throw new Error(r.error);
    let g = r.state;
    let steps = 0;
    while (g.phase !== 'ended') {
      const p = g.phase === 'mulligan' ? (g.players[0].mulligan.done ? 1 : 0) : g.pending ? g.pending.player : g.active;
      const action = ai.cpuAction(g, p, steps, level);
      if (p === 0) used.add(action.type === 'playCard' ? `playCard:${action.from ?? 'hand'}${action.kick ? ':kick' : ''}${action.discardUid ? ':js' : ''}${action.exileUids ? ':es' : ''}` : action.type === 'handAbility' ? `handAbility:${action.ability}` : action.type);
      const next = battle.applyAction(g, action);
      expect(next.ok, next.ok ? '' : `${next.error}（${JSON.stringify(action)}）`).toBe(true);
      if (!next.ok) return g;
      g = next.state;
      expect(++steps).toBeLessThan(5000);
    }
    expect(g.result).not.toBeNull();
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
    return g;
  };

  for (const level of ['easy', 'normal'] as const) {
    it(`${ai.CPU_LEVEL_LABEL[level]}：プリセットと最後まで不正な行動なしで戦える`, () => {
      for (const seed of [2, 7]) runGame(seed, level);
    }, 120_000);
  }
  it(`${ai.CPU_LEVEL_LABEL.hard}：プリセットと最後まで不正な行動なしで戦える`, () => {
    runGame(4, 'hard');
  }, 180_000);
  it('CPU は新しい行動（捨て札から・起動・サイクリングか魂力・キッカー）を実際に使う', () => {
    for (const seed of [3, 9]) runGame(seed, 'normal');
    expect([...used]).toEqual(expect.arrayContaining(['playCard:discard', 'activate', 'playCard:hand:kick']));
    expect([...used].some((u) => u.startsWith('handAbility'))).toBe(true);
  }, 120_000);
});

