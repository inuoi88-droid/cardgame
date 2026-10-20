// MTG 要素 ○ バッチB（キーワード6・効果23＋応召・カードの能力4）。倍率1で確かめる（表で書く）
import { describe, expect, it } from 'vitest';
import {
  abilityChoices,
  ai,
  analyzeCard,
  analyzeDeck,
  availableEffects,
  battle,
  createAbility,
  describeAbility,
  describeEffect,
  getKeyword,
  listAbilities,
  parseCard,
  setMonster,
  type AbilityInstance,
  type CardDef,
  type DrawbackInstance,
  type EffectInstance,
  type KeywordInstance,
} from '../src/engine/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { EXAMPLES, card, codes } from './helpers.ts';
import { act, actError, attack, endTurn, fx, giveCard, logText, M, monster, P, play, putMonster, rich, startGame } from './battle/helpers.ts';

type G = battle.GameState;

let seq = 0;
const MON = (a: number, h: number, extra: Partial<CardDef> = {}) =>
  card({ id: `bm${++seq}`, name: `獣${seq}`, rarity: 'legend', cost: 2, stats: { attack: a, hp: h, defense: 0 }, ...extra });
const KW = (id: string, value?: number): KeywordInstance => (value === undefined ? { id } : { id, value });
const SPELL = (effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id: `bs${++seq}`, name: `呪文${seq}`, rarity: 'legend', cost: 2, effects, ...extra });
const AB = (id: string, value?: number): AbilityInstance => (value === undefined ? { id } : { id, value });
const DB = (id: string, extra: Partial<DrawbackInstance> = {}): DrawbackInstance => ({ id, timing: null, ...extra });
/** 山札の一番上にカードを置く（uid を返す） */
function toDeckTop(g: G, p: battle.PlayerId, def: CardDef): string {
  g.cards[`p${p}:${def.id}`] = def;
  const uid = `k${++seq}`;
  g.players[p].deck.unshift({ uid, cardId: `p${p}:${def.id}`, owner: p });
  return uid;
}
/** 山札を defs の順にする（先頭が一番上） */
function setDeck(g: G, p: battle.PlayerId, defs: CardDef[]): string[] {
  g.players[p].deck = [];
  return [...defs].reverse().map((d) => toDeckTop(g, p, d)).reverse();
}
const handIds = (g: G, p: battle.PlayerId) => g.players[p].hand.map((c) => c.uid);
const energyOf = (g: G, p: battle.PlayerId) => g.players[p].energy;

const SKILL = card({ id: 'skillB', name: '薬B', effects: [fx({ id: 'heal', value: 1, target: 'self' })] });
const ATTACK = card({ id: 'atkB', name: '矢B', cost: 1, effects: [fx({ id: 'damage', value: 1 })] });
const BEAST = card({ id: 'beastB', name: '獣B', cost: 1, stats: { attack: 1, hp: 1, defense: 0 } });
const BIG = card({ id: 'bigB', name: '巨人B', cost: 4, stats: { attack: 4, hp: 6, defense: 0 } });

const effectPts = (c: CardDef, i = 0) => analyzeCard(c).points.lines.filter((l) => l.kind === 'effect')[i]!.value;
const keywordPts = (c: CardDef, i = 0) => analyzeCard(c).points.lines.filter((l) => l.kind === 'keyword')[i]!.value;
const abilityPts = (c: CardDef, i = 0) => analyzeCard(c).points.lines.filter((l) => l.kind === 'ability')[i]!.value;

// ---------------------------------------------------------------- 定義：ポイントとテキスト
describe('キーワード（○ バッチB）：ポイントとテキスト', () => {
  // 攻撃力2・体力3 のモンスター
  const table: [string, number | undefined, number, string][] = [
    ['hitAndRun', undefined, 1, '攻撃したあと、持ち主の手札に戻る'],
    ['inspire', 1, 4.5, '自分の他のモンスターの攻撃力+1（場にいる間）'],
    ['ward', 2, 6, '相手のカードの対象にするとコスト+2'],
    ['onslaught', 2, 4, '相手プレイヤーを攻撃するとき、攻撃力+2'],
    ['menace', undefined, 3, '攻撃したとき、反撃を受けない'],
    ['doubleTeam', undefined, 5, '初めて攻撃したとき、分身を失ったこのカードのコピーを手札に加える'],
  ];
  it.each(table)('%s（%s）：%ipt、テキスト、違反なし', (id, value, pts, text) => {
    const c = MON(2, 3, { keywords: [KW(id, value)] });
    expect(analyzeCard(c).violations).toEqual([]);
    expect(keywordPts(c)).toBe(pts);
    expect(analyzeCard(c).text.keywords[0]!.text).toBe(text);
  });
  it('威圧は攻撃力が高いほど高い（max(3, 攻撃力×1)）。護法の追加コストは2まで', () => {
    expect(keywordPts(MON(5, 3, { keywords: [KW('menace')] }))).toBe(5);
    expect(codes(analyzeCard(MON(2, 3, { keywords: [KW('ward', 3)] })).violations)).toContain('KEYWORD_VALUE');
    expect(getKeyword('inspire')!.displayName({ id: 'inspire', value: 2 })).toBe('激励2');
  });
});

describe('効果（○ バッチB）：ポイントとテキスト', () => {
  // [カード, ポイント, テキスト]
  const S = (e: Partial<EffectInstance> & { id: string }, extra: Partial<CardDef> = {}) => SPELL([fx({ target: 'self', ...e })], extra);
  const table: [string, CardDef, number, string][] = [
    ['equip', SPELL([fx({ id: 'equip', value: 2 })]), 9, '自分のモンスター1体に装備する：攻撃力+2（そのモンスターが場を離れると、このカードは手札に戻る）。'],
    ['slay', SPELL([fx({ id: 'slay', value: 2 })]), 20, 'コスト2以下の相手モンスター1体を破壊する。'],
    ['slay0', SPELL([fx({ id: 'slay', value: 0 })]), 10, 'コスト0以下の相手モンスター1体を破壊する。'],
    ['borrow1', SPELL([fx({ id: 'borrow', value: 1 })]), 14, '相手モンスター1体を1ターンの間奪う（すぐ攻撃できる。期限が来たら持ち主に戻す）。'],
    ['borrow3', SPELL([fx({ id: 'borrow', value: 3 })]), 28, '相手モンスター1体を3ターンの間奪う（すぐ攻撃できる。期限が来たら持ち主に戻す）。'],
    ['bank', S({ id: 'bank', value: 1, timing: 'turnEnd' }), 20, '自分のターン終了時、残ったエナジーを最大1まで次のターンへ持ち越す。'],
    ['bounty', SPELL([fx({ id: 'bounty', value: 1 })]), 5, '相手モンスター1体に懸賞を掛ける（破壊されたら、カードを1枚引く）。'],
    ['prepare', S({ id: 'prepare', value: 1 }), 3, '次のターンに引く枚数+1。'],
    ['prepareBoth', S({ id: 'prepare', value: 2, target: 'bothPlayers' }), 3, 'お互い、次のターンに引く枚数+2。'],
    ['cascade', S({ id: 'cascade', value: 2 }), 20, '山札の上からコスト2以下のカードが出るまでめくり、それを無料で使う。'],
    ['millSelf', S({ id: 'mill', value: 2, option: 'self' }), 1, '自分の山札の上2枚を捨て札に置く。'],
    ['millEnemy', S({ id: 'mill', value: 2, option: 'enemy' }), 2, '相手の山札の上2枚を捨て札に置く。'],
    ['quashAny', SPELL([fx({ id: 'quash', target: 'enemyPlayer', option: 'any' })]), 25, '相手が次に使うカード1枚を無効にする（相手の次のターンの終わりまで）。'],
    ['quashSkill', SPELL([fx({ id: 'quash', target: 'enemyPlayer', option: 'skill' })]), 15, '相手が次に使うスキルのカード1枚を無効にする（相手の次のターンの終わりまで）。'],
    ['proliferate', S({ id: 'proliferate', value: 1 }), 5, '相手の毒・出血・呪縛を+1、やけど・弱体・脆弱を1ターン延ばし、自分の筋力・再生を+1する（すでにあるものだけ）。'],
    ['populate', S({ id: 'populate' }), 6, '自分のトークン1体のコピーを出す。'],
    ['explore', SPELL([fx({ id: 'explore', value: 1 })]), 5, '山札の一番上を公開し、モンスターなら手札に加え、違えば捨て札に置いて自分のモンスター1体の攻撃力と体力を+1する。'],
    ['amass', S({ id: 'amass', value: 1 }), 5, '動員1（軍団がいなければ出し、軍団の攻撃力と体力を+1する）。'],
    ['harness', SPELL([fx({ id: 'harness', value: 1 })]), 5, '自分のモンスター1体をこのターン攻撃できなくし、エナジーを1得る。'],
    ['recruit', S({ id: 'recruit' }), 6, 'カードを1枚引き、手札を1枚捨てる。捨てたのがスキルなら攻撃力1・体力1の小鬼を出す。'],
    ['infight', S({ id: 'infight' }), 12, '相手モンスターそれぞれが、ランダムな他の相手モンスター1体に攻撃力ぶんのダメージを与える。'],
    ['seek', S({ id: 'seek', option: 'attack' }), 5, '山札からアタックのカードを1枚ランダムに手札に加える。'],
    ['conjureFire', S({ id: 'conjure', value: 2, hits: 1, option: 'fireball' }), 8, '手札に「火の玉：相手1体に2ダメージ」（コスト0・使い切り）を1枚加える。'],
    ['conjurePotion', S({ id: 'conjure', value: 2, hits: 2, option: 'potion' }), 20, '手札に「薬：HPを2回復」（コスト0・使い切り）を2枚加える。'],
    ['conjureWard', S({ id: 'conjure', value: 1, hits: 1, option: 'ward' }), 5, '手札に「盾：シールド1」（コスト0・使い切り）を1枚加える。'],
    ['discover', S({ id: 'discover' }), 6, '山札の上3枚から1枚を選んで手札に加え、残りを捨て札に置く。'],
    ['boon', S({ id: 'boon', value: 2, hits: 2 }), 10, '次のアタック2回、ダメージ+2（それぞれ最初の1発）。'],
    ['ramp', S({ id: 'ramp' }), 30, '以後ずっと、ターン開始時のエナジー+1（1回まで）。'],
    ['cloneToken', SPELL([fx({ id: 'cloneToken' })]), 25, '相手モンスター1体のコピー（トークン）を自分の場に出す。'],
    ['mobilize', S({ id: 'token', value: 1, hits: 2, option: 'mobilize' }), 7, '攻撃力1・体力1の速攻の小鬼を2体出す（ターン終了時に消える）。'],
    ['tokenNormal', S({ id: 'token', value: 1, hits: 2, option: 'normal' }), 10, '攻撃力1・体力1の小鬼を2体出す。'],
  ];
  it.each(table)('%s：ポイントとテキスト', (_name, c, pts, text) => {
    expect(analyzeCard(c).violations).toEqual([]);
    expect(effectPts(c)).toBe(pts);
    expect(describeEffect(c.effects[0]!)).toBe(text);
  });

  it('新生：モンスターの召喚時だけ・レア以上（6pt）。モンスターでなければ選べない', () => {
    const c = MON(1, 2, { effects: [fx({ id: 'offspring', timing: 'summon', target: 'self' })] });
    expect(analyzeCard(c).violations).toEqual([]);
    expect(effectPts(c)).toBe(6);
    expect(describeEffect(c.effects[0]!)).toBe('召喚時、このモンスターの攻撃力1・体力1のコピーを出す。');
    expect(codes(analyzeCard(SPELL([fx({ id: 'offspring', target: 'self' })])).violations)).toEqual(expect.arrayContaining(['EFFECT_BASE', 'EFFECT_TIMING']));
    expect(codes(analyzeCard({ ...c, rarity: 'common' }).violations)).toContain('EFFECT_RARITY');
    expect(availableEffects('legend', 'spell').map((d) => d.id)).not.toContain('offspring');
    expect(availableEffects('legend', 'monster').map((d) => d.id)).toContain('offspring');
    // モンスターでなくすと新生は外れる
    expect(setMonster(c, false).effects).toEqual([]);
  });

  it('レアリティ・タイミングの制限（validate のコード）', () => {
    const v = (c: CardDef) => codes(analyzeCard(c).violations);
    expect(v(card({ rarity: 'common', cost: 3, effects: [fx({ id: 'borrow', value: 1 })] }))).toContain('EFFECT_RARITY');
    expect(v(card({ rarity: 'common', cost: 3, effects: [fx({ id: 'cascade', value: 1, target: 'self' })] }))).toContain('EFFECT_RARITY');
    expect(v(card({ rarity: 'rare', cost: 3, effects: [fx({ id: 'cloneToken' })] }))).toContain('EFFECT_RARITY');
    expect(v(card({ rarity: 'epic', cost: 5, effects: [fx({ id: 'ramp', target: 'self' })] }))).toContain('EFFECT_RARITY');
    // 蓄えはターン終了時だけ、装備は使用時だけ、動力化は使用時・召喚時だけ
    expect(v(SPELL([fx({ id: 'bank', value: 1, target: 'self' })]))).toContain('EFFECT_TIMING');
    expect(v(SPELL([fx({ id: 'equip', value: 1, timing: 'turnStart', target: 'random' })]))).toContain('EFFECT_TIMING');
    // 装備・動力化は遅延を付けられない、装備は全体に付けられない
    expect(v(SPELL([fx({ id: 'equip', value: 1, mods: ['nextTurn'] })]))).toContain('EFFECT_MODS');
    expect(v(SPELL([fx({ id: 'equip', value: 1, target: 'allyMonsters' })]))).toContain('EFFECT_TARGET');
    expect(v(SPELL([fx({ id: 'slay', value: 6 })]))).toContain('EFFECT_VALUE');
    expect(v(SPELL([fx({ id: 'conjure', value: 1, hits: 3, target: 'self' })]))).toContain('EFFECT_HITS');
  });
});

describe('カードの能力（○ バッチB）：ポイント・テキスト・検証', () => {
  const DMG5 = fx({ id: 'damage', value: 5 });
  const table: [string, CardDef, number, string][] = [
    ['shuffleBack', SPELL([DMG5], { abilities: [AB('shuffleBack')] }), 1, '使ったあと、捨て札ではなく山札に混ぜる。'],
    ['buyback', SPELL([DMG5], { abilities: [AB('buyback')] }), 8, '使ったあと、手札に戻る（同じカードは1ターン1回）。'],
    ['rebound', SPELL([DMG5], { abilities: [AB('rebound')] }), 11, '次の自分のターン開始時に、使用時の効果がもう一度発動する（対象はランダム）。'],
    // ダメージ1つ＋連撃3回＝4発ぶん
    ['grow', SPELL([DMG5, fx({ id: 'multiHit', value: 2, hits: 3 })], { cost: 5, abilities: [AB('grow', 1)] }), 18, '使うたび、このカードのダメージ+1（この1枚だけ。上乗せは10まで）。'],
  ];
  it.each(table)('%s：ポイントとテキスト、違反なし', (_id, c, pts, text) => {
    expect(analyzeCard(c).violations).toEqual([]);
    expect(abilityPts(c)).toBe(pts);
    expect(describeAbility(c.abilities![0]!)).toBe(text);
    expect(analyzeCard(c).text.abilities[0]!.text).toBe(text);
  });

  it('付けられないもの：種類・同時に付けられない・3つ以上・不明・成長はダメージが要る・廃棄と同時は不可', () => {
    const v = (c: CardDef) => codes(analyzeCard(c).violations);
    const DMG = [fx({ id: 'damage', value: 2 })];
    expect(v(SPELL(DMG, { abilities: [AB('shuffleBack'), AB('buyback')] }))).toContain('ABILITY_CONFLICT');
    expect(v(SPELL(DMG, { abilities: [AB('rebound'), AB('buyback')] }))).toContain('ABILITY_CONFLICT');
    expect(v(SPELL(DMG, { abilities: [AB('rebound')], drawbacks: [DB('exhaust')] }))).toContain('ABILITY_CONFLICT');
    expect(v(SPELL(DMG, { abilities: [AB('grow', 1), AB('rebound'), AB('shuffleBack')] }))).toEqual(expect.arrayContaining(['TOO_MANY_ABILITIES']));
    expect(v(SPELL(DMG, { abilities: [AB('nope')] }))).toContain('ABILITY_UNKNOWN');
    expect(v(SPELL(DMG, { abilities: [AB('grow', 1), AB('grow', 1)] }))).toContain('ABILITY_DUPLICATE');
    expect(v(SPELL([fx({ id: 'heal', value: 2, target: 'self' })], { abilities: [AB('grow', 1)] }))).toEqual(expect.arrayContaining(['ABILITY_CARD_TYPE', 'GROW_WITHOUT_DAMAGE']));
    expect(v(MON(1, 1, { abilities: [AB('buyback')] }))).toContain('ABILITY_CARD_TYPE');
    expect(v(SPELL(DMG, { abilities: [AB('grow', 4)] }))).toContain('ABILITY_VALUE');
    // 成長＋反復の2つは付けられる
    expect(v(SPELL(DMG, { abilities: [AB('grow', 1), AB('rebound')] }))).toEqual([]);
  });

  it('エディター：付けられない能力は理由つき。createAbility は初期値を入れる', () => {
    const c = SPELL([fx({ id: 'damage', value: 2 })], { abilities: [AB('rebound')] });
    const byId = Object.fromEntries(abilityChoices(c).map((x) => [x.def.id, x.blocked]));
    expect(byId.rebound).toBe('もう付いています');
    expect(byId.buyback).toContain('同時に付けられません');
    expect(byId.grow).toBeNull();
    expect(abilityChoices(MON(1, 1)).every((x) => x.blocked !== null)).toBe(true);
    expect(createAbility('grow')).toEqual({ id: 'grow', value: 1 });
    expect(listAbilities().map((d) => d.id)).toEqual(['shuffleBack', 'buyback', 'rebound', 'grow']);
  });

  it('取り込み：能力は残り、知らない能力は違反になる。能力の無いカードは形を変えない', () => {
    const c = SPELL([fx({ id: 'damage', value: 2 })], { abilities: [AB('grow', 2)] });
    const r = parseCard(JSON.parse(JSON.stringify(c)));
    expect(r.ok && r.value.abilities).toEqual([{ id: 'grow', value: 2 }]);
    const bad = parseCard({ ...c, abilities: [{ id: 'mystery' }] });
    expect(bad.ok && codes(analyzeCard(bad.value).violations)).toContain('ABILITY_UNKNOWN');
    expect(parseCard({ ...c, abilities: [{ value: 1 }] }).ok).toBe(false);
    const plain = parseCard(JSON.parse(JSON.stringify(ATTACK)));
    expect(plain.ok && 'abilities' in plain.value).toBe(false);
  });
});

// ---------------------------------------------------------------- 対戦：キーワード
describe('キーワード（○ バッチB）：対戦', () => {
  it('一撃離脱：反撃と「攻撃するたび」のあとで手札に戻る。トークン・封印なら戻らない', () => {
    let g = rich(startGame());
    const m = putMonster(g, 0, MON(3, 5, { keywords: [KW('hitAndRun')], effects: [fx({ id: 'heal', value: 2, timing: 'attack', target: 'self' })] }));
    const e = putMonster(g, 1, MON(1, 9));
    g.players[0].hp = 100;
    g = attack(g, m, M(e));
    expect(monster(g, m)).toBeUndefined();
    expect(handIds(g, 0)).toContain(m);
    expect(g.players[0].hp).toBe(102); // 攻撃するたびの回復は手札に戻る前
    expect(monster(g, e)!.hp).toBe(6);
    expect(logText(g).indexOf('反撃')).toBeLessThan(logText(g).indexOf('一撃離脱'));
    // 封印されていれば戻らない
    const s = putMonster(g, 0, MON(1, 5, { keywords: [KW('hitAndRun')] }), { sealed: true });
    g = attack(g, s, P(1));
    expect(monster(g, s)).toBeDefined();
  });

  it('激励：自分の他のモンスターの攻撃力+N（重ねがけは合計・自分には乗らない・封印で止まる・反撃にも乗る・奪われたら奪った側）', () => {
    let g = rich(startGame());
    const a = putMonster(g, 0, MON(1, 9, { keywords: [KW('inspire', 1)] }));
    const b = putMonster(g, 0, MON(1, 9, { keywords: [KW('inspire', 2)] }));
    const c = putMonster(g, 0, MON(1, 9));
    const eff = (uid: string) => battle.effectiveAttack(g, monster(g, uid)!);
    expect([eff(a), eff(b), eff(c)]).toEqual([3, 2, 4]);
    monster(g, b)!.sealed = true;
    expect([eff(a), eff(c)]).toEqual([1, 2]);
    monster(g, b)!.sealed = false;
    // 反撃にも乗る：相手の1/9 が c を攻撃すると、c（攻撃力4）が反撃
    g.players[1].board.push(...[]);
    const enemy = putMonster(g, 1, MON(1, 9));
    g = endTurn(g);
    g = attack(g, enemy, M(c));
    expect(monster(g, enemy)!.hp).toBe(5);
    // 奪われると奪った側の味方を強化
    g = rich(g, 1);
    g = play(g, giveCard(g, 1, SPELL([fx({ id: 'steal' })])), { enemy: M(a) });
    expect(battle.effectiveAttack(g, monster(g, enemy)!)).toBe(2);
  });

  it('護法：選んだ1体にするとコスト+N。足りなければ legal に出ない。ランダムは払わない', () => {
    let g = startGame();
    const w = putMonster(g, 1, MON(1, 9, { keywords: [KW('ward', 2)] }));
    const bolt = giveCard(g, 0, card({ id: 'bolt', name: '雷', cost: 1, effects: [fx({ id: 'damage', value: 2 })] }));
    g.players[0].energy = 2;
    const info = battle.playInfo(g, 0, g.players[0].hand.find((c) => c.uid === bolt)!);
    expect(info.cost).toBe(1);
    expect(info.targetCosts).toEqual({ [w]: 3 });
    const legal = battle.legalActions(g, 0).filter((a) => a.type === 'playCard' && a.cardUid === bolt);
    expect(legal.map((a) => (a.type === 'playCard' ? a.chosen?.enemy : null))).toEqual([P(1)]);
    expect(actError(g, { type: 'playCard', player: 0, cardUid: bolt, chosen: { enemy: M(w) } })).toContain('護法で+2');
    g.players[0].energy = 3;
    g = play(g, bolt, { enemy: M(w) });
    expect(g.players[0].energy).toBe(0);
    expect(monster(g, w)!.hp).toBe(7);
    // ランダムは払わない
    g.players[0].energy = 1;
    const r = giveCard(g, 0, card({ id: 'rnd', name: '乱', cost: 1, effects: [fx({ id: 'damage', value: 2, target: 'random' })] }));
    g = play(g, r);
    expect(g.players[0].energy).toBe(0);
  });

  it('護法：相手の護法モンスターしか対象がいなくて払えなければ、使えない（blocked）', () => {
    const g = startGame();
    putMonster(g, 1, MON(1, 9, { keywords: [KW('ward', 2)] }));
    const kill = giveCard(g, 0, card({ id: 'kill', name: '討', cost: 1, effects: [fx({ id: 'execute', value: 3 })] }));
    g.players[0].energy = 2;
    expect(battle.playInfo(g, 0, g.players[0].hand.find((c) => c.uid === kill)!).blocked).toContain('護法');
  });

  it('猛襲：相手プレイヤーへの攻撃だけ+N。威圧：倒せなくても反撃を受けない', () => {
    let g = startGame();
    const o = putMonster(g, 0, MON(2, 5, { keywords: [KW('onslaught', 3)] }));
    const e = putMonster(g, 1, MON(0, 20));
    g = attack(g, o, P(1));
    expect(g.players[1].hp).toBe(115);
    g = endTurn(endTurn(g));
    g = attack(g, o, M(e));
    expect(monster(g, e)!.hp).toBe(18);
    const mn = putMonster(g, 0, MON(2, 3, { keywords: [KW('menace')] }));
    const big = putMonster(g, 1, MON(5, 20));
    g = attack(g, mn, M(big));
    expect(monster(g, mn)!.hp).toBe(3);
    expect(logText(g)).toContain('威圧');
  });

  it('分身：初めて攻撃したとき、コピー（分身なし・デッキに残る）を手札に。2回目は出ない。トークンでは働かない', () => {
    let g = startGame();
    const def = MON(2, 9, { keywords: [KW('doubleTeam')] });
    const d = putMonster(g, 0, def);
    g = attack(g, d, P(1));
    const copy = g.players[0].hand.find((c) => c.cardId === monster(g, d)!.card.cardId)!;
    expect(copy).toMatchObject({ copy: 'keep', lostKeywords: ['doubleTeam'] });
    expect(monster(g, d)!.card.lostKeywords).toEqual(['doubleTeam']);
    expect(battle.keywordFlags(g, monster(g, d)!).doubleTeam).toBeUndefined();
    g = endTurn(endTurn(g));
    const before = g.players[0].hand.length;
    g = attack(g, d, P(1));
    expect(g.players[0].hand.length).toBe(before);
    // 複写トークンでは働かない
    const tk = putMonster(g, 0, def, { card: { uid: 'tkx', cardId: `p0:${def.id}`, owner: 0, token: { attack: 1, hp: 1, copy: true } } });
    const n = g.players[0].hand.length;
    g = attack(g, tk, P(1));
    expect(g.players[0].hand.length).toBe(n);
  });
});

// ---------------------------------------------------------------- 対戦：効果
describe('効果（○ バッチB）：対戦', () => {
  it('装備：攻撃力+N、カードはモンスターに付き、場を離れると持ち主の手札へ（奪われていても持ち主の手札）', () => {
    let g = rich(startGame());
    const m = putMonster(g, 0, MON(1, 3));
    const sword = giveCard(g, 0, card({ id: 'sword', name: '剣', cost: 1, effects: [fx({ id: 'equip', value: 2 })] }));
    g = play(g, sword, { ally: m });
    expect(monster(g, m)!.attack).toBe(3);
    expect(monster(g, m)!.equipment!.map((c) => c.uid)).toEqual([sword]);
    expect(g.players[0].discard.some((c) => c.uid === sword)).toBe(false);
    // 相手に奪われて破壊されても、剣は持ち主（P0）の手札へ
    g = endTurn(g);
    g = rich(g, 1);
    g = play(g, giveCard(g, 1, SPELL([fx({ id: 'steal' })])), { enemy: M(m) });
    expect(monster(g, m)!.equipment).toHaveLength(1);
    g = endTurn(g);
    g = rich(g, 0);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'execute', value: 9 })])), { enemy: M(m) });
    expect(monster(g, m)).toBeUndefined();
    expect(g.players[0].hand.some((c) => c.uid === sword)).toBe(true);
  });

  it('討伐：コストN以下なら破壊（不屈・聖盾も効かない）、超えれば不発。トークンはコスト0。ランダムは条件に合うものから', () => {
    let g = rich(startGame());
    const cheap = putMonster(g, 1, MON(1, 9, { cost: 2, keywords: [KW('undying'), KW('divineShield')] }));
    const pricey = putMonster(g, 1, MON(1, 9, { cost: 3 }));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'slay', value: 2 })])), { enemy: M(pricey) });
    expect(monster(g, pricey)).toBeDefined();
    expect(logText(g)).toContain('討伐できない');
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'slay', value: 2 })])), { enemy: M(cheap) });
    expect(monster(g, cheap)).toBeUndefined();
    // ランダム：コスト0以下（トークン）だけから選ぶ
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'token', value: 3, hits: 1, target: 'self' })])));
    g = endTurn(g);
    g = rich(g, 1);
    g = play(g, giveCard(g, 1, SPELL([fx({ id: 'token', value: 1, hits: 1, target: 'self' })])));
    const tk = g.players[1].board.find((m) => m.card.token)!.uid;
    g = play(g, giveCard(g, 1, SPELL([fx({ id: 'slay', value: 0, target: 'random' })])));
    expect(g.players[0].board.filter((m) => m.card.token)).toHaveLength(0);
    expect(monster(g, tk)).toBeDefined();
  });

  it('借用：すぐ攻撃でき、自分のターン終了時に数えて期限で元の持ち主へ（戻ったら攻撃できる）', () => {
    let g = rich(startGame());
    const e = putMonster(g, 1, MON(3, 9));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'borrow', value: 1 })])), { enemy: M(e) });
    expect(monster(g, e)!.controller).toBe(0);
    expect(battle.attackBlockReason(g, monster(g, e)!)).toBeNull();
    g = attack(g, e, P(1));
    expect(g.players[1].hp).toBe(117);
    g = endTurn(g);
    expect(monster(g, e)!.controller).toBe(1);
    expect(battle.attackBlockReason(g, monster(g, e)!)).toBeNull();
    // 2ターン：1回目の自分のターン終了では戻らない
    g = endTurn(g);
    g = rich(g, 0);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'borrow', value: 2 })])), { enemy: M(e) });
    g = endTurn(endTurn(g));
    expect(monster(g, e)!.controller).toBe(0);
    expect(monster(g, e)!.counters.borrowLeft).toBe(1);
    g = endTurn(g);
    expect(monster(g, e)!.controller).toBe(1);
    expect(monster(g, e)!.counters.borrowLeft).toBeUndefined();
  });

  it('蓄え：ターン終了時に残ったエナジーを最大Nまで次のターンへ', () => {
    let g = startGame();
    g = play(g, giveCard(g, 0, card({ id: 'bank', name: '蓄え', rarity: 'legend', cost: 0, effects: [fx({ id: 'bank', value: 2, timing: 'turnEnd', target: 'self' })] })));
    g.players[0].energy = 5;
    g = endTurn(endTurn(g));
    // 2ターン目の基本3＋持ち越し2
    expect(energyOf(g, 0)).toBe(5);
  });

  it('懸賞：破壊されたら掛けた人が引く。バウンスでは引けずに消える', () => {
    let g = rich(startGame());
    const e = putMonster(g, 1, MON(1, 9));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'bounty', value: 2 })])), { enemy: M(e) });
    expect(monster(g, e)!.bounty).toEqual([{ player: 0, draw: 2 }]);
    const hand = g.players[0].hand.length;
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'execute', value: 9 })])), { enemy: M(e) });
    expect(g.players[0].hand.length).toBe(hand + 2);
    const f = putMonster(g, 1, MON(1, 9, { cost: 1 }));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'bounty', value: 2 })])), { enemy: M(f) });
    const h2 = g.players[0].hand.length;
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'bounce', value: 5 })])), { enemy: M(f) });
    expect(g.players[0].hand.length).toBe(h2);
    expect(g.players[1].hand.at(-1)!.uid).toBe(f);
  });

  it('準備：次のターンに引く枚数+N', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'prepare', value: 2, target: 'self' })])));
    g = endTurn(endTurn(g));
    expect(g.players[0].hand.length).toBe(7);
  });

  it('続唱：コストN以下が出るまでめくって無料で使い、他は元の順で山札の下へ。見つからなければ全部下へ', () => {
    let g = rich(startGame());
    const casc = SPELL([fx({ id: 'cascade', value: 1, target: 'self' })]);
    const [a, b, c] = setDeck(g, 0, [BIG, BIG, card({ id: 'heal2', name: '癒し', cost: 1, effects: [fx({ id: 'heal', value: 7, target: 'self' })] }), BIG]);
    g.players[0].hp = 100;
    const energy = energyOf(g, 0);
    g = play(g, giveCard(g, 0, casc));
    expect(g.players[0].hp).toBe(107);
    expect(energyOf(g, 0)).toBe(energy - casc.cost);
    expect(g.players[0].deck.map((x) => x.uid).slice(-2)).toEqual([a, b]);
    expect(g.players[0].discard.some((x) => x.uid === c)).toBe(true);
    expect(logText(g)).toContain('無料で使った');
    // 見つからない
    const before = g.players[0].deck.map((x) => x.uid);
    setDeck(g, 0, [BIG, BIG]);
    const order = g.players[0].deck.map((x) => x.uid);
    g = play(g, giveCard(g, 0, casc));
    expect(g.players[0].deck.map((x) => x.uid)).toEqual(order);
    expect(before.length).toBeGreaterThan(0);
  });

  it('続唱：対象を選ぶカードは相手側から選び（候補1つなら選ばない）、生け贄で使えないカードは手札へ、連鎖は2段まで', () => {
    let g = rich(startGame());
    const e1 = putMonster(g, 1, MON(1, 9));
    const e2 = putMonster(g, 1, MON(1, 9));
    setDeck(g, 0, [card({ id: 'bolt3', name: '雷3', cost: 1, effects: [fx({ id: 'damage', value: 3 })] })]);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'cascade', value: 1, target: 'self' })])));
    expect(g.pending?.step.t).toBe('freePlay');
    expect(g.pending!.options.map((o) => o.id)).toEqual(['player:1', e1, e2]);
    g = act(g, { type: 'choose', player: 0, picks: [e2] });
    expect(monster(g, e2)!.hp).toBe(6);
    // 生け贄のデメリットで使えないカードは手札へ
    let h = rich(startGame());
    const sac = card({ id: 'sacB', name: '贄', cost: 1, effects: [fx({ id: 'heal', value: 1, target: 'self' })], drawbacks: [DB('sacrifice', { timing: 'play' }), DB('selfDamage', { value: 9, timing: 'play' })] });
    const [s] = setDeck(h, 0, [sac]);
    h = play(h, giveCard(h, 0, SPELL([fx({ id: 'cascade', value: 1, target: 'self' })])));
    expect(handIds(h, 0)).toContain(s);
    // 連鎖：続唱 → 続唱 → 続唱（3段目は手札へ）
    let k = rich(startGame());
    const chain = card({ id: 'chain', name: '連鎖', rarity: 'rare', cost: 1, effects: [fx({ id: 'cascade', value: 1, target: 'self' })] });
    const ids = setDeck(k, 0, [chain, chain, chain]);
    k = play(k, giveCard(k, 0, chain));
    expect(handIds(k, 0)).toContain(ids[2]);
    expect(logText(k)).toContain('2段まで');
  });

  it('新生：コピー（効果・キーワードを持つ1/1のトークン）を出し、コピーの召喚時の効果も出るが、新生は連鎖しない', () => {
    let g = rich(startGame());
    const def = MON(3, 4, {
      keywords: [KW('taunt')],
      effects: [fx({ id: 'offspring', timing: 'summon', target: 'self' }), fx({ id: 'heal', value: 2, timing: 'summon', target: 'self' })],
    });
    g.players[0].hp = 100;
    g = play(g, giveCard(g, 0, def));
    const copies = g.players[0].board.filter((m) => m.card.token);
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ attack: 1, hp: 1, card: { cardId: `p0:${def.id}`, token: { copy: true } } });
    expect(battle.keywordFlags(g, copies[0]!).taunt).toBe(true);
    expect(g.players[0].hp).toBe(104); // 本体とコピーの回復2ずつ
    expect(logText(g)).toContain('トークンは複写できない');
  });

  it('切削：山札の上N枚を捨て札へ（足りなければある分）', () => {
    let g = rich(startGame());
    const top = g.players[1].deck.slice(0, 2).map((c) => c.uid);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'mill', value: 2, option: 'enemy', target: 'self' })])));
    expect(g.players[1].discard.map((c) => c.uid)).toEqual(top);
    g.players[0].deck = g.players[0].deck.slice(0, 1);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'mill', value: 3, option: 'self', target: 'self' })])));
    expect(g.players[0].deck).toHaveLength(0);
  });

  it('封殺：相手が次に使う指定の種類のカードを無効にする（コストは払う）。種類が違えば残る・期限で消える・浄化で消える', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'quash', target: 'enemyPlayer', option: 'attack' })])));
    expect(g.players[1].quash).toEqual({ kind: 'attack', until: g.turnIndex + 1 });
    g = endTurn(g);
    g = rich(g, 1, 5);
    // スキルは当たらない
    g.players[1].hp = 100;
    g = play(g, giveCard(g, 1, SKILL));
    expect(g.players[1].hp).toBe(101);
    expect(g.players[1].quash).toBeDefined();
    // アタックは無効：コストは払い、ダメージなし、捨て札へ
    const atk = giveCard(g, 1, card({ id: 'atk5', name: '矢5', cost: 1, effects: [fx({ id: 'damage', value: 5 })] }));
    const info = battle.playInfo(g, 1, g.players[1].hand.find((c) => c.uid === atk)!);
    expect(info.warnings.some((w) => w.startsWith('封殺'))).toBe(true);
    g = play(g, atk, { enemy: P(0) });
    expect(g.players[0].hp).toBe(120);
    expect(g.players[1].energy).toBe(3);
    expect(g.players[1].discard.some((c) => c.uid === atk)).toBe(true);
    expect(g.players[1].quash).toBeUndefined();
    expect(g.players[1].turn.cardsPlayed).toBe(2);
    // 期限：使わなければ相手の次のターンの終わりに消える
    g = endTurn(g);
    g = rich(g, 0);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'quash', target: 'enemyPlayer', option: 'any' })])));
    g = endTurn(g);
    expect(g.players[1].quash).toBeDefined();
    g = endTurn(g);
    expect(g.players[1].quash).toBeUndefined();
    // 浄化で消える
    g = rich(g, 0);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'quash', target: 'enemyPlayer', option: 'any' })])));
    g = endTurn(g);
    g = rich(g, 1);
    g = play(g, giveCard(g, 1, card({ id: 'cl', name: '浄化', cost: 0, effects: [fx({ id: 'cleanse', target: 'self' })] })));
    // 浄化そのものが封殺に当たって消える（すべての種類）
    expect(g.players[1].quash).toBeUndefined();
    expect(logText(g)).toContain('封殺：「浄化」は無効になった');
  });

  it('封殺：浄化（種類が違えば当たらない）で解ける', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'quash', target: 'enemyPlayer', option: 'attack' })])));
    g = endTurn(g);
    g = rich(g, 1);
    g = play(g, giveCard(g, 1, card({ id: 'cl2', name: '浄化2', cost: 0, effects: [fx({ id: 'cleanse', target: 'self' })] })));
    expect(g.players[1].quash).toBeUndefined();
  });

  it('増殖：あるものだけ増やす', () => {
    let g = rich(startGame());
    Object.assign(g.players[1].status, { poison: 3, burn: 1, weak: 0 });
    g.players[0].status.strength = 2;
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'proliferate', value: 2, target: 'self' })])));
    expect(g.players[1].status).toMatchObject({ poison: 5, burn: 2, weak: 0, vulnerable: 0, bleed: 0 });
    expect(g.players[0].status.strength).toBe(4);
    expect(g.players[0].status.regen).toBe(0);
  });

  it('居住：自分のトークンのコピー（軍団は選べない）。トークンがいなければ不発', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'populate', target: 'self' })])));
    expect(logText(g)).toContain('選べるものがない');
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'token', value: 2, hits: 1, target: 'self' })])));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'amass', value: 3, target: 'self' })])));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'populate', target: 'self' })])));
    const tokens = g.players[0].board.filter((m) => m.card.token);
    expect(tokens.map((m) => [m.card.cardId, m.attack, m.hp])).toEqual([
      [battle.TOKEN_CARD_ID, 2, 2],
      [battle.ARMY_CARD_ID, 3, 3],
      [battle.TOKEN_CARD_ID, 2, 2],
    ]);
  });

  it('探検：モンスターなら手札へ（引いた扱い）、違えば捨て札へ置いて+N/+N。対象がいなくても移動はする', () => {
    let g = rich(startGame());
    const [mon] = setDeck(g, 0, [BEAST, SKILL]);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'explore', value: 2, target: 'random' })])));
    expect(handIds(g, 0)).toContain(mon);
    const sk = g.players[0].deck[0]!.uid;
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'explore', value: 2, target: 'random' })])));
    expect(g.players[0].discard.some((c) => c.uid === sk)).toBe(true);
    const m = putMonster(g, 0, MON(1, 1));
    setDeck(g, 0, [SKILL]);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'explore', value: 2 })])), { ally: m });
    expect(monster(g, m)).toMatchObject({ attack: 3, hp: 3 });
  });

  it('動員：軍団（0/0）を出してから+N。2回目は同じ軍団が育つ。トークンの上限に数える', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'amass', value: 2, target: 'self' })])));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'amass', value: 1, target: 'self' })])));
    const army = g.players[0].board.filter((m) => m.card.cardId === battle.ARMY_CARD_ID);
    expect(army).toHaveLength(1);
    expect(army[0]).toMatchObject({ attack: 3, hp: 3, maxHp: 3 });
    expect(g.cards[battle.ARMY_CARD_ID]!.name).toBe('軍団');
    // 上限5：軍団1＋小鬼4＋応召（出ない）
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'token', value: 1, hits: 3, target: 'self' })])));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'token', value: 1, hits: 3, target: 'self', option: 'mobilize' })])));
    expect(battle.tokenCount(g, 0)).toBe(5);
  });

  it('動力化：まだ攻撃できるモンスターを使ってエナジー+N。攻撃済みなら不発', () => {
    let g = startGame();
    const m = putMonster(g, 0, MON(2, 2));
    const n = putMonster(g, 0, MON(2, 2));
    g.players[0].energy = 3;
    g = play(g, giveCard(g, 0, card({ id: 'hr', name: '水', cost: 1, effects: [fx({ id: 'harness', value: 2 })] })), { ally: m });
    expect(energyOf(g, 0)).toBe(4);
    expect(battle.attackBlockReason(g, monster(g, m)!)).toBe('このターンはもう攻撃しました');
    g = attack(g, n, P(1));
    g = play(g, giveCard(g, 0, card({ id: 'hr2', name: '水2', cost: 1, effects: [fx({ id: 'harness', value: 2 })] })), { ally: n });
    expect(energyOf(g, 0)).toBe(3);
  });

  it('徴募：1枚引いて1枚捨て、スキルなら小鬼が出る', () => {
    let g = rich(startGame());
    g.players[0].hand = [];
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'recruit', target: 'self' })])));
    // 引いた1枚（練習用の薬＝スキル）しかないので、それを捨てる
    expect(g.players[0].hand).toHaveLength(0);
    expect(g.players[0].board.filter((m) => m.card.token)).toHaveLength(1);
    giveCard(g, 0, ATTACK);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'recruit', target: 'self' })])));
    expect(g.pending?.step).toMatchObject({ t: 'discardChoice', then: 'recruit' });
    const atk = g.players[0].hand.find((c) => c.cardId.endsWith('atkB'))!.uid;
    g = act(g, { type: 'choose', player: 0, picks: [atk] });
    expect(g.players[0].board.filter((m) => m.card.token)).toHaveLength(1);
  });

  it('同士討ち：相手モンスターがそれぞれ他の1体に攻撃力ぶん。1体だけなら何もしない', () => {
    let g = rich(startGame());
    const a = putMonster(g, 1, MON(3, 9));
    const b = putMonster(g, 1, MON(5, 9));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'infight', target: 'self' })])));
    expect([monster(g, a)!.hp, monster(g, b)!.hp]).toEqual([4, 6]);
    const h = rich(startGame());
    const c = putMonster(h, 1, MON(3, 9));
    const h2 = play(h, giveCard(h, 0, SPELL([fx({ id: 'infight', target: 'self' })])));
    expect(monster(h2, c)!.hp).toBe(9);
  });

  it('抽出：指定の種類から1枚ランダムに手札へ。他の山札の順は変わらない', () => {
    let g = rich(startGame());
    const ids = setDeck(g, 0, [SKILL, ATTACK, SKILL, BEAST, SKILL]);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'seek', option: 'monster', target: 'self' })])));
    expect(handIds(g, 0)).toContain(ids[3]);
    expect(g.players[0].deck.map((c) => c.uid)).toEqual([ids[0], ids[1], ids[2], ids[4]]);
    expect(g.log.some((e) => e.private === 0 && e.text.includes('獣B'))).toBe(true);
  });

  it('創出：使い切りのカード（コスト0）を手札に作る。使えて、ターン終了で除外', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'conjure', value: 3, hits: 2, option: 'fireball', target: 'self' })])));
    const made = g.players[0].hand.filter((c) => c.cardId.startsWith(battle.CONJURE_PREFIX));
    expect(made).toHaveLength(2);
    expect(made.every((c) => c.copy === 'temp')).toBe(true);
    expect(g.cards[made[0]!.cardId]).toMatchObject({ name: '火の玉', cost: 0 });
    g = play(g, made[0]!.uid, { enemy: P(1) });
    expect(g.players[1].hp).toBe(117);
    g = endTurn(g);
    expect(g.players[0].exile.filter((c) => c.cardId.startsWith(battle.CONJURE_PREFIX))).toHaveLength(2);
  });

  it('発見：上3枚から1枚を手札へ、残りは捨て札へ。選択肢は相手に見えない', () => {
    let g = rich(startGame());
    const ids = setDeck(g, 0, [SKILL, ATTACK, BEAST, BIG]);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'discover', target: 'self' })])));
    expect(g.pending!.options.map((o) => o.id)).toEqual(ids.slice(0, 3));
    expect(battle.viewFor(g, 1).pending!.options).toEqual([]);
    expect(battle.viewFor(g, 0).pending!.options).toHaveLength(3);
    g = act(g, { type: 'choose', player: 0, picks: [ids[1]!] });
    expect(handIds(g, 0)).toContain(ids[1]);
    expect(g.players[0].discard.map((c) => c.uid)).toEqual(expect.arrayContaining([ids[0], ids[2]]));
    expect(g.players[0].deck[0]!.uid).toBe(ids[3]);
  });

  it('恩恵：次のアタックM回、最初の1発+N（スキルでは減らない）', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'boon', value: 3, hits: 2, target: 'self' })])));
    expect(g.players[0].status).toMatchObject({ boon: 3, boonUses: 2 });
    g = play(g, giveCard(g, 0, SKILL));
    expect(g.players[0].status.boonUses).toBe(2);
    g = play(g, giveCard(g, 0, card({ id: 'mh', name: '連', cost: 1, effects: [fx({ id: 'multiHit', value: 1, hits: 2 })] })), { enemy: P(1) });
    expect(g.players[1].hp).toBe(120 - 4 - 1);
    g = play(g, giveCard(g, 0, ATTACK), { enemy: P(1) });
    expect(g.players[1].hp).toBe(115 - 4);
    expect(g.players[0].status.boonUses).toBe(0);
    expect(g.players[0].status.boon).toBe(0);
  });

  it('最大エナジー増加：以後ずっと+1。2回目は不発', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'ramp', target: 'self' })])));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'ramp', target: 'self' })])));
    expect(g.players[0].energyBonus).toBe(1);
    expect(logText(g)).toContain('もう増やせない');
    g = endTurn(endTurn(g));
    expect(energyOf(g, 0)).toBe(4);
  });

  it('複写召喚：相手モンスターの印刷された強さ・効果のコピー（受けたダメージは写さない）。軍団は写せない', () => {
    let g = rich(startGame());
    const def = MON(4, 6, { keywords: [KW('flying')] });
    const e = putMonster(g, 1, def, { hp: 2 });
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'cloneToken' })])), { enemy: M(e) });
    const copy = g.players[0].board.find((m) => m.card.token)!;
    expect(copy).toMatchObject({ attack: 4, hp: 6, controller: 0, card: { cardId: `p1:${def.id}`, owner: 0 } });
    expect(battle.keywordFlags(g, copy).flying).toBe(true);
  });

  it('応召：速攻つきで出て、ターン終了時に消える（破壊ではない）', () => {
    let g = rich(startGame());
    putMonster(g, 0, MON(1, 9, { effects: [fx({ id: 'heal', value: 3, timing: 'allyDestroyed', target: 'self' })] }));
    g.players[0].hp = 100;
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'token', value: 2, hits: 1, option: 'mobilize', target: 'self' })])));
    const tk = g.players[0].board.find((m) => m.card.token)!;
    expect(tk.card.token!.temp).toBe(true);
    g = attack(g, tk.uid, P(1));
    expect(g.players[1].hp).toBe(118);
    g = endTurn(g);
    expect(g.players[0].board.some((m) => m.card.token)).toBe(false);
    expect(g.players[0].hp).toBe(100);
    expect(logText(g)).toContain('応召');
  });
});

// ---------------------------------------------------------------- 対戦：カードの能力
describe('カードの能力（○ バッチB）：対戦', () => {
  it('循環：山札に混ざる。再利用：手札に戻る（1ターン1回）。廃棄より先', () => {
    let g = rich(startGame());
    const sh = giveCard(g, 0, card({ id: 'sh', name: '循', effects: [fx({ id: 'heal', value: 1, target: 'self' })], abilities: [AB('shuffleBack')] }));
    g = play(g, sh);
    expect(g.players[0].deck.some((c) => c.uid === sh)).toBe(true);
    const bb = giveCard(g, 0, card({ id: 'bb', name: '再', cost: 1, effects: [fx({ id: 'damage', value: 2 })], abilities: [AB('buyback')] }));
    g = play(g, bb, { enemy: P(1) });
    expect(handIds(g, 0)).toContain(bb);
    g = play(g, bb, { enemy: P(1) });
    expect(handIds(g, 0)).not.toContain(bb);
    expect(g.players[0].discard.some((c) => c.uid === bb)).toBe(true);
    expect(g.players[1].hp).toBe(116);
  });

  it('反復：次の自分のターン開始時に使用時の効果がもう一度（対象はランダム）、そのあと捨て札へ。カードを使ったことには数えない', () => {
    let g = rich(startGame());
    const rb = giveCard(g, 0, card({ id: 'rb', name: '反', cost: 1, effects: [fx({ id: 'damage', value: 3 })], abilities: [AB('rebound')] }));
    g = play(g, rb, { enemy: P(1) });
    expect(g.players[1].hp).toBe(117);
    expect(g.players[0].delayed).toHaveLength(1);
    expect(g.players[0].delayed![0]!.rebound!.card.uid).toBe(rb);
    expect(g.players[0].discard.some((c) => c.uid === rb)).toBe(false);
    g = endTurn(endTurn(g));
    expect(g.players[1].hp).toBe(114);
    expect(g.players[0].discard.some((c) => c.uid === rb)).toBe(true);
    expect(g.players[0].turn.cardsPlayed).toBe(0);
    expect(g.players[0].delayed).toEqual([]);
  });

  it('成長：使うたびこの1枚のダメージ+N（上限10）。別の個体は0から', () => {
    let g = rich(startGame());
    const def = card({ id: 'gr', name: '成', cost: 1, effects: [fx({ id: 'damage', value: 2 })], abilities: [AB('grow', 4)] });
    const a = giveCard(g, 0, def);
    g = play(g, a, { enemy: P(1) });
    expect(g.players[1].hp).toBe(118);
    const inst = () => g.players[0].discard.find((c) => c.uid === a)!;
    expect(inst().grow).toBe(4);
    // 捨て札から手札に戻して、もう一度
    g.players[0].hand.push(g.players[0].discard.splice(g.players[0].discard.indexOf(inst()), 1)[0]!);
    g = play(g, a, { enemy: P(1) });
    expect(g.players[1].hp).toBe(112);
    for (let i = 0; i < 3; i++) {
      g.players[0].hand.push(g.players[0].discard.splice(g.players[0].discard.indexOf(inst()), 1)[0]!);
      g = play(g, a, { enemy: P(1) });
    }
    expect(inst().grow).toBe(10);
    const b = giveCard(g, 0, def);
    const hp = g.players[1].hp;
    g = play(g, b, { enemy: P(1) });
    expect(g.players[1].hp).toBe(hp - 2);
  });
});

// ---------------------------------------------------------------- 価格の確かめ
describe('価格の確かめ（仕様の例・倍率1）', () => {
  const ok = (c: CardDef) => {
    const a = analyzeCard(c);
    expect(a.violations, c.name).toEqual([]);
    return a;
  };
  it('仕様の例が作れる', () => {
    expect(effectPts(ok(card({ name: '剣', cost: 1, effects: [fx({ id: 'equip', value: 2 })] })) && card({ name: '剣', cost: 1, effects: [fx({ id: 'equip', value: 2 })] }))).toBe(9);
    ok(card({ name: '討伐', cost: 2, effects: [fx({ id: 'slay', value: 2 })] }));
    ok(card({ name: '借用', rarity: 'rare', cost: 1, effects: [fx({ id: 'borrow', value: 1 })] }));
    ok(card({ name: '続唱', rarity: 'rare', cost: 2, effects: [fx({ id: 'cascade', value: 2, target: 'self' })] }));
    ok(card({ name: '封殺', rarity: 'rare', cost: 2, effects: [fx({ id: 'quash', target: 'enemyPlayer' })] }));
    const insp = card({ name: '激励', cost: 1, stats: { attack: 1, hp: 3, defense: 0 }, keywords: [KW('inspire', 1)] });
    expect(ok(insp).points.total).toBe(2);
    // 反復つき「相手1体に5ダメージ」＝26：コスト2コモン（25）は1超え、レアなら作れる
    const rb = (rarity: CardDef['rarity']) => card({ name: '反復', rarity, cost: 2, effects: [fx({ id: 'damage', value: 5 })], abilities: [AB('rebound')] });
    expect(codes(analyzeCard(rb('common')).violations)).toEqual(['POINTS_OVER_CAP']);
    ok(rb('rare'));
  });
  it('作成例4枚は今まで通り作れる', () => {
    for (const c of Object.values(EXAMPLES)) expect(analyzeCard(c).violations, c.name).toEqual([]);
  });
});

// ---------------------------------------------------------------- CPU
describe('CPU（○ バッチB）', () => {
  it('選択：続唱の対象は評価で、居住は一番強いトークン、発見は今使えるカード、徴募はスキルを捨てる', () => {
    // 続唱の対象：相手プレイヤーとモンスター。どの強さでも合法手
    let g = rich(startGame());
    const e1 = putMonster(g, 1, MON(5, 3));
    putMonster(g, 1, MON(1, 9));
    setDeck(g, 0, [card({ id: 'bolt4', name: '雷4', cost: 1, effects: [fx({ id: 'damage', value: 4 })] })]);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'cascade', value: 1, target: 'self' })])));
    for (const level of ai.CPU_LEVELS) expect(battle.validateAction(g, ai.cpuAction(g, 0, 1, level)), level).toBeNull();
    expect(ai.cpuAction(g, 0, 1, 'normal')).toEqual({ type: 'choose', player: 0, picks: [e1] });
    // 居住
    let h = rich(startGame());
    h = play(h, giveCard(h, 0, SPELL([fx({ id: 'token', value: 1, hits: 1, target: 'self' })])));
    h = play(h, giveCard(h, 0, SPELL([fx({ id: 'token', value: 3, hits: 1, target: 'self' })])));
    h = play(h, giveCard(h, 0, SPELL([fx({ id: 'populate', target: 'self' })])));
    const strong = h.players[0].board.find((m) => m.attack === 3)!.uid;
    expect(ai.cpuAction(h, 0, 1, 'normal')).toEqual({ type: 'choose', player: 0, picks: [strong] });
    // 徴募：スキルを優先して捨てる
    let k = rich(startGame());
    k.players[0].hand = [];
    const atk = giveCard(k, 0, ATTACK);
    giveCard(k, 0, ATTACK);
    k = play(k, giveCard(k, 0, SPELL([fx({ id: 'recruit', target: 'self' })])));
    const choice = ai.cpuAction(k, 0, 1, 'normal');
    expect(choice.type === 'choose' && choice.picks.length).toBe(1);
    expect(choice.type === 'choose' && choice.picks[0]).not.toBe(atk);
  });

  it('封殺を掛けられたら、損の少ないカードを捨て駒にして消してから本命を使う', () => {
    let g = startGame();
    g.players[1].quash = { kind: 'any', until: g.turnIndex + 1 };
    g = endTurn(g);
    g.players[1].energy = 3;
    g.players[1].hand = [];
    const junk = giveCard(g, 1, card({ id: 'junk', name: 'くず', cost: 0, effects: [fx({ id: 'heal', value: 1, target: 'self' })] }));
    giveCard(g, 1, card({ id: 'nuke', name: '大技', cost: 3, effects: [fx({ id: 'damage', value: 15 })] }));
    const a = ai.cpuAction(g, 1, 1, 'normal');
    expect(a).toMatchObject({ type: 'playCard', cardUid: junk });
  });

  // 新しい要素を詰めたデッキ（すべて作れるカード）
  const m = (id: string, name: string, a: number, h: number, extra: Partial<CardDef> = {}) => card({ id, name, cost: 2, stats: { attack: a, hp: h, defense: 0 }, ...extra });
  const s = (id: string, name: string, effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id, name, effects, ...extra });
  const cards: CardDef[] = [
    m('hitrun', '一撃離脱', 2, 2, { keywords: [KW('hitAndRun')], effects: [fx({ id: 'damage', value: 1, timing: 'summon', target: 'random' })] }),
    m('inspire', '激励の旗手', 1, 3, { cost: 1, keywords: [KW('inspire', 1)] }),
    m('ward', '護法の盾', 2, 4, { keywords: [KW('ward', 1)] }),
    m('onslaught', '猛襲', 2, 3, { keywords: [KW('onslaught', 2)] }),
    m('menace', '威圧', 2, 3, { keywords: [KW('menace')] }),
    m('twin', '分身', 1, 3, { keywords: [KW('doubleTeam')] }),
    s('sword', '剣', [fx({ id: 'equip', value: 2 })]),
    s('slay', '討伐', [fx({ id: 'slay', value: 2 })], { cost: 2 }),
    s('borrow', '借用', [fx({ id: 'borrow', value: 1 })], { rarity: 'rare' }),
    s('bank', '蓄え', [fx({ id: 'bank', value: 1, timing: 'turnEnd', target: 'self' })], { cost: 2 }),
    s('bounty', '懸賞', [fx({ id: 'bounty', value: 1 }), fx({ id: 'damage', value: 2 })]),
    s('prepare', '準備', [fx({ id: 'prepare', value: 1, target: 'self' }), fx({ id: 'heal', value: 2, target: 'self' })]),
    s('cascade', '続唱', [fx({ id: 'cascade', value: 2, target: 'self' })], { rarity: 'rare', cost: 2 }),
    m('offspring', '新生', 1, 2, { rarity: 'rare', effects: [fx({ id: 'offspring', timing: 'summon', target: 'self' })] }),
    s('mill', '切削', [fx({ id: 'mill', value: 2, option: 'self', target: 'self' }), fx({ id: 'damage', value: 3 })]),
    s('quash', '封殺', [fx({ id: 'quash', target: 'enemyPlayer', option: 'attack' })], { rarity: 'rare', cost: 1 }),
    s('prolif', '増殖', [fx({ id: 'poison', value: 2 }), fx({ id: 'proliferate', value: 1, target: 'self' })]),
    s('populate', '居住', [fx({ id: 'populate', target: 'self' }), fx({ id: 'token', value: 1, hits: 1, target: 'self' })], { cost: 2 }),
    s('explore', '探検', [fx({ id: 'explore', value: 1, target: 'random' })]),
    s('amass', '動員', [fx({ id: 'amass', value: 2, target: 'self' })]),
    s('harness', '水の技', [fx({ id: 'harness', value: 1, target: 'random' }), fx({ id: 'draw', value: 1, target: 'self' })]),
    s('recruit', '徴募', [fx({ id: 'recruit', target: 'self' })]),
    s('infight', '同士討ち', [fx({ id: 'infight', target: 'self' })], { rarity: 'rare' }),
    s('seek', '抽出', [fx({ id: 'seek', option: 'monster', target: 'self' })]),
    s('conjure', '創出', [fx({ id: 'conjure', value: 2, hits: 1, option: 'fireball', target: 'self' })]),
    s('discover', '発見', [fx({ id: 'discover', target: 'self' })]),
    s('boon', '恩恵', [fx({ id: 'boon', value: 2, hits: 2, target: 'self' })]),
    s('clone', '複写', [fx({ id: 'cloneToken' })], { rarity: 'epic', cost: 3 }),
    s('mobilize', '応召', [fx({ id: 'token', value: 2, hits: 2, option: 'mobilize', target: 'self' })], { cost: 2 }),
    s('rebound', '反復の矢', [fx({ id: 'damage', value: 3 })], { abilities: [AB('rebound')], rarity: 'rare', cost: 1 }),
    s('buyback', '再利用の矢', [fx({ id: 'damage', value: 2 })], { abilities: [AB('buyback'), AB('grow', 1)], rarity: 'rare' }),
    s('shuffle', '循環の薬', [fx({ id: 'heal', value: 3, target: 'self' })], { abilities: [AB('shuffleBack')] }),
    s('ramp', '大地の恵み', [fx({ id: 'ramp', target: 'self' })], { rarity: 'legend', cost: 3 }),
  ];
  const counts: Record<string, number> = Object.fromEntries(cards.map((c) => [c.id, 1]));
  delete counts.shuffle;
  delete counts.ramp;
  delete counts.bank;
  const deck = { v: 1 as const, id: 'mtgB', name: 'MTG-B', entries: Object.entries(counts).map(([cardId, count]) => ({ cardId, count })) };

  it('カードとデッキはすべて作れる（30枚）', () => {
    for (const c of cards) expect(analyzeCard(c).violations, c.name).toEqual([]);
    expect(analyzeDeck(deck, new Map(cards.map((c) => [c.id, c]))).violations).toEqual([]);
  });

  const runGame = (seed: number, level: ai.CpuLevel, d = deck) => {
    const opp = PRESET_DECKS[seed % PRESET_DECKS.length]!;
    const r = battle.createGame({ seed, players: [{ name: 'MTG-B', deck: d, cards }, { name: opp.name, deck: opp.deck, cards: opp.cards }] });
    if (!r.ok) throw new Error(r.error);
    let g = r.state;
    let steps = 0;
    while (g.phase !== 'ended') {
      const p = g.phase === 'mulligan' ? (g.players[0].mulligan.done ? 1 : 0) : g.pending ? g.pending.player : g.active;
      const action = ai.cpuAction(g, p, steps, level);
      const next = battle.applyAction(g, action);
      expect(next.ok, next.ok ? '' : `${next.error}（${JSON.stringify(action)}）`).toBe(true);
      if (!next.ok) return g;
      g = next.state;
      expect(++steps).toBeLessThan(5000);
    }
    expect(g.result).not.toBeNull();
    expect(JSON.parse(JSON.stringify(g))).toEqual(g); // 状態は JSON にできる
    return g;
  };

  for (const level of ['easy', 'normal'] as const) {
    it(`${ai.CPU_LEVEL_LABEL[level]}：プリセットと最後まで不正な行動なしで戦える`, () => {
      for (const seed of [2, 7]) runGame(seed, level);
    });
  }
  it(`${ai.CPU_LEVEL_LABEL.hard}：プリセットと最後まで不正な行動なしで戦える`, () => {
    runGame(4, 'hard');
  }, 120_000);

  it('残りの3枚（循環・最大エナジー増加・蓄え）を入れたデッキでも戦える', () => {
    const counts2: Record<string, number> = { ...counts, shuffle: 1, ramp: 1, bank: 1 };
    delete counts2.mill;
    delete counts2.seek;
    delete counts2.explore;
    const d2 = { v: 1 as const, id: 'mtgB2', name: 'MTG-B2', entries: Object.entries(counts2).map(([cardId, count]) => ({ cardId, count })) };
    expect(analyzeDeck(d2, new Map(cards.map((c) => [c.id, c]))).violations).toEqual([]);
    runGame(5, 'normal', d2);
  });
});
