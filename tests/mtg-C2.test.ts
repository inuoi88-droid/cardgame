// MTG 要素 ○ バッチC2（モード選択・双呪・種族・速度・王冠・英雄譚・蓄積）。倍率1で確かめる（表で書く）
import { describe, expect, it } from 'vitest';
import {
  ai,
  analyzeCard,
  analyzeDeck,
  battle,
  conditionMultiplier,
  describeCard,
  fitEffect,
  getAbility,
  getEffect,
  modeTexts,
  parseCard,
  setEffectMode,
  setTribe,
  targetsForEffect,
  timingMultiplier,
  timingsFor,
  TIMING_GROUPS,
  TIMINGS,
  CONDITIONS,
  CONDITION_GROUPS,
  type AbilityInstance,
  type CardDef,
  type EffectInstance,
} from '../src/engine/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { TEMPLATES } from '../src/ui/editor/templates.ts';
import { buildEvents } from '../src/ui/battle/events.ts';
import { card, codes } from './helpers.ts';
import { act, actError, endTurn, fx, giveCard, logText, M, monster, P, putMonster, rich, startGame } from './battle/helpers.ts';

type G = battle.GameState;

let seq = 0;
const AB = (id: string, value?: number, extra: Partial<AbilityInstance> = {}): AbilityInstance => ({ id, ...(value === undefined ? {} : { value }), ...extra });
const SPELL = (effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id: `c2s${++seq}`, name: `呪文${seq}`, rarity: 'legend', cost: 2, effects, ...extra });
const MON = (a: number, h: number, extra: Partial<CardDef> = {}) =>
  card({ id: `c2m${++seq}`, name: `獣${seq}`, rarity: 'legend', cost: 2, stats: { attack: a, hp: h, defense: 0 }, ...extra });
const vio = (c: CardDef) => codes(analyzeCard(c).violations);
const lines = (c: CardDef) => analyzeCard(c).points.lines;
const limitLine = (c: CardDef, label: string) => lines(c).find((l) => l.kind === 'limit' && l.label === label)?.value;
const play = (g: G, cardUid: string, extra: Partial<Extract<battle.Action, { type: 'playCard' }>> = {}) =>
  act(g, { type: 'playCard', player: g.active, cardUid, chosen: {}, ...extra });
/** P0 のターンを終えて P1 のターンも終え、P0 の次のターンにする */
const nextOwnTurn = (g: G) => endTurn(endTurn(g));

const DMG5 = fx({ id: 'damage', value: 5 });
const DRAW2 = fx({ id: 'draw', value: 2, target: 'self' });
/** 次のうち1つ：A 相手1体に5ダメージ ／ B カードを2枚引く */
const MODAL = (extra: Partial<CardDef> = {}) => SPELL([{ ...DMG5, mode: 1 }, { ...DRAW2, mode: 2 }], { rarity: 'rare', cost: 1, ...extra });

// ---------------------------------------------------------------- 定義：ポイントとテキスト
describe('定義（○ バッチC2）：ポイント・テキスト', () => {
  // [名前, カード, 効果の合計（割引・能力を含む。コストの差し引き前）, 効果テキスト]
  const table: [string, CardDef, number, string[]][] = [
    ['モード選択（分割カード）', MODAL(), 18, ['次のうち1つを選ぶ：', 'A：相手1体に5ダメージを与える。', 'B：カードを2枚引く。']],
    [
      '製造（鍛錬／トークン）',
      MON(1, 1, {
        rarity: 'common',
        cost: 1,
        effects: [fx({ id: 'train', value: 1, timing: 'summon', target: 'thisMonster', mode: 1 }), fx({ id: 'token', value: 1, hits: 1, timing: 'summon', target: 'self', mode: 2 })],
      }),
      7,
      ['召喚時、次のうち1つを選ぶ：', 'A：このモンスターの攻撃力と体力を+1する。', 'B：攻撃力1・体力1の小鬼を1体出す。'],
    ],
    [
      '暴動（速攻／鍛錬）',
      MON(2, 2, {
        rarity: 'common',
        effects: [fx({ id: 'grantKeyword', option: 'haste', timing: 'summon', target: 'thisMonster', mode: 1 }), fx({ id: 'train', value: 1, timing: 'summon', target: 'thisMonster', mode: 2 })],
      }),
      7,
      ['召喚時、次のうち1つを選ぶ：', 'A：このモンスターに速攻を与える。', 'B：このモンスターの攻撃力と体力を+1する。'],
    ],
    ['双呪1', MODAL({ rarity: 'epic', abilities: [AB('entwine', 1)] }), 22, ['次のうち1つを選ぶ：', 'A：相手1体に5ダメージを与える。', 'B：カードを2枚引く。']],
    [
      '英雄譚（3章）',
      SPELL([fx({ id: 'damage', value: 5, timing: 'chapter1', target: 'enemyPlayer' }), fx({ id: 'draw', value: 1, timing: 'chapter2', target: 'self' }), fx({ id: 'token', value: 2, hits: 1, timing: 'chapter3', target: 'self' })], { rarity: 'rare' }),
      27,
      ['第1章：相手プレイヤーに5ダメージを与える。', '第2章：カードを1枚引く。', '第3章：攻撃力2・体力2の小鬼を1体出す。'],
    ],
    [
      '蓄積3（カードを使うたび）',
      SPELL([fx({ id: 'damage', value: 1, timing: 'charged', target: 'enemyAll' })], { rarity: 'epic', cost: 3, abilities: [AB('charge', 3, { option: 'cardPlayed' })] }),
      42,
      ['蓄積がたまったとき、相手全体に1ダメージを与える。'],
    ],
    ['エンジン始動', SPELL([fx({ id: 'startEngine', target: 'self' })], { cost: 0 }), 2, ['エンジン始動（速度が無ければ1になる）。']],
    ['王冠を得る', SPELL([fx({ id: 'crown', target: 'self' })], { cost: 1 }), 10, ['王冠を得る。']],
    ['速度が最大なら', SPELL([fx({ ...DMG5, condition: 'maxSpeed' })]), 8, ['速度が最大なら、相手1体に5ダメージを与える。']],
    ['王冠を持っていれば', SPELL([fx({ ...DMG5, condition: 'hasCrown' })]), 12, ['王冠を持っていれば、相手1体に5ダメージを与える。']],
    ['同じ種族がいれば', SPELL([fx({ ...DMG5, condition: 'tribeAlly' })], { tribe: 'beast' }), 11, ['自分の獣がいれば、相手1体に5ダメージを与える。']],
    ['同じ種族1体につき', SPELL([fx({ ...DMG5, mods: ['perTribeAlly'] })], { tribe: 'dragon' }), 30, ['相手1体に5ダメージを与える（数値は自分の竜1体につき、最大3体）。']],
    ['同じ種族の全体（ロード）', SPELL([fx({ id: 'train', value: 1, target: 'tribeAllies' })], { tribe: 'undead' }), 9, ['自分の不死全体の攻撃力と体力を+1する。']],
    ['同じ種族のサーチ', SPELL([fx({ id: 'search', option: 'tribe', target: 'self' })], { tribe: 'machine' }), 8, ['山札から機械のカードを1枚選んで手札に加える。']],
  ];
  it.each(table)('%s', (_label, c, sum, text) => {
    expect(analyzeCard(c).violations).toEqual([]);
    const pts = lines(c)
      .filter((l) => l.kind !== 'stat' && l.kind !== 'keyword' && l.kind !== 'cost')
      .reduce((s, l) => s + l.value, 0);
    expect(pts).toBe(sum);
    expect(describeCard(c).effects).toEqual(text);
  });

  it('モード選択の割引と双呪の行（倍率1の例：15＋8×0.3＝17.4→18、双呪は他のモード8×0.4→4）', () => {
    expect(limitLine(MODAL(), 'モード選択の割引')).toBe(-5);
    const ent = MODAL({ abilities: [AB('entwine', 1)] });
    expect(lines(ent).find((l) => l.kind === 'ability')).toMatchObject({ value: 4, label: '能力 双呪1' });
    expect(analyzeCard(ent).text.abilities[0]).toEqual({ name: '双呪1', text: 'エナジー+1で、すべてのモードを選ぶ。' });
    expect(modeTexts(MODAL(), 'play')).toEqual([
      { mode: 1, label: 'A', text: '相手1体に5ダメージを与える。' },
      { mode: 2, label: 'B', text: 'カードを2枚引く。' },
    ]);
  });

  it('倍率：章は ×1.0／0.9／0.8、蓄積は 6.0×min(1, 頻度÷必要数)、条件と対象の倍率', () => {
    expect(['chapter1', 'chapter2', 'chapter3'].map((t) => timingMultiplier(t as 'chapter1', 'spell'))).toEqual([1, 0.9, 0.8]);
    const charged = (need: number, option: string) => timingMultiplier('charged', 'spell', undefined, { abilities: [AB('charge', need, { option })] });
    expect(charged(2, 'turnStart')).toBe(3);
    expect(charged(2, 'cardPlayed')).toBe(6);
    expect(charged(5, 'allyDestroyed')).toBeCloseTo(0.84);
    expect([conditionMultiplier('tribeAlly'), conditionMultiplier('maxSpeed'), conditionMultiplier('hasCrown')]).toEqual([0.7, 0.5, 0.75]);
    expect(analyzeCard(SPELL([fx({ id: 'train', value: 1, target: 'tribeAllies' })], { tribe: 'beast' })).points.lines[0]!.formula).toContain('2.0');
  });

  it('タイミング・条件の見出し：英雄譚・蓄積、種族・速度・王冠', () => {
    expect(TIMING_GROUPS).toEqual(expect.arrayContaining(['英雄譚', '蓄積']));
    expect(['chapter1', 'chapter2', 'chapter3'].map((t) => TIMINGS[t as 'chapter1'].group)).toEqual(['英雄譚', '英雄譚', '英雄譚']);
    expect(TIMINGS.charged.group).toBe('蓄積');
    expect(CONDITION_GROUPS).toContain('種族・速度・王冠');
    expect(['tribeAlly', 'maxSpeed', 'hasCrown'].map((c) => CONDITIONS[c as 'tribeAlly'].group)).toEqual(['種族・速度・王冠', '種族・速度・王冠', '種族・速度・王冠']);
    // 章は呪文だけ。蓄積がたまったときは能力「蓄積」があるときだけ
    expect(timingsFor('monster')).not.toContain('chapter1');
    expect(timingsFor('spell')).toContain('chapter1');
    expect(timingsFor('spell')).not.toContain('charged');
    expect(timingsFor('spell', [AB('charge', 3)])).toContain('charged');
    // 同じ種族の全体は「自分のモンスター」に作用する効果の対象
    expect(targetsForEffect(getEffect('train')!, 'play', 'spell')).toContain('tribeAllies');
    expect(targetsForEffect(getEffect('ready')!, 'play', 'spell')).not.toContain('tribeAllies');
  });

  it('モード選択のカードの種類：モードの効果も使用時の効果として数える（ダメージのモードがあればアタック）', () => {
    expect(analyzeCard(MODAL()).cardType).toBe('attack');
    const saga = SPELL([fx({ id: 'draw', value: 1, timing: 'chapter1', target: 'self' }), fx({ id: 'draw', value: 1, timing: 'chapter2', target: 'self' })]);
    expect(analyzeCard(saga).cardType).toBe('power');
  });
});

// ---------------------------------------------------------------- 検証
describe('検証（○ バッチC2）', () => {
  const table: [string, CardDef, string[]][] = [
    ['モードが1つだけ', SPELL([{ ...DMG5, mode: 1 }, DRAW2]), ['MODE_INCOMPLETE']],
    ['モード B が無い（A と C）', SPELL([{ ...DMG5, mode: 1 }, { ...DRAW2, mode: 3 }]), ['MODE_INCOMPLETE']],
    ['モードは使用時・召喚時・捨て札から使ったときだけ', SPELL([{ ...DMG5, value: 1, mode: 1, timing: 'turnStart', target: 'enemyPlayer' }, { ...DRAW2, value: 1, mode: 2, timing: 'turnStart' }], { cost: 5 }), ['MODE_TIMING', 'MODE_TIMING']],
    ['モードの番号が正しくない', SPELL([{ ...DMG5, mode: 4 as 1 }, { ...DRAW2, mode: 2 }]), ['MODE_INVALID', 'MODE_INCOMPLETE']],
    ['双呪はモード選択のカードだけ', SPELL([DMG5], { abilities: [AB('entwine', 1)] }), ['ENTWINE_WITHOUT_MODES']],
    ['種族のないカードに「同じ種族」の条件', SPELL([fx({ ...DMG5, condition: 'tribeAlly' })]), ['TRIBE_REQUIRED']],
    ['種族のないカードに「同じ種族1体につき」', SPELL([fx({ ...DMG5, mods: ['perTribeAlly'] })]), ['TRIBE_REQUIRED']],
    ['種族のないカードに「同じ種族の全体」', SPELL([fx({ id: 'train', value: 1, target: 'tribeAllies' })]), ['TRIBE_REQUIRED']],
    ['種族のないカードのサーチ「同じ種族」', SPELL([fx({ id: 'search', option: 'tribe', target: 'self' })]), ['TRIBE_REQUIRED']],
    ['知らない種族', SPELL([DMG5], { tribe: 'robot' as 'beast' }), ['TRIBE_INVALID']],
    ['英雄譚の章が飛んでいる', SPELL([fx({ id: 'draw', value: 1, timing: 'chapter1', target: 'self' }), fx({ id: 'draw', value: 1, timing: 'chapter3', target: 'self' })]), ['SAGA_CHAPTER_GAP']],
    ['英雄譚に第1章が無い', SPELL([fx({ id: 'draw', value: 1, timing: 'chapter2', target: 'self' })]), ['SAGA_CHAPTER_GAP']],
    [
      '英雄譚にターン開始時の効果',
      SPELL([fx({ id: 'draw', value: 1, timing: 'chapter1', target: 'self' }), fx({ id: 'draw', value: 1, timing: 'turnStart', target: 'self' })]),
      ['SAGA_MIXED'],
    ],
    [
      '英雄譚に寿命',
      SPELL([fx({ id: 'draw', value: 1, timing: 'chapter1', target: 'self' })], { drawbacks: [{ id: 'lifespan', value: 2, timing: null }] }),
      ['SAGA_MIXED', 'CURSE_TOO_WEAK'],
    ],
    ['蓄積がたまったときに能力が無い', SPELL([fx({ id: 'draw', value: 1, timing: 'charged', target: 'self' })]), ['CHARGE_MISMATCH']],
    ['蓄積の能力に効果が無い', SPELL([fx({ id: 'draw', value: 1, timing: 'turnStart', target: 'self' })], { abilities: [AB('charge', 3)] }), ['CHARGE_MISMATCH']],
    ['蓄積はパワーのカードだけ', MON(1, 1, { abilities: [AB('charge', 3)] }), ['ABILITY_CARD_TYPE', 'CHARGE_MISMATCH']],
  ];
  it.each(table)('%s', (_label, c, expected) => {
    expect(vio(c)).toEqual(expected);
  });

  it('作れる：3モード・双呪2・召喚時のモード・捨て札から使ったときのモード', () => {
    expect(vio(SPELL([{ ...DMG5, mode: 1 }, { ...DRAW2, mode: 2 }, { ...fx({ id: 'heal', value: 3, target: 'self' }), mode: 3 }], { abilities: [AB('entwine', 2)] }))).toEqual([]);
    expect(
      vio(
        SPELL([DRAW2, { ...DMG5, timing: 'fromDiscard', mode: 1 }, { ...fx({ id: 'heal', value: 2, target: 'self' }), timing: 'fromDiscard', mode: 2 }], {
          abilities: [AB('flashback', 1)],
        }),
      ),
    ).toEqual([]);
  });

  it('エディター：setTribe(null) で種族だけの要素を外す、fitEffect はモードを使用時・召喚時以外で外す', () => {
    const c = SPELL([fx({ ...DMG5, condition: 'tribeAlly', mods: ['perTribeAlly'] }), fx({ id: 'train', value: 1, target: 'tribeAllies' }), fx({ id: 'search', option: 'tribe', target: 'self' })], { tribe: 'beast' });
    const off = setTribe(c, null);
    expect(off.tribe).toBeUndefined();
    expect(off.effects[0]).toEqual(fx({ ...DMG5 }));
    expect(off.effects[1]!.target).toBe('chosen');
    expect(off.effects[2]!.option).toBe('monster');
    expect(vio(off)).toEqual([]);
    expect(setTribe(off, 'spirit').tribe).toBe('spirit');
    expect(fitEffect({ ...DRAW2, mode: 2, timing: 'turnStart' }, 'spell').mode).toBeUndefined();
    expect(setEffectMode(DRAW2, 3).mode).toBe(3);
    expect(setEffectMode({ ...DRAW2, mode: 3 }, null).mode).toBeUndefined();
  });

  it('取り込み：知らない種族は「種族なし」、モードは 1〜3 だけ', () => {
    const raw = (x: object) => JSON.parse(JSON.stringify({ ...MODAL(), ...x }));
    const ok = parseCard(raw({ tribe: 'dragon' }));
    expect(ok.ok && ok.value.tribe).toBe('dragon');
    expect(ok.ok && ok.value.effects.map((e) => e.mode)).toEqual([1, 2]);
    const unknown = parseCard(raw({ tribe: 'robot' }));
    expect(unknown.ok && unknown.value.tribe).toBeUndefined();
    const bad = parseCard(raw({ effects: [{ ...DMG5, mode: 7 }] }));
    expect(bad.ok).toBe(false);
  });
});

// ---------------------------------------------------------------- 対戦：モード選択
describe('モード選択・双呪（対戦）', () => {
  it('モードは必須・不正な番号・双呪の無い 0・モードの無いカードのモードは拒否', () => {
    const g = rich(startGame());
    const uid = giveCard(g, 0, MODAL());
    expect(actError(g, { type: 'playCard', player: 0, cardUid: uid, chosen: { enemy: P(1) } })).toBe('モードを選んでください');
    expect(actError(g, { type: 'playCard', player: 0, cardUid: uid, chosen: { enemy: P(1) }, mode: 3 })).toBe('そのモードはありません');
    expect(actError(g, { type: 'playCard', player: 0, cardUid: uid, chosen: { enemy: P(1) }, mode: 0 })).toBe('このカードには双呪がありません');
    // モード B（ドロー）は対象を選ばない
    expect(actError(g, { type: 'playCard', player: 0, cardUid: uid, chosen: { enemy: P(1) }, mode: 2 })).toBe('対象は選べません');
    const plain = giveCard(g, 0, SPELL([DMG5]));
    expect(actError(g, { type: 'playCard', player: 0, cardUid: plain, chosen: { enemy: P(1) }, mode: 1 })).toBe('このカードはモードを選べません');
  });

  it('選んだモードの効果だけが出る（A：ダメージ、B：ドロー）', () => {
    let g = rich(startGame());
    const a = giveCard(g, 0, MODAL());
    const hp = g.players[1].hp;
    const hand = g.players[0].hand.length;
    g = play(g, a, { chosen: { enemy: P(1) }, mode: 1 });
    expect(g.players[1].hp).toBe(hp - 5);
    expect(g.players[0].hand.length).toBe(hand - 1);
    const b = giveCard(g, 0, MODAL());
    g = play(g, b, { mode: 2 });
    expect(g.players[1].hp).toBe(hp - 5);
    expect(g.players[0].hand.length).toBe(hand - 1 + 2);
    expect(logText(g)).toContain('モードBで使った');
    expect(g.log.some((l) => l.ev?.kind === 'play' && l.ev.mode === 2)).toBe(true);
  });

  it('双呪：エナジー+K で、すべてのモードを A→B の順に', () => {
    let g = rich(startGame(), 0, 3);
    const uid = giveCard(g, 0, MODAL({ abilities: [AB('entwine', 2)] }));
    const hp = g.players[1].hp;
    const hand = g.players[0].hand.length;
    g = play(g, uid, { chosen: { enemy: P(1) }, mode: 0 });
    expect(g.players[0].energy).toBe(0);
    expect(g.players[1].hp).toBe(hp - 5);
    expect(g.players[0].hand.length).toBe(hand - 1 + 2);
    const text = logText(g);
    expect(text.indexOf('5ダメージを与える')).toBeLessThan(text.indexOf('カードを2枚引く'));
    expect(text).toContain('双呪で+2');
    const h = rich(startGame(), 0, 2);
    const u2 = giveCard(h, 0, MODAL({ abilities: [AB('entwine', 2)] }));
    expect(actError(h, { type: 'playCard', player: 0, cardUid: u2, chosen: { enemy: P(1) }, mode: 0 })).toContain('エナジーが足りません');
  });

  it('playInfo と legalActions：モードごとの対象と、双呪の 0', () => {
    const g = rich(startGame(), 0, 1);
    const uid = giveCard(g, 0, MODAL({ abilities: [AB('entwine', 1)] }));
    const info = battle.playInfo(g, 0, g.players[0].hand.find((c) => c.uid === uid)!);
    expect(info.modes?.map((m) => [m.mode, m.label, m.blocked, m.enemyTargets.length])).toEqual([
      [1, 'A', null, 1],
      [2, 'B', null, 0],
      [0, 'すべて（双呪）', 'エナジーが足りません', 1],
    ]);
    expect(info.blocked).toBeNull();
    expect(info.enemyTargets).toEqual([P(1)]);
    const acts = battle.legalActions(g, 0).filter((a) => a.type === 'playCard' && a.cardUid === uid);
    expect(acts.map((a) => (a as { mode?: number }).mode)).toEqual([1, 2]);
  });

  it('製造（召喚時のモード）：A なら鍛錬、B なら小鬼', () => {
    const fab = MON(1, 1, {
      effects: [fx({ id: 'train', value: 1, timing: 'summon', target: 'thisMonster', mode: 1 }), fx({ id: 'token', value: 1, hits: 1, timing: 'summon', target: 'self', mode: 2 })],
    });
    let g = rich(startGame());
    const a = giveCard(g, 0, fab);
    g = play(g, a, { mode: 1 });
    expect(monster(g, a)).toMatchObject({ attack: 2, hp: 2 });
    const b = giveCard(g, 0, fab);
    g = play(g, b, { mode: 2 });
    expect(monster(g, b)).toMatchObject({ attack: 1, hp: 1 });
    expect(g.players[0].board.filter((m) => m.card.token).length).toBe(1);
  });

  it('反復は同じモードでもう一度', () => {
    let g = rich(startGame());
    const uid = giveCard(g, 0, MODAL({ abilities: [AB('rebound')] }));
    const hp = g.players[1].hp;
    g = play(g, uid, { mode: 2 });
    expect(g.players[0].delayed?.[0]?.rebound?.effects.map((e) => e.id)).toEqual(['draw']);
    g = nextOwnTurn(g);
    expect(g.players[1].hp).toBe(hp);
    expect(logText(g)).toContain('反復：');
  });

  it('無料で使う（続唱）ときは、対象より先にモードを選ぶ', () => {
    let g = rich(startGame());
    const target = MODAL({ cost: 1, rarity: 'common' });
    g.cards['p0:casc-target'] = { ...target, id: 'casc-target' };
    g.players[0].deck.unshift({ uid: 'casc1', cardId: 'p0:casc-target', owner: 0 });
    const uid = giveCard(g, 0, SPELL([fx({ id: 'cascade', value: 1, target: 'self' })], { cost: 2 }));
    g = play(g, uid);
    expect(g.pending?.prompt).toContain('モードを選んでください');
    expect(g.pending?.options.map((o) => o.id)).toEqual(['1', '2']);
    const hand = g.players[0].hand.length;
    g = act(g, { type: 'choose', player: 0, picks: ['2'] });
    expect(g.pending).toBeNull();
    expect(g.players[0].hand.length).toBe(hand + 2);
    expect(logText(g)).toContain('モードBで無料で使った');
  });

  it('蘇生・複写トークンなど選ぶ場面のない召喚はモード A', () => {
    const fab = MON(1, 1, {
      effects: [fx({ id: 'train', value: 1, timing: 'summon', target: 'thisMonster', mode: 1 }), fx({ id: 'token', value: 1, hits: 1, timing: 'summon', target: 'self', mode: 2 })],
    });
    let g = rich(startGame());
    g.cards['p0:fab'] = { ...fab, id: 'fab' };
    g.players[0].discard.push({ uid: 'fab1', cardId: 'p0:fab', owner: 0 });
    const uid = giveCard(g, 0, SPELL([fx({ id: 'revive', value: 2, target: 'self' })], { cost: 3 }));
    g = play(g, uid);
    expect(monster(g, 'fab1')).toMatchObject({ attack: 2, hp: 2 });
  });
});

// ---------------------------------------------------------------- 対戦：種族
describe('種族（対戦）', () => {
  const BEAST = (a = 1, h = 3, extra: Partial<CardDef> = {}) => MON(a, h, { tribe: 'beast', ...extra });

  it('同じ種族がいれば：自分自身は数えない、違う種族・種族なしは数えない', () => {
    const cond = BEAST(1, 3, { effects: [fx({ id: 'damage', value: 4, timing: 'summon', target: 'enemyPlayer', condition: 'tribeAlly' })] });
    let g = rich(startGame());
    putMonster(g, 0, MON(1, 1, { tribe: 'dragon' }));
    putMonster(g, 0, MON(1, 1));
    const hp = g.players[1].hp;
    g = play(g, giveCard(g, 0, cond));
    expect(g.players[1].hp).toBe(hp);
    putMonster(g, 0, BEAST());
    g = play(g, giveCard(g, 0, cond));
    expect(g.players[1].hp).toBe(hp - 4);
  });

  it('同じ種族1体につき（自分自身を含む、最大3）と、同じ種族の全体（ロード）', () => {
    const per = BEAST(1, 3, { effects: [fx({ id: 'damage', value: 2, timing: 'summon', target: 'enemyPlayer', mods: ['perTribeAlly'] })] });
    let g = rich(startGame());
    for (let i = 0; i < 4; i++) putMonster(g, 0, BEAST());
    const hp = g.players[1].hp;
    g = play(g, giveCard(g, 0, per));
    expect(g.players[1].hp).toBe(hp - 2 * 3);
    const lord = SPELL([fx({ id: 'train', value: 1, target: 'tribeAllies' })], { tribe: 'beast' });
    const other = putMonster(g, 0, MON(1, 1, { tribe: 'machine' }));
    g = play(g, giveCard(g, 0, lord));
    expect(g.players[0].board.filter((m) => g.cards[m.card.cardId]?.tribe === 'beast').every((m) => m.attack === 2)).toBe(true);
    expect(monster(g, other)!.attack).toBe(1);
  });

  it('複写トークンは元のカードの種族、小鬼は種族なし', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, BEAST(2, 2, { effects: [fx({ id: 'offspring', timing: 'summon', target: 'self' })] })));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'token', value: 1, hits: 1, target: 'self' })])));
    const count = (gg: G) => gg.players[0].board.filter((m) => gg.cards[m.card.cardId]?.tribe === 'beast').length;
    expect(g.players[0].board.length).toBe(3);
    expect(count(g)).toBe(2);
  });

  it('サーチ「同じ種族」は同じ種族のカードだけを選ばせる', () => {
    let g = rich(startGame());
    const beast = BEAST(1, 1, { name: '森の狼' });
    const dragon = MON(1, 1, { tribe: 'dragon', name: '火竜' });
    g.cards['p0:sb'] = { ...beast, id: 'sb' };
    g.cards['p0:sd'] = { ...dragon, id: 'sd' };
    g.players[0].deck.unshift({ uid: 'sd1', cardId: 'p0:sd', owner: 0 }, { uid: 'sb1', cardId: 'p0:sb', owner: 0 });
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'search', option: 'tribe', target: 'self' })], { tribe: 'beast' })));
    expect(g.players[0].hand.some((c) => c.uid === 'sb1')).toBe(true);
    expect(g.players[0].hand.some((c) => c.uid === 'sd1')).toBe(false);
  });
});

// ---------------------------------------------------------------- 対戦：速度・王冠
describe('速度・王冠（対戦）', () => {
  const ENGINE = SPELL([fx({ id: 'startEngine', target: 'self' })], { cost: 0 });
  const PING = SPELL([fx({ id: 'damage', value: 1, target: 'enemyPlayer' })], { cost: 0 });

  it('エンジン始動で速度1、自分のターンに相手のHPを減らすと1ターン1回+1、最大4', () => {
    let g = rich(startGame());
    expect(g.players[0].speed ?? 0).toBe(0);
    // ゲージが無いうちは上がらない
    g = play(g, giveCard(g, 0, PING));
    expect(g.players[0].speed ?? 0).toBe(0);
    g = play(g, giveCard(g, 0, ENGINE));
    expect(g.players[0].speed).toBe(1);
    g = play(g, giveCard(g, 0, PING));
    g = play(g, giveCard(g, 0, PING));
    expect(g.players[0].speed).toBe(2);
    for (let i = 0; i < 4; i++) {
      g = rich(nextOwnTurn(g));
      g = play(g, giveCard(g, 0, PING));
    }
    expect(g.players[0].speed).toBe(4);
    expect(g.log.some((l) => l.ev?.kind === 'speed' && l.ev.amount === 4)).toBe(true);
    // エンジン始動をもう一度使っても下がらない
    g = play(g, giveCard(g, 0, ENGINE));
    expect(g.players[0].speed).toBe(4);
  });

  it('相手のターンには上がらない。速度が最大なら発動する条件', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, ENGINE));
    g = endTurn(g);
    // P1 のターンに P0 の反撃（状態）などで P1 のHPが減っても、P0 の速度は上がらない
    g.players[0].status.counter = 3;
    const atk = putMonster(g, 1, MON(1, 5));
    g = act(g, { type: 'attack', player: 1, attackerUid: atk, target: P(0) });
    expect(g.players[0].speed).toBe(1);
    const maxed = SPELL([fx({ id: 'damage', value: 9, target: 'enemyPlayer', condition: 'maxSpeed' })], { cost: 0 });
    let h = rich(startGame());
    const hp = h.players[1].hp;
    h = play(h, giveCard(h, 0, maxed));
    expect(h.players[1].hp).toBe(hp);
    h.players[0].speed = 4;
    h = play(h, giveCard(h, 0, maxed));
    expect(h.players[1].hp).toBe(hp - 9);
  });

  it('王冠：自分のターン開始時に1枚多く引く', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'crown', target: 'self' })], { cost: 0 })));
    expect(g.crown).toBe(0);
    expect(g.log.some((l) => l.ev?.kind === 'crown' && l.ev.player === 0)).toBe(true);
    g = endTurn(g);
    expect(g.players[1].hand.length).toBe(5);
    g = endTurn(g);
    expect(g.players[0].hand.length).toBe(6);
  });

  it('王冠：相手のモンスターの攻撃でHPが減ると移る。効果のダメージ・モンスターへの攻撃では移らない', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'crown', target: 'self' })], { cost: 0 })));
    g = endTurn(g);
    rich(g, 1);
    g = play(g, giveCard(g, 1, SPELL([fx({ id: 'damage', value: 3, target: 'enemyPlayer' })], { cost: 0 })));
    expect(g.crown).toBe(0);
    const wall = putMonster(g, 0, MON(0, 9));
    const atk = putMonster(g, 1, MON(2, 9));
    g = act(g, { type: 'attack', player: 1, attackerUid: atk, target: M(wall) });
    expect(g.crown).toBe(0);
    g.players[1].board.find((m) => m.uid === atk)!.attacksUsed = 0;
    g.players[0].board = [];
    g = act(g, { type: 'attack', player: 1, attackerUid: atk, target: P(0) });
    expect(g.crown).toBe(1);
    expect(logText(g)).toContain('王冠がP1に移った');
  });

  it('王冠を持っていれば：持っているときだけ発動', () => {
    let g = rich(startGame());
    const c = SPELL([fx({ id: 'draw', value: 2, target: 'self', condition: 'hasCrown' })], { cost: 0 });
    const hand = g.players[0].hand.length;
    g = play(g, giveCard(g, 0, c));
    expect(g.players[0].hand.length).toBe(hand);
    g.crown = 0;
    g = play(g, giveCard(g, 0, c));
    expect(g.players[0].hand.length).toBe(hand + 2);
  });
});

// ---------------------------------------------------------------- 対戦：英雄譚・蓄積
describe('英雄譚・蓄積（対戦）', () => {
  const SAGA = SPELL(
    [
      fx({ id: 'damage', value: 3, timing: 'chapter1', target: 'enemyPlayer' }),
      fx({ id: 'damage', value: 4, timing: 'chapter2', target: 'enemyPlayer' }),
      fx({ id: 'damage', value: 5, timing: 'chapter3', target: 'enemyPlayer' }),
    ],
    { name: '三章の物語' },
  );

  it('第1章は使ったとき、第2章・第3章は次の自分のターン開始時、最後の章のあと消える', () => {
    let g = rich(startGame());
    const hp = g.players[1].hp;
    g = play(g, giveCard(g, 0, SAGA));
    expect(g.players[1].hp).toBe(hp - 3);
    expect(g.players[0].powers[0]).toMatchObject({ name: '三章の物語', chapter: 1 });
    g = endTurn(g);
    expect(g.players[1].hp).toBe(hp - 3);
    g = endTurn(g);
    expect(g.players[1].hp).toBe(hp - 7);
    expect(g.players[0].powers[0]!.chapter).toBe(2);
    g = nextOwnTurn(g);
    expect(g.players[1].hp).toBe(hp - 12);
    expect(g.players[0].powers).toEqual([]);
    expect(logText(g)).toContain('英雄譚『三章の物語』は終わった');
    expect(g.log.filter((l) => l.ev?.kind === 'saga').map((l) => l.ev!.amount)).toEqual([1, 2, 3]);
  });

  it('1章だけの英雄譚はすぐ消える。パワーの上限で消えたら、そこで止まる', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'draw', value: 1, timing: 'chapter1', target: 'self' })])));
    expect(g.players[0].powers).toEqual([]);
    g = play(g, giveCard(g, 0, SAGA));
    const filler = SPELL([fx({ id: 'draw', value: 1, timing: 'turnStart', target: 'self' })]);
    for (let i = 0; i < 3; i++) g = play(g, giveCard(g, 0, filler));
    expect(g.players[0].powers.some((p) => p.name === '三章の物語')).toBe(false);
    const hp = g.players[1].hp;
    g = nextOwnTurn(g);
    expect(g.players[1].hp).toBe(hp);
  });

  it('蓄積：必要数でたまったときの効果が出て0に戻る。1ターン2つまで', () => {
    const power = SPELL([fx({ id: 'damage', value: 2, timing: 'charged', target: 'enemyPlayer' })], { name: '蓄電池', abilities: [AB('charge', 2, { option: 'cardPlayed' })] });
    const cheap = SPELL([fx({ id: 'heal', value: 1, target: 'self' })], { cost: 0 });
    let g = rich(startGame());
    const hp = g.players[1].hp;
    g = play(g, giveCard(g, 0, power));
    expect(g.players[0].powers[0]!.charge).toBe(0);
    g = play(g, giveCard(g, 0, cheap));
    expect(g.players[0].powers[0]!.charge).toBe(1);
    g = play(g, giveCard(g, 0, cheap));
    expect(g.players[1].hp).toBe(hp - 2);
    expect(g.players[0].powers[0]!.charge).toBe(0);
    // このターンもう2回たまったので、3枚目ではたまらない
    g = play(g, giveCard(g, 0, cheap));
    expect(g.players[0].powers[0]!.charge).toBe(0);
    expect(g.log.some((l) => l.ev?.kind === 'charge')).toBe(true);
  });

  it('蓄積：自分のターン開始時・自分のモンスターが出るたび', () => {
    const tick = SPELL([fx({ id: 'draw', value: 1, timing: 'charged', target: 'self' })], { abilities: [AB('charge', 2, { option: 'turnStart' })] });
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, tick));
    g = nextOwnTurn(g);
    expect(g.players[0].powers[0]!.charge).toBe(1);
    g = nextOwnTurn(g);
    expect(g.players[0].powers[0]!.charge).toBe(0);
    const summoned = SPELL([fx({ id: 'heal', value: 1, timing: 'charged', target: 'self' })], { abilities: [AB('charge', 3, { option: 'allySummoned' })] });
    let h = rich(startGame());
    h = play(h, giveCard(h, 0, summoned));
    h = play(h, giveCard(h, 0, MON(1, 1, { cost: 0, rarity: 'common' })));
    expect(h.players[0].powers[0]!.charge).toBe(1);
  });
});

// ---------------------------------------------------------------- テンプレート・CPU
describe('テンプレート・CPU（○ バッチC2）', () => {
  it('製造・暴動のテンプレートが作れる', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['fabricate', 'riot']));
    for (const t of TEMPLATES.filter((x) => x.id === 'fabricate' || x.id === 'riot')) {
      const c = t.build(`tpl-${t.id}`);
      expect(analyzeCard(c).violations, t.id).toEqual([]);
      expect(c.effects.some((e) => e.mode === 1) && c.effects.some((e) => e.mode === 2)).toBe(true);
    }
  });

  it('CPU はモード選択のカードでモードを選んで使う（どの強さでも合法手）', () => {
    const g = rich(startGame(), 0, 1);
    g.players[0].hand = [];
    g.players[1].hp = 5;
    const uid = giveCard(g, 0, MODAL());
    for (const level of ai.CPU_LEVELS) {
      const a = ai.cpuAction(g, 0, 1, level);
      expect(a, level).toMatchObject({ type: 'playCard', cardUid: uid, mode: 1, chosen: { enemy: P(1) } });
    }
  });

  // 新要素を詰めた30枚のデッキ
  const m = (id: string, name: string, a: number, h: number, extra: Partial<CardDef> = {}) =>
    card({ id, name, rarity: 'common', cost: 2, stats: { attack: a, hp: h, defense: 0 }, ...extra });
  const s = (id: string, name: string, effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id, name, rarity: 'common', cost: 2, effects, ...extra });
  const cards: CardDef[] = [
    s('split', '火か知恵か', [fx({ id: 'damage', value: 4, mode: 1 }), fx({ id: 'draw', value: 2, target: 'self', mode: 2 })]),
    s('ent', '双呪の書', [fx({ id: 'damage', value: 3, mode: 1 }), fx({ id: 'heal', value: 4, target: 'self', mode: 2 })], { rarity: 'rare', cost: 2, abilities: [AB('entwine', 1)] }),
    m('fab', '製造ゴーレム', 1, 2, {
      tribe: 'machine',
      effects: [fx({ id: 'train', value: 1, timing: 'summon', target: 'thisMonster', mode: 1 }), fx({ id: 'token', value: 1, hits: 1, timing: 'summon', target: 'self', mode: 2 })],
    }),
    m('riot', '暴動の狼', 2, 2, {
      tribe: 'beast',
      effects: [fx({ id: 'grantKeyword', option: 'haste', timing: 'summon', target: 'thisMonster', mode: 1 }), fx({ id: 'train', value: 1, timing: 'summon', target: 'thisMonster', mode: 2 })],
    }),
    m('wolf', '群れの狼', 2, 3, { tribe: 'beast', effects: [fx({ id: 'damage', value: 2, timing: 'summon', target: 'chosen', condition: 'tribeAlly' })] }),
    m('lord', '狼の長', 2, 3, { tribe: 'beast', rarity: 'rare', cost: 3, effects: [fx({ id: 'attackUp', value: 1, timing: 'summon', target: 'tribeAllies' })] }),
    s('howl', '遠吠え', [fx({ id: 'damage', value: 1, mods: ['perTribeAlly'] })], { tribe: 'beast', cost: 1 }),
    s('seekb', '群れ呼び', [fx({ id: 'seek', option: 'tribe', target: 'self' })], { tribe: 'beast', cost: 1 }),
    s('engine', 'エンジン点火', [fx({ id: 'startEngine', target: 'self' }), fx({ id: 'damage', value: 2 })], { cost: 1 }),
    s('maxsp', '最高速度の一撃', [fx({ id: 'damage', value: 6, condition: 'maxSpeed' }), fx({ id: 'damage', value: 2 })], { rarity: 'rare' }),
    s('crown', '戴冠', [fx({ id: 'crown', target: 'self' })], { cost: 1 }),
    s('royal', '王の命令', [fx({ id: 'draw', value: 1, target: 'self' }), fx({ id: 'damage', value: 3, condition: 'hasCrown' })], { rarity: 'rare' }),
    s(
      'saga',
      '英雄の物語',
      [fx({ id: 'damage', value: 3, timing: 'chapter1', target: 'enemyPlayer' }), fx({ id: 'draw', value: 1, timing: 'chapter2', target: 'self' }), fx({ id: 'token', value: 1, hits: 1, timing: 'chapter3', target: 'self' })],
      { rarity: 'rare' },
    ),
    s('charge', '蓄電の塔', [fx({ id: 'damage', value: 1, timing: 'charged', target: 'enemyAll' })], { rarity: 'epic', cost: 3, abilities: [AB('charge', 3, { option: 'cardPlayed' })] }),
  ];
  const counts: Record<string, number> = Object.fromEntries(cards.map((c) => [c.id, 2]));
  counts.split = 4;
  counts.fab = 3;
  counts.riot = 3;
  counts.wolf = 3;
  counts.charge = 1;
  counts.ent = 2;
  counts.lord = 2;
  counts.saga = 2;
  counts.royal = 1;
  counts.maxsp = 1;
  const deck = { v: 1 as const, id: 'mtgC2', name: 'MTG-C2', entries: Object.entries(counts).map(([cardId, count]) => ({ cardId, count })) };

  it('カードとデッキはすべて作れる（30枚）', () => {
    for (const c of cards) expect(analyzeCard(c).violations, c.name).toEqual([]);
    expect(deck.entries.reduce((x, e) => x + e.count, 0)).toBe(30);
    expect(analyzeDeck(deck, new Map(cards.map((c) => [c.id, c]))).violations).toEqual([]);
  });

  const used = new Set<string>();
  const runGame = (seed: number, level: ai.CpuLevel) => {
    const opp = PRESET_DECKS[seed % PRESET_DECKS.length]!;
    const r = battle.createGame({ seed, players: [{ name: 'MTG-C2', deck, cards }, { name: opp.name, deck: opp.deck, cards: opp.cards }] });
    if (!r.ok) throw new Error(r.error);
    let g = r.state;
    let steps = 0;
    while (g.phase !== 'ended') {
      const p = g.phase === 'mulligan' ? (g.players[0].mulligan.done ? 1 : 0) : g.pending ? g.pending.player : g.active;
      const action = ai.cpuAction(g, p, steps, level);
      if (p === 0 && action.type === 'playCard' && action.mode !== undefined) used.add(`mode:${action.mode}`);
      const next = battle.applyAction(g, action);
      expect(next.ok, next.ok ? '' : `${next.error}（${JSON.stringify(action)}）`).toBe(true);
      if (!next.ok) return g;
      g = next.state;
      if (g.players[0].speed) used.add('speed');
      if (g.crown !== undefined && g.crown !== null) used.add('crown');
      if (g.players[0].powers.some((x) => x.chapter !== undefined)) used.add('saga');
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
  it('CPU は新しい要素（モード・速度・王冠・英雄譚）を実際に使う', () => {
    for (const seed of [3, 9]) runGame(seed, 'normal');
    expect([...used].sort()).toEqual(expect.arrayContaining(['mode:1', 'mode:2', 'speed', 'crown', 'saga']));
  }, 120_000);

  it('能力の定義：双呪・蓄積', () => {
    expect(getAbility('entwine')?.name).toBe('双呪');
    expect(getAbility('charge')?.option?.choices.map((c) => c.id)).toEqual(['turnStart', 'cardPlayed', 'allySummoned', 'enemyDamaged', 'allyDestroyed']);
  });
});

// ---------------------------------------------------------------- 演出（ログの ev → 再生の出来事）

describe('演出（○ バッチC2）：速度・王冠・英雄譚・蓄積のログから演出を作る', () => {
  it('速度と王冠はプレイヤーの枠に浮かぶ文字、英雄譚の章と蓄積がたまったときは見出し', () => {
    let g = rich(startGame());
    const from = g.log.length;
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'startEngine', target: 'self' }), fx({ id: 'crown', target: 'self' })], { cost: 0 })));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'damage', value: 1, timing: 'chapter1', target: 'enemyPlayer' }), fx({ id: 'draw', value: 1, timing: 'chapter2', target: 'self' })], { name: '小さな物語' })));
    const shows = buildEvents(g.log.slice(from), g, 0, 1).map((e) => e.show);
    expect(shows).toEqual(
      expect.arrayContaining([
        // 決定事項 #126：浮かぶ文字・知らせに絵文字は使わない（形は gi）
        expect.objectContaining({ t: 'float', key: 'p0', text: '速度1', gi: 'checkered-flag' }),
        expect.objectContaining({ t: 'float', key: 'p0', text: '王冠', gi: 'crown' }),
        expect.objectContaining({ t: 'notice', text: '『小さな物語』 第1章', gi: 'open-book' }),
        expect.objectContaining({ t: 'float', key: 'p0', text: '速度2', gi: 'checkered-flag' }),
      ]),
    );
  });
});
