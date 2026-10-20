// MTG 要素 △ バッチB（追加の支払い・代わりの使い方・差し出す・相手が選ぶ・捨て札／手札の能力。能力26・条件1・タイミング2・選択肢1・キーワード1）。
// 倍率1で確かめる（表で書く）
import { describe, expect, it } from 'vitest';
import {
  ai,
  analyzeCard,
  analyzeDeck,
  battle,
  CONDITIONS,
  conditionsFor,
  describeCard,
  getAbility,
  parseCard,
  timingMultiplier,
  TIMINGS,
  timingsFor,
  type AbilityInstance,
  type CardDef,
  type EffectInstance,
} from '../src/engine/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { parseAction } from '../src/online/protocol.ts';
import { card, codes } from './helpers.ts';
import { act, actError, attack, endTurn, fx, giveCard, M, monster, P, putMonster, rich, startGame } from './battle/helpers.ts';

type G = battle.GameState;
type PlayAction = Extract<battle.Action, { type: 'playCard' }>;

let seq = 0;
const AB = (id: string, value?: number, extra: Partial<AbilityInstance> = {}): AbilityInstance => ({ id, ...(value === undefined ? {} : { value }), ...extra });
const SPELL = (effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id: `tbs${++seq}`, name: `呪文${seq}`, rarity: 'legend', cost: 3, effects, ...extra });
const MON = (a: number, h: number, extra: Partial<CardDef> = {}) =>
  card({ id: `tbm${++seq}`, name: `獣${seq}`, rarity: 'legend', cost: 3, stats: { attack: a, hp: h, defense: 0 }, ...extra });
const vio = (c: CardDef) => codes(analyzeCard(c).violations);
const play = (g: G, cardUid: string, extra: Partial<PlayAction> = {}) => act(g, { type: 'playCard', player: g.active, cardUid, chosen: {}, ...extra });
const playErr = (g: G, cardUid: string, extra: Partial<PlayAction> = {}) => actError(g, { type: 'playCard', player: g.active, cardUid, chosen: {}, ...extra });
/** P0 のターン、エナジーたっぷり */
const fresh = (energy = 20) => rich(startGame(), 0, energy);
/** 捨て札にカードを置く（定義も登録する）。uid */
const toDiscard = (g: G, p: battle.PlayerId, def: CardDef) => {
  const uid = giveCard(g, p, def);
  const i = g.players[p].hand.findIndex((c) => c.uid === uid);
  g.players[p].discard.push(...g.players[p].hand.splice(i, 1));
  return uid;
};
const hp = (g: G, uid: string) => monster(g, uid)?.hp;

const DMG5 = fx({ id: 'damage', value: 5 });
const DRAW1 = fx({ id: 'draw', value: 1, target: 'self' });
/** モード選択（A：4ダメージ・B：毒2・C：1枚引く） */
const MODAL = (abilities: AbilityInstance[], extra: Partial<CardDef> = {}) =>
  SPELL(
    [fx({ id: 'damage', value: 4, mode: 1 }), fx({ id: 'poison', value: 2, target: 'enemyAll', mode: 2 }), fx({ ...DRAW1, mode: 3 })],
    { abilities, ...extra },
  );
/** 最悪の二択（A：相手に毒4・B：相手に6ダメージ） */
const VILLAIN = () =>
  SPELL([fx({ id: 'poison', value: 4, mode: 1 }), fx({ id: 'damage', value: 6, mode: 2 })], { abilities: [AB('villain')], rarity: 'rare', cost: 2 });

// ---------------------------------------------------------------- 定義：ポイントとテキスト
describe('定義（△ バッチB）：ポイント・テキスト', () => {
  // [名前, カード, 効果・能力・割引の合計（ステータス・キーワード・コストの差し引き前）, 能力の行の値, 能力のテキスト]
  const table: [string, CardDef, number, number, string][] = [
    ['放題+1（高い28＋他16×0.5）', MODAL([AB('spree', 1)]), 36, 0, 'モードを好きな数だけ選べる（2つ目から1つにつきエナジー+1）。'],
    ['段階（上乗せ×10を引いて高い18＋他12×0.3）', MODAL([AB('tiered')]), 22, 0, 'モード B は+1、C は+2のエナジーを追加で払う。'],
    ['切除+1（条件を外した差8×0.6）', SPELL([fx({ ...DMG5, condition: 'enemyPoisoned' })], { abilities: [AB('cleave', 1)] }), 12, 5, 'エナジーを追加で1払うと、条件を無視する。'],
    ['奮励+1（相手を選ぶ効果15×0.5）', SPELL([DMG5], { abilities: [AB('strive', 1)] }), 23, 8, 'エナジーを追加で1払うたび（2回まで）、相手モンスター1体を追加（ランダム）。'],
    ['分隊+2（本体12×0.45）', MON(2, 2, { effects: [fx({ id: 'damage', value: 1, timing: 'summon' })], abilities: [AB('squad', 2)] }), 9, 6, 'エナジーを追加で2払うたび（2回まで）、コピーを1体出す。'],
    ['試作−2（2×2）', MON(4, 4, { abilities: [AB('prototype', 2)] }), 4, 4, 'コスト−2で出すと、攻撃力・体力が半分になる。'],
    ['想起1（召喚時の効果12×0.5）', MON(2, 2, { effects: [fx({ id: 'damage', value: 4, timing: 'summon' })], abilities: [AB('evoke', 1)] }), 18, 6, 'エナジー1で出すと、召喚時の効果のあと破壊される。'],
    ['超過+1（全体にして増える15×0.6）', SPELL([DMG5], { abilities: [AB('overload', 1)] }), 24, 9, 'エナジーを追加で1払うと、「選んだ1体」が全体になる。'],
    ['解鎖1（1×2）', MON(2, 2, { abilities: [AB('unleash', 1)] }), 2, 2, '攻撃力+1で出せるが、そのときは反撃しない。'],
    ['現出（固定3）', MON(3, 3, { abilities: [AB('emerge')] }), 3, 3, '自分のモンスターを生け贄にすると、そのコストぶん安くなる。'],
    ['犠牲1（使用時の効果18×0.5）', SPELL([fx({ id: 'damage', value: 6 })], { abilities: [AB('casualty', 1)] }), 27, 9, '攻撃力1以上の自分のモンスターを生け贄にすると、使用時の効果がもう一度出る。'],
    ['協約（能力0・条件×0.6）', SPELL([DMG5, fx({ ...DRAW1, condition: 'bargained' })], { abilities: [AB('bargain')] }), 18, 0, 'トークンかパワーを差し出せば、「協約したなら」の効果も出る。'],
    ['貪食1（1＋1×4.5）', MON(1, 1, { abilities: [AB('devour', 1)] }), 6, 6, '出たとき、自分の他のモンスターを3体まで生け贄にしてよい。1体につき攻撃力と体力+1。'],
    ['召集（固定3）', SPELL([DMG5], { abilities: [AB('convoke')] }), 18, 3, 'まだ攻撃できる自分のモンスターを休ませると、1体につきコスト−1（最大−3）。'],
    ['探査（固定3）', SPELL([DMG5], { abilities: [AB('delve')] }), 18, 3, '捨て札を除外すると、1枚につきコスト−1（最大−3）。'],
    ['血の支払い1（2×1）', SPELL([DMG5], { abilities: [AB('lifePay', 1)] }), 17, 2, 'エナジー1つまでを、1つにつきHP2で払える。'],
    ['代替コスト（固定6）', SPELL([DMG5], { abilities: [AB('pitch')] }), 21, 6, '同じ種類の手札1枚を除外すれば、エナジーなしで使える。'],
    ['最悪の二択（低い16＋高い18×0.2）', VILLAIN(), 20, 0, '相手が A か B を選ぶ。'],
    ['回顧（効果・本体15×0.5）', SPELL([DMG5], { abilities: [AB('retrace')] }), 23, 8, '捨て札から、手札1枚を捨てて使える（1ターン1回）。'],
    ['調和（効果・本体15×0.5）', SPELL([DMG5], { abilities: [AB('harmonize', 0)] }), 23, 8, '捨て札から使える。モンスターを休ませると安くなる。使ったら除外。'],
    ['大混乱（効果・本体15×0.4）', SPELL([DMG5], { abilities: [AB('mayhem')] }), 21, 6, 'このターン捨てられていれば、捨て札から使える。'],
    ['一時蘇生1（本体13.5×0.45）', MON(3, 3, { abilities: [AB('unearth', 1)] }), 7, 7, '捨て札からエナジー1で出せる（速攻。ターン終了時に除外）。'],
    ['相続（能力0・タイミング×0.9）', SPELL([DMG5, fx({ id: 'damage', value: 3, timing: 'renew' })], { abilities: [AB('renew', 1)] }), 24, 0, '捨て札からエナジー1でこのカードを除外して、「相続」の効果を使う。'],
    ['発掘2（固定2）', SPELL([DMG5], { abilities: [AB('dredge', 2)] }), 17, 2, '山札の上2枚を捨て札に置き、捨て札のこのカードを手札に戻す。'],
    ['不朽1（本体13.5×0.4）', MON(3, 3, { abilities: [AB('embalm', 1)] }), 6, 6, '捨て札からエナジー1で除外し、コピーを出す。'],
    ['永遠1（本体×0.4＋2）', MON(3, 3, { abilities: [AB('embalm', 1, { option: 'eternal' })] }), 8, 8, '捨て札からエナジー1で除外し、攻撃力4・体力4のコピーを出す。'],
    ['予見（能力0・タイミング×1.0）', SPELL([DMG5, fx({ ...DRAW1, timing: 'forecast' })], { abilities: [AB('forecast', 1)] }), 19, 0, '手札からエナジー1で「予見」の効果を使う（カードは手札に残る。1ターン1回）。'],
  ];
  it.each(table)('%s', (_label, c, sum, abilityPts, text) => {
    const a = analyzeCard(c);
    expect(a.violations).toEqual([]);
    const pts = a.points.lines.filter((l) => l.kind !== 'stat' && l.kind !== 'keyword' && l.kind !== 'cost').reduce((s, l) => s + l.value, 0);
    expect(pts).toBe(sum);
    expect(a.points.lines.find((l) => l.kind === 'ability')?.value).toBe(abilityPts);
    expect(a.text.abilities.map((x) => x.text)).toEqual([text]);
  });

  it('モードの見出し：放題「好きな数」・最悪の二択「相手が」・段階は上乗せつき', () => {
    expect(describeCard(MODAL([AB('spree', 1)])).effects[0]).toBe('次のうち好きな数を選ぶ：');
    expect(describeCard(VILLAIN()).effects[0]).toBe('相手が次のうち1つを選ぶ：');
    expect(describeCard(MODAL([AB('tiered')])).effects.slice(1)).toEqual(['A：相手1体に4ダメージを与える。', 'B（+1）：相手全体に毒2を与える。', 'C（+2）：カードを1枚引く。']);
  });

  it('キーワード「後援」・選択肢「同じコスト」・タイミング「相続」「予見」・条件「協約したなら」', () => {
    const k = analyzeCard(MON(2, 2, { keywords: [{ id: 'enlist' }] }));
    expect(k.points.lines.find((l) => l.kind === 'keyword')).toMatchObject({ label: '後援', value: 3 });
    expect(describeCard(SPELL([fx({ id: 'search', target: 'self', option: 'sameCost' })])).effects).toEqual(['山札からこのカードと同じコストのカードを1枚選んで手札に加える。']);
    expect(describeCard(SPELL([fx({ id: 'seek', target: 'self', option: 'sameCost' })])).effects).toEqual(['山札からこのカードと同じコストのカードを1枚ランダムに手札に加える。']);
    expect([timingMultiplier('renew', 'spell'), timingMultiplier('forecast', 'monster')]).toEqual([0.9, 1]);
    expect([TIMINGS.renew.group, TIMINGS.forecast.group, CONDITIONS.bargained.group]).toEqual(['手札・捨て札', '手札・捨て札', 'コスト・追加の支払い']);
    // 能力が要るタイミング・条件は、その能力があるときだけ選べる
    expect(timingsFor('spell')).not.toContain('renew');
    expect(timingsFor('spell', [AB('renew', 1)])).toContain('renew');
    expect(timingsFor('monster', [AB('forecast', 1)])).toContain('forecast');
    expect(conditionsFor('play', 'spell')).not.toContain('bargained');
    expect(conditionsFor('play', 'spell', [AB('bargain')])).toContain('bargained');
    expect(getAbility('spree')?.group).toBe('モード');
  });
});

// ---------------------------------------------------------------- 検証
describe('検証（△ バッチB）', () => {
  const table: [string, CardDef, string[]][] = [
    ['追加の支払いは1つ（切除と分隊）', MON(2, 2, { effects: [fx({ ...DMG5, timing: 'summon', condition: 'hasMonster' })], abilities: [AB('cleave', 1), AB('squad', 2)] }), ['EXTRA_CONFLICT']],
    ['差し出す能力は1つ（現出と犠牲）', SPELL([DMG5], { abilities: [AB('emerge'), AB('casualty', 1)] }), ['SACRIFICE_CONFLICT']],
    ['捨て札から使う能力は1つ（回顧と大混乱）', SPELL([DMG5], { abilities: [AB('retrace'), AB('mayhem')] }), ['FROM_DISCARD_CONFLICT']],
    ['探査と脱出は同時に付けない', SPELL([DMG5], { abilities: [AB('delve'), AB('escape', 3)] }), ['DELVE_ESCAPE']],
    ['切除は条件付きの効果が要る', SPELL([DMG5], { abilities: [AB('cleave', 1)] }), ['CLEAVE_WITHOUT_CONDITION']],
    ['切除とキッカーは同時に付けない', SPELL([fx({ ...DMG5, condition: 'kicked' })], { abilities: [AB('cleave', 1), AB('kicker', 1)] }), ['ABILITY_CONFLICT']],
    ['協約は「協約したなら」が要る', SPELL([DMG5], { abilities: [AB('bargain')] }), ['BARGAIN_MISMATCH']],
    ['「協約したなら」は協約が要る', SPELL([fx({ ...DMG5, condition: 'bargained' })]), ['BARGAIN_MISMATCH']],
    ['放題はモード選択のカードだけ', SPELL([DMG5], { abilities: [AB('spree', 1)] }), ['MODES_REQUIRED']],
    ['最悪の二択のモードはちょうど2つ', MODAL([AB('villain')]), ['VILLAIN_MODES', 'VILLAIN_SELF']],
    [
      '最悪の二択の各モードは相手に作用する',
      SPELL([fx({ id: 'poison', value: 2, target: 'enemyAll', mode: 1 }), fx({ ...DRAW1, mode: 2 })], { abilities: [AB('villain')] }),
      ['VILLAIN_SELF'],
    ],
    ['最悪の二択と双呪は同時に付けない', VILLAIN_WITH([AB('entwine', 1)]), ['ABILITY_CONFLICT']],
    ['現出は印刷コスト2以上', MON(1, 1, { cost: 1, abilities: [AB('emerge')] }), ['MIN_COST']],
    ['奮励は「選んだ1体（相手）」が要る', SPELL([fx({ ...DMG5, target: 'enemyMonsters' })], { abilities: [AB('strive', 1)] }), ['CHOSEN_REQUIRED']],
    ['試作の軽減は印刷コスト未満', MON(4, 4, { cost: 2, abilities: [AB('prototype', 2)] }), ['ALT_COST']],
    ['想起のコストは印刷コスト未満', MON(2, 2, { cost: 1, effects: [fx({ id: 'damage', value: 1, timing: 'summon' })], abilities: [AB('evoke', 1)] }), ['ALT_COST']],
    ['分隊はモンスターだけ・レア以上', SPELL([DRAW1], { rarity: 'common', cost: 1, abilities: [AB('squad', 2)] }), ['ABILITY_CARD_TYPE', 'ABILITY_RARITY']],
    ['超過はアタック・スキルだけ', MON(1, 1, { effects: [fx({ ...DMG5, timing: 'summon' })], abilities: [AB('overload', 1)] }), ['ABILITY_CARD_TYPE']],
    ['相続は「相続」の効果が要る', SPELL([DMG5], { abilities: [AB('renew', 1)] }), ['RENEW_MISMATCH']],
    ['「予見」の効果は予見が要る', SPELL([DMG5, fx({ ...DRAW1, timing: 'forecast' })]), ['FORECAST_MISMATCH']],
    ['「相続」はデメリットに使えない', SPELL([DMG5, fx({ id: 'damage', value: 1, timing: 'renew' })], { abilities: [AB('renew', 1)], drawbacks: [{ id: 'selfDamage', value: 1, timing: 'renew' }] }), ['DRAWBACK_TIMING', 'CURSE_TOO_WEAK']],
    ['血の支払いは印刷コストまで', SPELL([DMG5], { cost: 1, abilities: [AB('lifePay', 2)] }), ['LIFEPAY_COST']],
  ];
  it.each(table)('%s', (_label, c, expected) => {
    expect(vio(c)).toEqual(expected);
  });

  it('取り込み：新しい能力・数値（量の能力は倍率で移る）', () => {
    const c = MON(2, 2, { abilities: [AB('unleash', 1), AB('emerge')] });
    const r = parseCard(JSON.parse(JSON.stringify(c)));
    expect(r.ok && r.value.abilities).toEqual([{ id: 'unleash', value: 1 }, { id: 'emerge' }]);
  });
});

function VILLAIN_WITH(extra: AbilityInstance[]): CardDef {
  const c = VILLAIN();
  return { ...c, abilities: [...(c.abilities ?? []), ...extra] };
}

// ---------------------------------------------------------------- 対戦：追加の支払い・モード
describe('追加の支払い・モード（対戦）', () => {
  it('放題：モードを2つ以上選ぶと、2つ目から1つにつき+K。A→B→C の順に出る。並びの誤りは拒否', () => {
    const g = fresh(10);
    const c = MODAL([AB('spree', 1)]);
    const uid = giveCard(g, 0, c);
    const info = battle.playInfo(g, 0, g.players[0].hand.find((x) => x.uid === uid)!);
    expect(info.modeCombos?.map((m) => [m.label, m.cost])).toEqual([
      ['A+B', 4],
      ['A+C', 4],
      ['B+C', 4],
      ['A+B+C', 5],
    ]);
    expect(playErr(g, uid, { modes: [2, 1] })).toContain('小さい順');
    expect(playErr(g, uid, { modes: [1] })).toContain('2つ以上');
    expect(playErr(g, uid, { modes: [1, 2], mode: 1 })).toContain('重なって');
    const g2 = play(g, uid, { modes: [1, 2, 3], chosen: { enemy: P(1) } });
    expect(g2.players[0].energy).toBe(5);
    expect(g2.players[1].hp).toBe(g.players[1].hp - 4);
    expect(g2.players[1].status.poison).toBe(2);
    expect(g2.players[0].hand.length).toBe(g.players[0].hand.length);
    // 放題の無いモード選択のカードは複数選べない
    const plain = giveCard(g, 0, MODAL([]));
    expect(playErr(g, plain, { modes: [1, 2] })).toContain('放題');
  });

  it('段階：モード B は+1、C は+2。払えないモードは選べない', () => {
    const g = fresh(4);
    const uid = giveCard(g, 0, MODAL([AB('tiered')]));
    const info = battle.playInfo(g, 0, g.players[0].hand.find((x) => x.uid === uid)!);
    expect(info.modes?.map((m) => [m.label, m.cost, m.surcharge ?? 0, m.blocked])).toEqual([
      ['A', 3, 0, null],
      ['B', 4, 1, null],
      ['C', 5, 2, 'エナジーが足りません'],
    ]);
    expect(play(g, uid, { mode: 2 }).players[0].energy).toBe(0);
    expect(play(g, uid, { mode: 1, chosen: { enemy: P(1) } }).players[0].energy).toBe(1);
    expect(playErr(g, uid, { mode: 3 })).toContain('エナジーが足りません');
  });

  it('切除：払うとこのカードの条件を無視する（払わなければ条件どおり）', () => {
    const g = fresh();
    const uid = giveCard(g, 0, SPELL([fx({ ...DMG5, target: 'enemyPlayer', condition: 'enemyPoisoned' })], { abilities: [AB('cleave', 1)] }));
    const before = g.players[1].hp;
    expect(play(g, uid).players[1].hp).toBe(before);
    const g2 = play(g, uid, { extra: 1 });
    expect(g2.players[1].hp).toBe(before - 5);
    expect(g2.players[0].energy).toBe(20 - 4);
    expect(playErr(g, uid, { extra: 2 })).toContain('0〜1');
  });

  it('奮励：払った回数だけ、別の相手モンスター（重複なし）にも同じ効果。いなければ減る', () => {
    const g = fresh();
    const a = putMonster(g, 1, MON(0, 9));
    const b = putMonster(g, 1, MON(0, 9));
    const c = putMonster(g, 1, MON(0, 9));
    const uid = giveCard(g, 0, SPELL([DMG5], { abilities: [AB('strive', 1)] }));
    const g2 = play(g, uid, { extra: 2, chosen: { enemy: M(a) } });
    expect([hp(g2, a), hp(g2, b), hp(g2, c)]).toEqual([4, 4, 4]);
    expect(g2.players[0].energy).toBe(20 - 5);
    // 相手がもう1体しかいなければ、追加は1体だけ
    const h = fresh();
    const x = putMonster(h, 1, MON(0, 9));
    const y = putMonster(h, 1, MON(0, 9));
    const u = giveCard(h, 0, SPELL([DMG5], { abilities: [AB('strive', 1)] }));
    const h2 = play(h, u, { extra: 2, chosen: { enemy: M(x) } });
    expect([hp(h2, x), hp(h2, y)]).toEqual([4, 4]);
  });

  it('分隊：払った回数だけコピー（召喚時の効果も出る）。トークンの上限で止まる。捨て札からは払えない', () => {
    const g = fresh();
    const def = MON(2, 2, { effects: [fx({ id: 'damage', value: 1, timing: 'summon', target: 'enemyPlayer' })], abilities: [AB('squad', 2)] });
    const uid = giveCard(g, 0, def);
    const before = g.players[1].hp;
    const g2 = play(g, uid, { extra: 2 });
    expect(g2.players[0].board.length).toBe(3);
    expect(g2.players[0].board.filter((m) => m.card.token?.copy).length).toBe(2);
    expect(g2.players[1].hp).toBe(before - 3);
    expect(g2.players[0].energy).toBe(20 - 3 - 4);
    // トークンが4体いれば、コピーは1体だけ
    const h = fresh();
    for (let i = 0; i < 4; i++) putMonster(h, 0, MON(1, 1), { card: { uid: `tk${i}`, cardId: 'x', owner: 0, token: { attack: 1, hp: 1 } } });
    const u = giveCard(h, 0, def);
    expect(play(h, u, { extra: 2 }).players[0].board.filter((m) => m.card.token).length).toBe(5);
  });

  it('試作：コスト−K、攻撃力・体力が半分（体力は最低1）', () => {
    const g = fresh(5);
    const uid = giveCard(g, 0, MON(5, 1, { abilities: [AB('prototype', 2)] }));
    const g2 = play(g, uid, { alt: 'prototype' });
    const m = g2.players[0].board[0]!;
    expect([m.attack, m.hp, m.prototype, g2.players[0].energy]).toEqual([2, 1, true, 4]);
    expect(playErr(g, uid, { alt: 'evoke' })).toContain('その使い方');
  });

  it('想起：想起コストで出し、召喚時の効果のあと破壊される（破壊されたときも出る）', () => {
    const g = fresh(5);
    const def = MON(2, 2, {
      effects: [fx({ id: 'damage', value: 4, timing: 'summon', target: 'enemyPlayer' }), fx({ ...DRAW1, timing: 'destroyed' })],
      abilities: [AB('evoke', 1)],
    });
    const uid = giveCard(g, 0, def);
    const before = { hp: g.players[1].hp, hand: g.players[0].hand.length };
    const g2 = play(g, uid, { alt: 'evoke' });
    expect(g2.players[0].energy).toBe(4);
    expect(g2.players[1].hp).toBe(before.hp - 4);
    expect(g2.players[0].board.length).toBe(0);
    expect(g2.players[0].discard.some((c) => c.uid === uid)).toBe(true);
    expect(g2.players[0].hand.length).toBe(before.hand);
  });

  it('超過：「選んだ1体」が相手モンスター全体になる（プレイヤーは含まない）。対象は選ばない', () => {
    const g = fresh();
    const a = putMonster(g, 1, MON(0, 9));
    const b = putMonster(g, 1, MON(0, 9));
    const uid = giveCard(g, 0, SPELL([DMG5], { abilities: [AB('overload', 1)] }));
    expect(playErr(g, uid, { alt: 'overload', chosen: { enemy: M(a) } })).toContain('対象は選べません');
    const g2 = play(g, uid, { alt: 'overload' });
    expect([hp(g2, a), hp(g2, b), g2.players[1].hp, g2.players[0].energy]).toEqual([4, 4, g.players[1].hp, 16]);
  });

  it('解鎖：攻撃力+N で出て、攻撃されても反撃しない', () => {
    const g = fresh();
    const uid = giveCard(g, 0, MON(2, 5, { abilities: [AB('unleash', 1)] }));
    let s = play(g, uid, { alt: 'unleash' });
    const m = s.players[0].board[0]!;
    expect([m.attack, m.unleashed]).toEqual([3, true]);
    s = endTurn(s);
    const foe = putMonster(s, 1, MON(1, 5));
    s = attack(s, foe, M(m.uid));
    expect(hp(s, foe)).toBe(5);
    expect(hp(s, m.uid)).toBe(4);
  });

  it('現出：自分のモンスターを生け贄にして、その印刷コストぶん安い（破壊されたときの効果が先）。トークンは0', () => {
    const g = fresh(1);
    const fodder = putMonster(g, 0, MON(1, 1, { cost: 2, effects: [fx({ ...DRAW1, timing: 'destroyed' })] }));
    const uid = giveCard(g, 0, MON(3, 3, { abilities: [AB('emerge')], effects: [fx({ id: 'damage', value: 1, timing: 'summon', target: 'enemyPlayer' })] }));
    expect(playErr(g, uid)).toContain('エナジーが足りません');
    const info = battle.playInfo(g, 0, g.players[0].hand.find((c) => c.uid === uid)!);
    expect(info.blocked).toBeNull();
    expect(info.pay?.sacrifice).toMatchObject({ kind: 'emerge', options: [{ uid: fodder, cut: 2 }], best: fodder });
    expect(info.pay?.minCost).toBe(1);
    const g2 = play(g, uid, { sacrificeUid: fodder });
    expect(g2.players[0].energy).toBe(0);
    expect(g2.players[0].board.map((m) => m.uid)).toEqual([uid]);
    const lines = g2.log.map((l) => l.text);
    expect(lines.findIndex((t) => t.includes('カードを1枚引いた'))).toBeLessThan(lines.findIndex((t) => t.includes('1ダメージ')));
    // 捨て札から使うときは差し出せない
    expect(playErr(g, uid, { sacrificeUid: 'nope' })).toContain('自分の場のモンスター');
  });

  it('犠牲：攻撃力 N 以上を生け贄にすると、使用時の効果がもう一度（同じ対象）。続唱はもう一度出ない', () => {
    const g = fresh();
    const weak = putMonster(g, 0, MON(0, 3));
    const strong = putMonster(g, 0, MON(2, 3));
    const foe = putMonster(g, 1, MON(0, 20));
    const uid = giveCard(g, 0, SPELL([fx({ id: 'damage', value: 6 })], { abilities: [AB('casualty', 1)] }));
    expect(playErr(g, uid, { sacrificeUid: weak, chosen: { enemy: M(foe) } })).toContain('攻撃力1以上');
    const g2 = play(g, uid, { sacrificeUid: strong, chosen: { enemy: M(foe) } });
    expect(hp(g2, foe)).toBe(8);
    expect(monster(g2, strong)).toBeUndefined();
    expect(battle.legalActions(g, 0).some((a) => a.type === 'playCard' && a.cardUid === uid && a.sacrificeUid === strong)).toBe(true);
  });

  it('協約：トークンかパワーを差し出すと「協約したなら」が出る。トークンでないモンスターは差し出せない', () => {
    const g = fresh();
    const real = putMonster(g, 0, MON(1, 1));
    const tk = putMonster(g, 0, MON(1, 1), { card: { uid: 'tkb', cardId: 'x', owner: 0, token: { attack: 1, hp: 1 } } });
    g.players[0].powers.push({ uid: 'pw1', cardId: 'x', name: '古いパワー', effects: [], drawbacks: [] });
    const def = SPELL([fx({ ...DMG5, target: 'enemyPlayer' }), fx({ ...DRAW1, condition: 'bargained' })], { abilities: [AB('bargain')] });
    const uid = giveCard(g, 0, def);
    const hand = g.players[0].hand.length;
    expect(playErr(g, uid, { sacrificeUid: real })).toContain('トークンかパワー');
    expect(play(g, uid).players[0].hand.length).toBe(hand - 1);
    const byToken = play(g, uid, { sacrificeUid: tk });
    expect(byToken.players[0].hand.length).toBe(hand);
    expect(monster(byToken, tk)).toBeUndefined();
    const byPower = play(g, uid, { sacrificeUid: 'pw1' });
    expect(byPower.players[0].powers).toEqual([]);
    expect(byPower.players[0].hand.length).toBe(hand);
  });

  it('貪食：出たとき（召喚時の効果より先に）他のモンスターを選んで生け贄、1体につき+N/+N', () => {
    const g = fresh();
    const a = putMonster(g, 0, MON(1, 1));
    const b = putMonster(g, 0, MON(1, 1));
    const uid = giveCard(g, 0, MON(1, 1, { abilities: [AB('devour', 2)] }));
    let s = play(g, uid);
    expect(s.pending?.step.t).toBe('devourChoice');
    expect(s.pending?.max).toBe(2);
    s = act(s, { type: 'choose', player: 0, picks: [a, b] });
    const m = monster(s, uid)!;
    expect([m.attack, m.hp, m.maxHp, s.players[0].board.length]).toEqual([5, 5, 5, 1]);
    // 選ばなくてもよい
    const t = act(play(g, uid), { type: 'choose', player: 0, picks: [] });
    expect(t.players[0].board.length).toBe(3);
    // 同時に出た分隊のコピーは選べない（出たときに場にいたものだけ）
    const h = fresh();
    const old = putMonster(h, 0, MON(1, 1));
    const both = giveCard(h, 0, MON(1, 1, { abilities: [AB('devour', 1), AB('squad', 2)] }));
    const u = play(h, both, { extra: 1 });
    expect(u.players[0].board.length).toBe(3);
    expect(u.pending?.options.map((o) => o.id)).toEqual([old]);
  });

  it('召集：まだ攻撃できる自分のモンスターを休ませると1体につき−1。休んだモンスターは攻撃できない', () => {
    const g = fresh(1);
    const a = putMonster(g, 0, MON(1, 1));
    const b = putMonster(g, 0, MON(1, 1));
    const used = putMonster(g, 0, MON(1, 1), { attacksUsed: 1 });
    const uid = giveCard(g, 0, SPELL([fx({ ...DMG5, target: 'enemyPlayer' })], { abilities: [AB('convoke')] }));
    expect(playErr(g, uid, { tapUids: [a, used] })).toContain('もう攻撃できない');
    const s = play(g, uid, { tapUids: [a, b] });
    expect(s.players[0].energy).toBe(0);
    expect(battle.attackBlockReason(s, monster(s, a)!)).toContain('もう攻撃');
    // CPU の候補：足りない分だけ休ませる
    const acts = battle.legalActions(g, 0).filter((x) => x.type === 'playCard' && x.cardUid === uid) as PlayAction[];
    expect(acts.map((x) => x.tapUids?.length)).toEqual([2]);
  });

  it('探査：捨て札を除外すると1枚につき−1（最大3）', () => {
    const g = fresh(0);
    for (let i = 0; i < 4; i++) toDiscard(g, 0, SPELL([DRAW1], { rarity: 'common', cost: 1 }));
    const ids = g.players[0].discard.map((c) => c.uid);
    const uid = giveCard(g, 0, SPELL([fx({ ...DMG5, target: 'enemyPlayer' })], { abilities: [AB('delve')] }));
    expect(playErr(g, uid, { exileUids: ids })).toContain('3枚まで');
    const s = play(g, uid, { exileUids: ids.slice(0, 3) });
    expect(s.players[0].exile.length).toBe(3);
    expect(s.players[1].hp).toBe(g.players[1].hp - 5);
  });

  it('血の支払い：エナジーの代わりに HP（ダメージではない）。HP が足りなければ使えない', () => {
    const g = fresh(2);
    const uid = giveCard(g, 0, SPELL([fx({ ...DMG5, target: 'enemyPlayer' })], { abilities: [AB('lifePay', 1)] }));
    const s = play(g, uid, { lifePay: 1 });
    expect([s.players[0].energy, s.players[0].hp]).toEqual([0, g.players[0].hp - 2]);
    expect(s.log.some((l) => l.ev?.status === 'lifePay')).toBe(true);
    const low = fresh(2);
    low.players[0].hp = 2;
    const u = giveCard(low, 0, SPELL([fx({ ...DMG5, target: 'enemyPlayer' })], { abilities: [AB('lifePay', 1)] }));
    expect(playErr(low, u, { lifePay: 1 })).toContain('HPが足りません');
    expect(battle.playInfo(low, 0, low.players[0].hand.find((c) => c.uid === u)!).pay?.lifePay).toBeUndefined();
  });

  it('代替コスト：同じ種類の手札1枚を除外すると、カードのコストを払わない（1ターン1回）', () => {
    const g = fresh(0);
    const def = SPELL([fx({ ...DMG5, target: 'enemyPlayer' })], { abilities: [AB('pitch')] });
    const uid = giveCard(g, 0, def);
    const other = giveCard(g, 0, SPELL([fx({ id: 'damage', value: 1, target: 'enemyPlayer' })], { rarity: 'common', cost: 1 }));
    const mon = giveCard(g, 0, MON(1, 1));
    expect(playErr(g, uid, { pitchUid: mon })).toContain('同じ種類');
    const s = play(g, uid, { pitchUid: other });
    expect(s.players[0].exile.map((c) => c.uid)).toEqual([other]);
    expect(s.players[1].hp).toBe(g.players[1].hp - 5);
    const again = giveCard(s, 0, def);
    giveCard(s, 0, SPELL([fx({ id: 'damage', value: 1, target: 'enemyPlayer' })], { rarity: 'common', cost: 1 }));
    expect(playErr(s, again, { pitchUid: s.players[0].hand.at(-1)!.uid })).toContain('1ターン1回');
  });

  it('最悪の二択：相手がモードを選ぶ（相手の選択待ち）。使う人はモードを送れない。使った人には選択肢が見えない', () => {
    const g = fresh();
    const uid = giveCard(g, 0, VILLAIN());
    expect(playErr(g, uid, { mode: 1, chosen: { enemy: P(1) } })).toContain('相手が選びます');
    const s = play(g, uid, { chosen: { enemy: P(1) } });
    expect(s.pending?.player).toBe(1);
    expect(s.pending?.options.map((o) => o.id)).toEqual(['1', '2']);
    expect(battle.viewFor(s, 0).pending).toMatchObject({ player: 1, prompt: '相手が選んでいます', options: [] });
    expect(battle.viewFor(s, 1).pending?.options.length).toBe(2);
    expect(battle.legalActions(s, 0)).toEqual([]);
    const a = act(s, { type: 'choose', player: 1, picks: ['2'] });
    expect(a.players[1].hp).toBe(g.players[1].hp - 6);
    expect(a.players[1].status.poison).toBe(0);
    expect(a.pending).toBeNull();
    // CPU は自分にとってましな方を選ぶ（毒4より6ダメージ…ではなく、評価の高い方）
    const pick = ai.cpuAction(s, 1, 1, 'normal');
    expect(pick.type).toBe('choose');
  });
});

// ---------------------------------------------------------------- 対戦：捨て札・手札の能力・後援
describe('捨て札・手札の能力・後援（対戦）', () => {
  it('回顧：捨て札から手札1枚を捨てて使い、また捨て札へ。同じカードは1ターン1回', () => {
    const g = fresh();
    const uid = toDiscard(g, 0, SPELL([fx({ ...DMG5, target: 'enemyPlayer' })], { abilities: [AB('retrace')] }));
    const junk = giveCard(g, 0, SPELL([DRAW1], { rarity: 'common', cost: 1 }));
    let s = act(g, { type: 'playCard', player: 0, cardUid: uid, from: 'discard', discardUid: junk, chosen: {} });
    expect(s.players[0].discard.some((c) => c.uid === uid)).toBe(true);
    expect(s.players[1].hp).toBe(g.players[1].hp - 5);
    const junk2 = giveCard(s, 0, SPELL([DRAW1], { rarity: 'common', cost: 1 }));
    expect(actError(s, { type: 'playCard', player: 0, cardUid: uid, from: 'discard', discardUid: junk2, chosen: {} })).toContain('1ターン1回');
    s = endTurn(endTurn(s));
    rich(s, 0);
    const junk3 = giveCard(s, 0, SPELL([DRAW1], { rarity: 'common', cost: 1 }));
    expect(battle.validateAction(s, { type: 'playCard', player: 0, cardUid: uid, from: 'discard', discardUid: junk3, chosen: {} })).toBeNull();
  });

  it('調和：捨て札から、まだ攻撃できるモンスター1体を休ませると攻撃力2ごとに−1。使ったら除外', () => {
    const g = fresh(1);
    const big = putMonster(g, 0, MON(5, 1));
    const uid = toDiscard(g, 0, SPELL([fx({ ...DMG5, target: 'enemyPlayer' })], { abilities: [AB('harmonize', 0)] }));
    const info = battle.discardPlayInfos(g, 0).find((i) => i.card.uid === uid)!;
    expect(info.pay?.tap).toMatchObject({ kind: 'harmonize', max: 1, options: [{ uid: big, cut: 2 }] });
    const s = act(g, { type: 'playCard', player: 0, cardUid: uid, from: 'discard', tapUids: [big], chosen: {} });
    expect(s.players[0].energy).toBe(0);
    expect(s.players[0].exile.some((c) => c.uid === uid)).toBe(true);
    expect(battle.attackBlockReason(s, monster(s, big)!)).toContain('もう攻撃');
  });

  it('大混乱：このターンに手札から捨てられたカードだけ、捨て札から使える', () => {
    const g = fresh();
    const def = SPELL([fx({ ...DMG5, target: 'enemyPlayer' })], { abilities: [AB('mayhem')] });
    const old = toDiscard(g, 0, def);
    expect(actError(g, { type: 'playCard', player: 0, cardUid: old, from: 'discard', chosen: {} })).toContain('捨てられた');
    const uid = giveCard(g, 0, def);
    const looter = giveCard(g, 0, SPELL([fx({ id: 'loot', value: 1, target: 'self' })], { rarity: 'common', cost: 1 }));
    let s = play(g, looter);
    if (s.pending) s = act(s, { type: 'choose', player: 0, picks: [uid] });
    expect(s.players[0].discard.some((c) => c.uid === uid)).toBe(true);
    s = act(s, { type: 'playCard', player: 0, cardUid: uid, from: 'discard', chosen: {} });
    expect(s.players[1].hp).toBe(g.players[1].hp - 5);
    expect(s.players[0].discard.find((c) => c.uid === uid)?.discardedTurn).toBeUndefined();
  });

  it('一時蘇生：捨て札から K で出す。速攻で攻撃でき、ターン終了時に除外', () => {
    const g = fresh(1);
    const uid = toDiscard(g, 0, MON(3, 3, { cost: 4, abilities: [AB('unearth', 1)] }));
    let s = act(g, { type: 'playCard', player: 0, cardUid: uid, from: 'discard', chosen: {} });
    expect(s.players[0].energy).toBe(0);
    expect(monster(s, uid)?.unearthed).toBe(true);
    s = attack(s, uid, P(1));
    expect(s.players[1].hp).toBe(g.players[1].hp - 3);
    s = endTurn(s);
    expect(monster(s, uid)).toBeUndefined();
    expect(s.players[0].exile.some((c) => c.uid === uid)).toBe(true);
  });

  it('相続：捨て札のカードを K で除外して「相続」の効果（使ったカードには数えない）', () => {
    const g = fresh();
    const foe = putMonster(g, 1, MON(0, 9));
    const uid = toDiscard(g, 0, SPELL([DMG5, fx({ id: 'damage', value: 3, timing: 'renew' })], { abilities: [AB('renew', 1)] }));
    const infos = battle.discardAbilityInfos(g, 0);
    expect(infos.map((i) => [i.ability, i.cost, i.blocked])).toEqual([['renew', 1, null]]);
    expect(actError(g, { type: 'discardAbility', player: 0, cardUid: uid, ability: 'renew', chosen: {} })).toContain('対象');
    const s = act(g, { type: 'discardAbility', player: 0, cardUid: uid, ability: 'renew', chosen: { enemy: M(foe) } });
    expect(hp(s, foe)).toBe(6);
    expect(s.players[0].exile.some((c) => c.uid === uid)).toBe(true);
    expect(s.players[0].turn.cardsPlayed).toBe(0);
    expect(s.players[0].energy).toBe(19);
  });

  it('発掘：山札の上 N 枚を捨て札に置いて、このカードを手札に戻す（1ターン1回・山札が足りなければ使えない）', () => {
    const g = fresh();
    const uid = toDiscard(g, 0, SPELL([DMG5], { abilities: [AB('dredge', 2)] }));
    const deck = g.players[0].deck.length;
    const s = act(g, { type: 'discardAbility', player: 0, cardUid: uid, ability: 'dredge' });
    expect(s.players[0].hand.some((c) => c.uid === uid)).toBe(true);
    expect(s.players[0].deck.length).toBe(deck - 2);
    expect(s.players[0].discard.length).toBe(2);
    const uid2 = toDiscard(s, 0, SPELL([DMG5], { abilities: [AB('dredge', 2)] }));
    expect(actError(s, { type: 'discardAbility', player: 0, cardUid: uid2, ability: 'dredge' })).toContain('1ターン1回');
    const thin = fresh();
    thin.players[0].deck = thin.players[0].deck.slice(0, 1);
    const u = toDiscard(thin, 0, SPELL([DMG5], { abilities: [AB('dredge', 2)] }));
    expect(actError(thin, { type: 'discardAbility', player: 0, cardUid: u, ability: 'dredge' })).toContain('山札が2枚');
  });

  it('不朽・永遠：捨て札のカードを除外してコピー（トークン。召喚時の効果も出る）', () => {
    const g = fresh();
    const def = MON(3, 2, { effects: [fx({ id: 'damage', value: 1, timing: 'summon', target: 'enemyPlayer' })], abilities: [AB('embalm', 1)] });
    const uid = toDiscard(g, 0, def);
    const s = act(g, { type: 'discardAbility', player: 0, cardUid: uid, ability: 'embalm' });
    const m = s.players[0].board[0]!;
    expect([m.attack, m.hp, m.card.token?.copy]).toEqual([3, 2, true]);
    expect(s.players[1].hp).toBe(g.players[1].hp - 1);
    expect(s.players[0].exile.some((c) => c.uid === uid)).toBe(true);
    const e = fresh();
    const u = toDiscard(e, 0, MON(1, 1, { abilities: [AB('embalm', 1, { option: 'eternal' })] }));
    const t = act(e, { type: 'discardAbility', player: 0, cardUid: u, ability: 'embalm' }).players[0].board[0]!;
    expect([t.attack, t.hp]).toEqual([4, 4]);
  });

  it('予見：手札に残したまま効果（1ターン1回）。見せたカードは相手にも分かる', () => {
    const g = fresh();
    const uid = giveCard(g, 0, SPELL([DMG5, fx({ id: 'damage', value: 2, timing: 'forecast', target: 'enemyPlayer' })], { abilities: [AB('forecast', 1)] }));
    const s = act(g, { type: 'handAbility', player: 0, cardUid: uid, ability: 'forecast' });
    expect(s.players[0].hand.some((c) => c.uid === uid)).toBe(true);
    expect(s.players[1].hp).toBe(g.players[1].hp - 2);
    expect(s.players[0].turn.cardsPlayed).toBe(0);
    expect(actError(s, { type: 'handAbility', player: 0, cardUid: uid, ability: 'forecast' })).toContain('もう予見');
    const view = battle.viewFor(s, 1);
    expect(view.cards[s.players[0].hand.find((c) => c.uid === uid)!.cardId]).toBeDefined();
    expect(view.players[0].hand.every((c) => c.cardId === battle.HIDDEN_CARD_ID)).toBe(true);
  });

  it('サーチ「このカードと同じコスト」：同じ印刷コストのカードだけ', () => {
    const g = fresh();
    const two = card({ id: 'two', name: '二', cost: 2, effects: [DRAW1] });
    const three = card({ id: 'three', name: '三', cost: 3, effects: [DRAW1] });
    g.cards['p0:two'] = two;
    g.cards['p0:three'] = three;
    g.players[0].deck.unshift({ uid: 'd2', cardId: 'p0:two', owner: 0 }, { uid: 'd3', cardId: 'p0:three', owner: 0 });
    const uid = giveCard(g, 0, SPELL([fx({ id: 'search', target: 'self', option: 'sameCost' })], { cost: 3 }));
    const s = play(g, uid);
    expect(s.players[0].hand.some((c) => c.uid === 'd3')).toBe(true);
    expect(s.players[0].hand.some((c) => c.uid === 'd2')).toBe(false);
  });

  it('後援：攻撃するとき他のモンスターを休ませ、その攻撃力を足す（反撃には足さない）', () => {
    const g = fresh();
    const hero = putMonster(g, 0, MON(2, 9, { keywords: [{ id: 'enlist' }] }));
    const helper = putMonster(g, 0, MON(3, 3));
    const foe = putMonster(g, 1, MON(1, 20));
    expect(battle.enlistOptions(g, monster(g, hero)!).map((m) => m.uid)).toEqual([helper]);
    const s = act(g, { type: 'attack', player: 0, attackerUid: hero, target: M(foe), enlistUid: helper });
    expect(hp(s, foe)).toBe(15);
    expect(hp(s, hero)).toBe(8);
    expect(battle.attackBlockReason(s, monster(s, helper)!)).toContain('もう攻撃');
    expect(actError(g, { type: 'attack', player: 0, attackerUid: helper, target: P(1), enlistUid: hero })).toContain('後援');
    expect(battle.legalActions(g, 0).some((a) => a.type === 'attack' && a.attackerUid === hero && a.enlistUid === helper)).toBe(true);
  });
});

// ---------------------------------------------------------------- オンライン（受付）
describe('オンラインの受付（△ バッチB）', () => {
  it('新しい項目を検証して作り直す。範囲外・型違いは拒否、知らない項目は捨てる', () => {
    const base = { type: 'playCard', player: 0, cardUid: 'c1' };
    expect(parseAction({ ...base, extra: 2, modes: [1, 3], alt: 'overload', sacrificeUid: 'm1', tapUids: ['a', 'b'], pitchUid: 'h1', lifePay: 1, junk: 1 })).toEqual({
      ...base,
      extra: 2,
      modes: [1, 3],
      alt: 'overload',
      sacrificeUid: 'm1',
      tapUids: ['a', 'b'],
      pitchUid: 'h1',
      lifePay: 1,
    });
    for (const bad of [
      { extra: 4 },
      { extra: 1.5 },
      { modes: [2, 1] },
      { modes: [1] },
      { modes: [1, 1] },
      { modes: [0, 1] },
      { alt: 'nope' },
      { sacrificeUid: 3 },
      { tapUids: ['a', 'b', 'c', 'd', 'e', 'f'] },
      { lifePay: 3 },
      { pitchUid: '' },
    ]) {
      expect(parseAction({ ...base, ...bad }), JSON.stringify(bad)).toBeNull();
    }
    expect(parseAction({ type: 'attack', player: 1, attackerUid: 'a', target: { kind: 'player', player: 0 }, enlistUid: 'b' })).toMatchObject({ enlistUid: 'b' });
    expect(parseAction({ type: 'attack', player: 1, attackerUid: 'a', target: { kind: 'player', player: 0 }, enlistUid: 5 })).toBeNull();
    expect(parseAction({ type: 'discardAbility', player: 0, cardUid: 'c', ability: 'renew', chosen: { enemy: { kind: 'player', player: 1 } }, x: 1 })).toEqual({
      type: 'discardAbility',
      player: 0,
      cardUid: 'c',
      ability: 'renew',
      chosen: { enemy: { kind: 'player', player: 1 } },
    });
    expect(parseAction({ type: 'discardAbility', player: 0, cardUid: 'c', ability: 'flashback' })).toBeNull();
    expect(parseAction({ type: 'handAbility', player: 0, cardUid: 'c', ability: 'forecast' })).toMatchObject({ ability: 'forecast' });
  });
});

// ---------------------------------------------------------------- CPU
describe('CPU（△ バッチB）', () => {
  const m = (id: string, name: string, a: number, h: number, extra: Partial<CardDef> = {}) =>
    card({ id, name, rarity: 'common', cost: 2, stats: { attack: a, hp: h, defense: 0 }, ...extra });
  const s = (id: string, name: string, effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id, name, rarity: 'common', cost: 2, effects, ...extra });
  const D3 = (extra: Partial<EffectInstance> = {}) => fx({ id: 'damage', value: 3, ...extra });
  const cards: CardDef[] = [
    s('spree', '乱れ撃ち', [fx({ id: 'damage', value: 2, mode: 1 }), fx({ id: 'poison', value: 1, target: 'enemyAll', mode: 2 })], { abilities: [AB('spree', 1)] }),
    s('tier', '段階の術', [fx({ id: 'damage', value: 2, mode: 1 }), fx({ id: 'damage', value: 3, mode: 2 })], { abilities: [AB('tiered')] }),
    s('cleave', '切り裂き', [D3({ condition: 'enemyPoisoned' })], { abilities: [AB('cleave', 1)] }),
    s('strive', '奮い立ち', [D3()], { rarity: 'rare', abilities: [AB('strive', 1)] }),
    m('squad', '分隊長', 1, 2, { rarity: 'rare', abilities: [AB('squad', 2)] }),
    m('proto', '試作機', 4, 4, { cost: 3, abilities: [AB('prototype', 2)] }),
    m('evoke', '想起の精', 1, 1, { cost: 3, effects: [fx({ id: 'damage', value: 3, timing: 'summon' })], abilities: [AB('evoke', 1)] }),
    s('overload', '雷鳴', [D3()], { rarity: 'rare', abilities: [AB('overload', 1)] }),
    m('unleash', '暴れ牛', 2, 3, { abilities: [AB('unleash', 1)] }),
    m('emerge', '現出体', 3, 3, { cost: 3, abilities: [AB('emerge')] }),
    s('casualty', '犠牲の刃', [D3()], { abilities: [AB('casualty', 1)] }),
    s('bargain', '協約の書', [D3(), fx({ ...DRAW1, condition: 'bargained' })], { abilities: [AB('bargain')] }),
    m('devour', '貪る者', 1, 1, { abilities: [AB('devour', 1)] }),
    s('convoke', '召集令', [D3()], { cost: 3, abilities: [AB('convoke')] }),
    s('delve', '探査の術', [D3()], { cost: 3, abilities: [AB('delve')] }),
    s('blood', '血の契約', [D3()], { abilities: [AB('lifePay', 1)] }),
    s('pitch', '代替の矢', [D3()], { rarity: 'rare', abilities: [AB('pitch')] }),
    s('villain', '二択', [fx({ id: 'poison', value: 2, target: 'enemyAll', mode: 1 }), fx({ id: 'damage', value: 3, mode: 2 })], { abilities: [AB('villain')] }),
    s('retrace', '回顧録', [D3()], { abilities: [AB('retrace')] }),
    s('harmonize', '調和の歌', [D3()], { abilities: [AB('harmonize', 0)] }),
    s('mayhem', '大混乱', [D3()], { abilities: [AB('mayhem')] }),
    m('unearth', '墓の戦士', 2, 2, { abilities: [AB('unearth', 1)] }),
    s('renew', '遺産', [D3(), fx({ id: 'damage', value: 2, timing: 'renew' })], { abilities: [AB('renew', 1)] }),
    s('dredge', '掘り起こし', [D3()], { abilities: [AB('dredge', 2)] }),
    m('embalm', '不朽の兵', 2, 2, { abilities: [AB('embalm', 1)] }),
    s('forecast', '予見の書', [D3(), fx({ id: 'damage', value: 1, timing: 'forecast' })], { abilities: [AB('forecast', 1)] }),
    m('enlist', '後援兵', 2, 3, { keywords: [{ id: 'enlist' }] }),
    s('loot', '物色', [fx({ id: 'loot', value: 1, target: 'self' })], { rarity: 'common', cost: 1 }),
  ];
  const counts: Record<string, number> = Object.fromEntries(cards.map((c) => [c.id, 1]));
  Object.assign(counts, { loot: 3 });
  const deck = { v: 1 as const, id: 'mtgTB', name: 'MTG-TB', entries: Object.entries(counts).map(([cardId, count]) => ({ cardId, count })) };

  it('カードとデッキはすべて作れる（30枚）', () => {
    for (const c of cards) expect(analyzeCard(c).violations, c.name).toEqual([]);
    expect(deck.entries.reduce((x, e) => x + e.count, 0)).toBe(30);
    expect(analyzeDeck(deck, new Map(cards.map((c) => [c.id, c]))).violations).toEqual([]);
  });

  const used = new Set<string>();
  const runGame = (seed: number, level: ai.CpuLevel) => {
    const opp = PRESET_DECKS[seed % PRESET_DECKS.length]!;
    const r = battle.createGame({ seed, players: [{ name: 'MTG-TB', deck, cards }, { name: opp.name, deck: opp.deck, cards: opp.cards }] });
    if (!r.ok) throw new Error(r.error);
    let g = r.state;
    let steps = 0;
    while (g.phase !== 'ended') {
      const p = g.phase === 'mulligan' ? (g.players[0].mulligan.done ? 1 : 0) : g.pending ? g.pending.player : g.active;
      const action = ai.cpuAction(g, p, steps, level);
      const next = battle.applyAction(g, action);
      expect(next.ok, next.ok ? '' : `${next.error}（${JSON.stringify(action)}）`).toBe(true);
      if (!next.ok) return g;
      if (action.type === 'playCard') {
        for (const k of ['extra', 'modes', 'alt', 'sacrificeUid', 'tapUids', 'pitchUid', 'lifePay'] as const) if (action[k] !== undefined) used.add(k);
      }
      if (action.type === 'discardAbility') used.add(action.ability);
      if (action.type === 'handAbility') used.add(action.ability);
      if (action.type === 'attack' && action.enlistUid) used.add('enlist');
      if (g.pending?.step.t === 'villainChoice') used.add('villain');
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
    }, 180_000);
  }
  it(`${ai.CPU_LEVEL_LABEL.hard}：プリセットと最後まで不正な行動なしで戦える`, () => {
    runGame(4, 'hard');
  }, 240_000);
  it('CPU は新しい払い方・能力を実際に使う', () => {
    for (const seed of [3, 9, 11, 13]) runGame(seed, 'normal');
    expect([...used].sort()).toEqual(expect.arrayContaining(['alt', 'embalm', 'extra', 'forecast', 'modes', 'renew', 'villain']));
  }, 240_000);
});
