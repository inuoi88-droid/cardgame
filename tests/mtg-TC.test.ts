// MTG 要素 △ バッチC（待機ゾーン・達成（事件・進化）・Lv・忠誠・裏向き・追加ターン・特殊勝利・HP交換・強奪・紋章・砦。
// 仕組み3・カードの能力12・タイミング7・条件3・効果5）。倍率1で確かめる（表で書く）
import { describe, expect, it } from 'vitest';
import {
  achieveConditions,
  ai,
  analyzeCard,
  analyzeDeck,
  battle,
  CONDITIONS,
  conditionsFor,
  createAbility,
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
const SPELL = (effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id: `tcs${++seq}`, name: `呪文${seq}`, rarity: 'legend', cost: 3, effects, ...extra });
const POWER = (effects: EffectInstance[], extra: Partial<CardDef> = {}) => SPELL(effects, extra);
const MON = (a: number, h: number, extra: Partial<CardDef> = {}) =>
  card({ id: `tcm${++seq}`, name: `獣${seq}`, rarity: 'legend', cost: 3, stats: { attack: a, hp: h, defense: 0 }, ...extra });
const vio = (c: CardDef) => codes(analyzeCard(c).violations);
const play = (g: G, cardUid: string, extra: Partial<PlayAction> = {}) => act(g, { type: 'playCard', player: g.active, cardUid, chosen: {}, ...extra });
const playErr = (g: G, cardUid: string, extra: Partial<PlayAction> = {}) => actError(g, { type: 'playCard', player: g.active, cardUid, chosen: {}, ...extra });
/** P0 のターン、エナジーたっぷり */
const fresh = (energy = 20) => rich(startGame(), 0, energy);
/** 相手のターンを飛ばして、P0 の次のターン（エナジーたっぷり） */
const nextMine = (g: G, energy = 20) => {
  g = endTurn(g);
  g = endTurn(g);
  return rich(g, 0, energy);
};
const view = (g: G, p: battle.PlayerId) => JSON.stringify(battle.viewFor(g, p));

const DMG4 = fx({ id: 'damage', value: 4 });
const DRAW1 = fx({ id: 'draw', value: 1, target: 'self' });

// ---------------------------------------------------------------- 定義：ポイントとテキスト
describe('定義（△ バッチC）：ポイント・テキスト', () => {
  // [名前, カード, 能力の行の値, 能力のテキスト]
  const table: [string, CardDef, number, string][] = [
    ['予顕−1（2）', SPELL([DMG4], { abilities: [AB('foretell', 1)] }), 2, 'エナジー2で伏せ、後のターンにコスト−1で使う。'],
    ['予顕−2（2＋6）', SPELL([DMG4], { abilities: [AB('foretell', 2)] }), 8, 'エナジー2で伏せ、後のターンにコスト−2で使う。'],
    ['計画（2）', SPELL([DMG4], { abilities: [AB('plot')] }), 2, '今払って待機させ、後のターンに無料で使う。'],
    ['待機2—1（3）', SPELL([DMG4], { abilities: [AB('suspend', 2, { option: '1' })] }), 3, 'エナジー1で待機させ、2ターン後の自分のターン開始時に無料で使う。'],
    ['ワープ1（2＋召喚時12×0.4）', MON(2, 2, { effects: [fx({ ...DMG4, timing: 'summon' })], abilities: [AB('warp', 1)] }), 7, 'エナジー1で出すと、ターン終了時に待機ゾーンへ（後で出し直せる）。'],
    ['出来事1（0）', MON(2, 2, { effects: [fx({ ...DMG4, timing: 'adventure' })], abilities: [AB('adventure', 1)] }), 0, 'エナジー1で「出来事」の効果を使い、あとでモンスターとして出せる。'],
    ['事件（1）', POWER([fx({ ...DRAW1, timing: 'achievedNow' })], { abilities: [AB('quest', undefined, { condition: 'manyMonsters' })] }), 1, '事件（解明条件：自分の場にモンスターが3体以上。ターン終了時に判定）。'],
    [
      '進化2（1＋2×2.7）',
      MON(2, 2, { abilities: [AB('evolve', 2, { condition: 'veteran' })] }),
      7,
      '進化条件：このモンスターが3回以上攻撃した（ターン終了時に判定。進化すると攻撃力・体力+2）。',
    ],
    ['Lvアップ（モンスター 1×5）', MON(2, 2, { abilities: [AB('levelUp', 1, { option: '2' })] }), 5, 'エナジー2で Lv を1上げる（Lv3まで・1ターン1回。モンスターは1つにつき攻撃力・体力+1）。'],
    ['Lvアップ（パワー 0）', POWER([fx({ ...DRAW1, timing: 'turnStart', condition: 'level2' })], { abilities: [AB('levelUp', 0, { option: '1' })] }), 0, 'エナジー1で Lv を1上げる（Lv3まで・1ターン1回。モンスターは1つにつき攻撃力・体力+0）。'],
    [
      '忠誠3（0）',
      POWER([fx({ ...DRAW1, timing: 'loyaltyPlus' }), fx({ ...DMG4, timing: 'loyaltyMinus' })], { abilities: [AB('loyalty', 3, { option: '3' })] }),
      0,
      '忠誠3で出る（+1：忠誠を1増やして使う／−3：忠誠を減らして使う。どちらか1ターン1回）。',
    ],
    ['変装2（3）', MON(3, 3, { abilities: [AB('disguise', 2)] }), 3, 'エナジー2で裏向きに出し、エナジー2で表にする。'],
    ['特殊勝利（30）', POWER([fx({ ...DRAW1, timing: 'turnStart' })], { cost: 5, abilities: [AB('altWin', undefined, { option: 'turns' })] }), 30, '特殊勝利：このパワーを置いてから自分のターン開始を4回迎えるを達成したら勝つ。'],
    ['紋章（パワーの効果24×0.3）', POWER([fx({ ...DRAW1, timing: 'turnStart' })], { abilities: [AB('emblem')] }), 8, '紋章（パワーの上限に数えず、解除されない）。'],
  ];
  it.each(table)('%s', (_label, c, abilityPts, text) => {
    const a = analyzeCard(c);
    expect(a.violations).toEqual([]);
    expect(a.points.lines.find((l) => l.kind === 'ability')?.value).toBe(abilityPts);
    expect(a.text.abilities.map((x) => x.text)).toEqual([text]);
  });

  it('タイミングの倍率・テキスト・見出し（出来事×0.8・忠誠−K は L≥K で1.2・砦を落としたときは体力で）', () => {
    const adv = MON(2, 2, { effects: [fx({ ...DMG4, timing: 'adventure' })], abilities: [AB('adventure', 1)] });
    expect(analyzeCard(adv).points.lines.find((l) => l.kind === 'effect')?.value).toBe(10);
    expect(describeCard(adv).effects).toEqual(['出来事1：相手1体に4ダメージを与える。']);
    expect(timingMultiplier('loyaltyMinus', 'spell', undefined, { abilities: [AB('loyalty', 3, { option: '3' })] })).toBe(1.2);
    expect(timingMultiplier('loyaltyMinus', 'spell', undefined, { abilities: [AB('loyalty', 2, { option: '4' })] })).toBe(0.8);
    expect([2, 3, 4, 5, 6].map((n) => timingMultiplier('siegeWon', 'spell', undefined, { effects: [{ id: 'siege', value: n }] }))).toEqual([0.9, 0.8, 0.7, 0.6, 0.5]);
    expect([timingMultiplier('achievedNow', 'spell'), timingMultiplier('leveledUp', 'monster'), timingMultiplier('loyaltyPlus', 'spell'), timingMultiplier('revealed', 'monster')]).toEqual([0.7, 1.6, 4, 0.9]);
    const pw = POWER([fx({ ...DRAW1, timing: 'loyaltyPlus' }), fx({ ...DMG4, timing: 'loyaltyMinus' })], { abilities: [AB('loyalty', 3, { option: '3' })] });
    expect(describeCard(pw).effects).toEqual(['+1：カードを1枚引く。', '−3：相手1体に4ダメージを与える。']);
    expect([TIMINGS.achievedNow.group, TIMINGS.adventure.group, TIMINGS.siegeWon.group, TIMINGS.revealed.group, CONDITIONS.achieved.group]).toEqual([
      '達成・Lv・忠誠',
      '出来事・砦',
      '出来事・砦',
      'このモンスター',
      '達成・Lv',
    ]);
    // 能力・効果が要るタイミング・条件は、それがあるときだけ選べる
    expect(timingsFor('monster')).not.toContain('adventure');
    expect(timingsFor('monster', [AB('adventure', 1)])).toContain('adventure');
    expect(timingsFor('spell', [AB('loyalty', 3)])).toEqual(expect.arrayContaining(['loyaltyPlus', 'loyaltyMinus']));
    expect(timingsFor('spell')).not.toContain('siegeWon');
    expect(timingsFor('spell', [], [{ id: 'siege', value: 3 }])).toContain('siegeWon');
    expect(conditionsFor('turnStart', 'spell')).not.toContain('achieved');
    expect(conditionsFor('turnStart', 'spell', [AB('quest')])).toContain('achieved');
    expect(conditionsFor('turnStart', 'monster', [AB('levelUp', 1)])).toEqual(expect.arrayContaining(['level2', 'level3']));
    expect(conditionsFor('summon', 'monster', [AB('levelUp', 1)])).not.toContain('level2');
    // 達成条件：乱数・能力の条件は使えない。パワーには「このモンスター」の条件は使えない
    expect(achieveConditions('spell')).not.toEqual(expect.arrayContaining(['coinFlip']));
    expect(achieveConditions('spell')).not.toContain('veteran');
    expect(achieveConditions('monster')).toContain('veteran');
    expect(createAbility('quest').condition).toBe('manyMonsters');
    expect(getAbility('foretell')?.group).toBe('待機ゾーン');
  });

  it('効果のポイントとテキスト（予示・追加ターン・HP交換・強奪・砦）', () => {
    const rows: [EffectInstance, number, string][] = [
      [fx({ id: 'manifest', target: 'self' }), 9, '山札の一番上を裏向きのモンスターとして出す。'],
      [fx({ id: 'extraTurn', target: 'self' }), 40, 'このターンのあと、追加のターンを得る。'],
      [fx({ id: 'swapHp', target: 'self' }), 30, '自分と相手のHPを入れ替える。'],
      [fx({ id: 'heist', target: 'enemyPlayer' }), 8, '相手の山札から3枚を見て、1枚のコピーを手札に加える。'],
      [fx({ id: 'siege', value: 3, target: 'self' }), 1, '相手の場に体力3の砦を置く。'],
    ];
    for (const [e, pts, text] of rows) {
      const c = SPELL([e]);
      const a = analyzeCard(c);
      expect(a.violations, e.id).toEqual([]);
      expect(a.points.lines.find((l) => l.kind === 'effect')?.value, e.id).toBe(pts);
      expect(a.text.effects, e.id).toEqual([text]);
    }
    // 砦の報酬：カードを3枚引く（12×0.8）
    const siege = SPELL([fx({ id: 'siege', value: 3, target: 'self' }), fx({ id: 'draw', value: 3, target: 'self', timing: 'siegeWon' })], { rarity: 'common', cost: 1 });
    expect(analyzeCard(siege).violations).toEqual([]);
    expect(analyzeCard(siege).points.lines.filter((l) => l.kind === 'effect').map((l) => l.value)).toEqual([1, 10]);
    expect(describeCard(siege).effects[1]).toBe('砦を落としたとき、カードを3枚引く。');
  });
});

// ---------------------------------------------------------------- 検証
describe('検証（△ バッチC）', () => {
  const table: [string, CardDef, string[]][] = [
    ['出来事は「出来事」の効果が要る', MON(2, 2, { abilities: [AB('adventure', 1)] }), ['ADVENTURE_MISMATCH']],
    ['「出来事」の効果は能力が要る', MON(2, 2, { effects: [fx({ ...DMG4, timing: 'adventure' })] }), ['ADVENTURE_MISMATCH']],
    ['「達成したとき」は事件か進化が要る', POWER([fx({ ...DRAW1, timing: 'achievedNow' })]), ['ACHIEVE_MISMATCH']],
    ['「達成していれば」は事件か進化が要る', POWER([fx({ ...DRAW1, timing: 'turnStart', condition: 'achieved' })]), ['ACHIEVE_MISMATCH']],
    ['事件の条件は達成条件だけ（コイン投げは不可）', POWER([fx({ ...DRAW1, timing: 'turnStart' })], { abilities: [AB('quest', undefined, { condition: 'coinFlip' })] }), ['ACHIEVE_CONDITION']],
    ['パワーの事件に「このモンスター」の条件は不可', POWER([fx({ ...DRAW1, timing: 'turnStart' })], { abilities: [AB('quest', undefined, { condition: 'veteran' })] }), ['ACHIEVE_CONDITION']],
    ['事件は条件が要る', POWER([fx({ ...DRAW1, timing: 'turnStart' })], { abilities: [AB('quest')] }), ['ACHIEVE_CONDITION']],
    ['「Lvが上がったとき」「Lv2以上なら」は Lvアップが要る', MON(2, 2, { effects: [fx({ ...DRAW1, timing: 'leveledUp' }), fx({ ...DRAW1, timing: 'turnStart', condition: 'level2' })] }), ['LEVEL_MISMATCH', 'LEVEL_MISMATCH']],
    ['忠誠は +1 か −K の効果が要る', POWER([fx({ ...DRAW1, timing: 'turnStart' })], { abilities: [AB('loyalty', 3, { option: '3' })] }), ['LOYALTY_MISMATCH']],
    ['忠誠のタイミングは忠誠が要る', POWER([fx({ ...DRAW1, timing: 'loyaltyPlus' })]), ['LOYALTY_MISMATCH']],
    ['砦を落としたときは「砦を築く」が要る', SPELL([DMG4, fx({ ...DRAW1, timing: 'siegeWon' })]), ['SIEGE_MISMATCH']],
    ['待機・ワープのエナジーは印刷コスト未満', MON(2, 2, { cost: 1, abilities: [AB('warp', 1)] }), ['ALT_COST']],
    ['待機のエナジーは印刷コスト未満', SPELL([DMG4], { cost: 1, abilities: [AB('suspend', 2, { option: '1' })] }), ['ALT_COST']],
    ['紋章・特殊勝利はレジェンドだけ', POWER([fx({ ...DRAW1, timing: 'turnStart' })], { rarity: 'epic', abilities: [AB('emblem')] }), ['ABILITY_RARITY']],
    ['追加ターン・HP交換はレジェンドだけ', SPELL([fx({ id: 'extraTurn', target: 'self' })], { rarity: 'epic' }), ['EFFECT_RARITY']],
    ['強奪はレア以上', SPELL([fx({ id: 'heist', target: 'enemyPlayer' })], { rarity: 'common', cost: 1 }), ['EFFECT_RARITY']],
    ['紋章と忠誠は同時に付けない', POWER([fx({ ...DRAW1, timing: 'loyaltyPlus' })], { abilities: [AB('emblem'), AB('loyalty', 3, { option: '3' })] }), ['ABILITY_CONFLICT']],
    ['事件と英雄譚は同時に付けない', POWER([fx({ ...DRAW1, timing: 'chapter1' })], { abilities: [AB('quest', undefined, { condition: 'manyMonsters' })] }), ['SAGA_MIXED']],
    ['追加の支払い・代わりの使い方は1つ（ワープと変装）', MON(2, 2, { abilities: [AB('warp', 1), AB('disguise', 1)] }), ['EXTRA_CONFLICT']],
    ['砦は呪文の使用時だけ', MON(2, 2, { effects: [fx({ id: 'siege', value: 3, target: 'self', timing: 'summon' })] }), ['EFFECT_BASE', 'EFFECT_TIMING']],
  ];
  it.each(table)('%s', (_label, c, expected) => {
    expect(vio(c)).toEqual(expected);
  });

  it('取り込み：新しい能力・条件を読める', () => {
    const c = MON(2, 2, { abilities: [AB('evolve', 2, { condition: 'veteran' }), AB('disguise', 2)] });
    const r = parseCard(JSON.parse(JSON.stringify(c)));
    expect(r.ok && r.value.abilities).toEqual(c.abilities);
  });
});

// ---------------------------------------------------------------- 待機ゾーン（対戦）
describe('待機ゾーン（対戦）', () => {
  it('予顕：エナジー2で裏向きに置く。置いたターンは使えず、次の自分のターンにコスト−K。相手には見えない', () => {
    let g = fresh();
    const c = giveCard(g, 0, SPELL([DMG4], { abilities: [AB('foretell', 2)] }));
    const cardId = g.players[0].hand.find((x) => x.uid === c)!.cardId;
    g = act(g, { type: 'setAside', player: 0, cardUid: c, kind: 'foretell' });
    expect(g.players[0].energy).toBe(18);
    expect(g.players[0].waiting).toMatchObject([{ kind: 'foretell', hidden: true }]);
    expect(g.players[0].turn.cardsPlayed).toBe(0);
    expect(playErr(g, c, { from: 'waiting', chosen: { enemy: P(1) } })).toContain('置いたターン');
    expect(view(g, 1)).not.toContain(cardId);
    expect(view(g, 0)).toContain(cardId);
    g = nextMine(g);
    expect(view(g, 1)).not.toContain(cardId);
    const hp = g.players[1].hp;
    expect(battle.playInfo(g, 0, g.players[0].waiting![0]!.card, { from: 'waiting' })).toMatchObject({ cost: 1, blocked: null, from: 'waiting' });
    g = play(g, c, { from: 'waiting', chosen: { enemy: P(1) } });
    expect(g.players[0].energy).toBe(19);
    expect(g.players[1].hp).toBe(hp - 4);
    expect(g.players[0].waiting).toEqual([]);
    expect(g.players[0].turn.cardsPlayed).toBe(1);
  });

  it('計画：今の実コストを払い、後のターンに無料で使う（凍結・軽減は掛からない。X は0）', () => {
    let g = fresh();
    const c = giveCard(g, 0, SPELL([fx({ id: 'damage', value: 2, mods: ['xEnergy'] })], { abilities: [AB('plot')] }));
    g = act(g, { type: 'setAside', player: 0, cardUid: c, kind: 'plot' });
    expect(g.players[0].energy).toBe(17);
    expect(g.players[0].waiting).toMatchObject([{ kind: 'plot' }]);
    expect(g.players[0].waiting![0]!.hidden).toBeUndefined();
    g = nextMine(g);
    g.players[0].turn.freezeTax = true;
    g = play(g, c, { from: 'waiting', chosen: { enemy: P(1) } });
    expect(g.players[0].energy).toBe(20);
    expect(g.players[0].turn.freezeTax).toBe(true);
    expect(g.log.some((e) => e.text.includes('X＝0'))).toBe(true);
  });

  it('待機：K で置き、自分のターン開始時に1ずつ減って0で無料で使われる（モンスターは速攻）。上限5枚', () => {
    let g = fresh();
    const c = giveCard(g, 0, MON(3, 3, { abilities: [AB('suspend', 2, { option: '1' })] }));
    g = act(g, { type: 'setAside', player: 0, cardUid: c, kind: 'suspend' });
    expect(g.players[0].energy).toBe(19);
    expect(playErr(g, c, { from: 'waiting' })).toContain('自動で使われます');
    g = nextMine(g);
    expect(g.players[0].waiting).toMatchObject([{ kind: 'suspend', time: 1 }]);
    g = nextMine(g);
    expect(g.players[0].waiting).toEqual([]);
    const m = monster(g, c)!;
    expect(m.counters.hasteTurn).toBe(g.turnIndex);
    expect(battle.attackBlockReason(g, m)).toBeNull();
    const hp = g.players[1].hp;
    g = attack(g, c, P(1));
    expect(g.players[1].hp).toBe(hp - 3);
    // 上限
    g.players[0].waiting = Array.from({ length: 5 }, (_, i) => ({ card: { uid: `w${i}`, cardId: g.players[0].board[0]!.card.cardId, owner: 0 as const }, kind: 'plot' as const, since: 0 }));
    const d = giveCard(g, 0, SPELL([DMG4], { abilities: [AB('plot')] }));
    expect(actError(g, { type: 'setAside', player: 0, cardUid: d, kind: 'plot' })).toContain('5枚');
  });

  it('ワープ：K で出してターン終了時に待機ゾーンへ。後のターンに普通のコストで出し直すと召喚時の効果がまた出る', () => {
    let g = fresh();
    const c = giveCard(g, 0, MON(2, 2, { effects: [fx({ ...DMG4, timing: 'summon' })], abilities: [AB('warp', 1)] }));
    const hp = g.players[1].hp;
    g = play(g, c, { alt: 'warp', chosen: { enemy: P(1) } });
    expect(g.players[0].energy).toBe(19);
    expect(monster(g, c)?.warped).toBe(true);
    expect(g.players[1].hp).toBe(hp - 4);
    g = endTurn(g);
    expect(monster(g, c)).toBeUndefined();
    expect(g.players[0].waiting).toMatchObject([{ kind: 'warp' }]);
    g = rich(endTurn(g), 0, 20);
    g = play(g, c, { from: 'waiting', chosen: { enemy: P(1) } });
    expect(g.players[0].energy).toBe(17);
    expect(g.players[1].hp).toBe(hp - 8);
    expect(monster(g, c)?.warped).toBeUndefined();
    // ワープは手札からだけ
    const d = giveCard(g, 0, MON(2, 2, { abilities: [AB('warp', 1)] }));
    expect(playErr(g, d, { alt: 'warp', from: 'discard' })).toBeTruthy();
  });

  it('出来事：出来事の効果を呪文（スキル）として使い、待機ゾーンへ。後のターンにモンスターとして出す', () => {
    let g = fresh();
    const c = giveCard(g, 0, MON(3, 3, { effects: [fx({ ...DMG4, timing: 'adventure' })], abilities: [AB('adventure', 1)] }));
    const hp = g.players[1].hp;
    g = play(g, c, { alt: 'adventure', chosen: { enemy: P(1) } });
    expect(g.players[0].energy).toBe(19);
    expect(g.players[1].hp).toBe(hp - 4);
    expect(g.players[0].board).toEqual([]);
    expect(g.players[0].waiting).toMatchObject([{ kind: 'adventure' }]);
    expect(g.players[0].turn.typesPlayed).toEqual(['skill']);
    expect(playErr(g, c, { from: 'waiting' })).toContain('置いたターン');
    g = nextMine(g);
    expect(playErr(g, c, { from: 'waiting', alt: 'adventure', chosen: { enemy: P(1) } })).toBeTruthy();
    g = play(g, c, { from: 'waiting' });
    expect(monster(g, c)?.attack).toBe(3);
    expect(g.players[0].energy).toBe(17);
  });
});

// ---------------------------------------------------------------- 達成・Lv・忠誠（対戦）
describe('達成・Lv・忠誠（対戦）', () => {
  it('事件：持ち主のターン終了時に条件を満たしていれば解明（1回きり）。「達成していれば」が働く', () => {
    let g = fresh();
    const q = POWER([fx({ ...DRAW1, timing: 'achievedNow' }), fx({ id: 'shield', value: 5, target: 'self', timing: 'turnStart', condition: 'achieved' })], {
      abilities: [AB('quest', undefined, { condition: 'hasMonster' })],
    });
    g = play(g, giveCard(g, 0, q));
    const pw = () => g.players[0].powers[0]!;
    g = endTurn(g);
    expect(pw().achieved).toBeUndefined();
    g = rich(endTurn(g), 0);
    expect(g.players[0].shield).toBe(0);
    putMonster(g, 0, MON(1, 1));
    g = endTurn(g);
    expect(pw().achieved).toBe(true);
    expect(g.log.filter((e) => e.text.includes('を解明した'))).toHaveLength(1);
    g = rich(endTurn(g), 0);
    expect(g.players[0].shield).toBe(5);
    g = endTurn(g);
    expect(g.log.filter((e) => e.text.includes('を解明した'))).toHaveLength(1);
  });

  it('進化：条件を満たすと攻撃力・体力+N（1回きり）。封印中は進化しない', () => {
    let g = fresh();
    const ev = MON(2, 2, { abilities: [AB('evolve', 2, { condition: 'allyAttackedThisTurn' })], effects: [fx({ ...DRAW1, timing: 'achievedNow' })] });
    const a = putMonster(g, 0, ev);
    const b = putMonster(g, 0, ev, { sealed: true });
    g = attack(g, a, P(1));
    const hand = g.players[0].hand.length;
    g = endTurn(g);
    expect(monster(g, a)).toMatchObject({ achieved: true, attack: 4, hp: 4, maxHp: 4 });
    expect(monster(g, b)?.achieved).toBeUndefined();
    expect(g.log.some((e) => e.text.includes('は進化した'))).toBe(true);
    void hand;
  });

  it('Lvアップ：エナジー K で Lv を1上げる（1ターン1回・Lv3まで）。モンスターは+N/+N、「Lvが上がったとき」', () => {
    let g = fresh();
    const lv = MON(2, 2, { abilities: [AB('levelUp', 1, { option: '1' })], effects: [fx({ id: 'shield', value: 1, target: 'self', timing: 'leveledUp' })] });
    const m = putMonster(g, 0, lv);
    g = act(g, { type: 'activate', player: 0, sourceUid: m, use: 'level' });
    expect(g.players[0].energy).toBe(19);
    expect(monster(g, m)).toMatchObject({ attack: 3, hp: 3, maxHp: 3 });
    expect(monster(g, m)!.counters.level).toBe(2);
    expect(g.players[0].shield).toBe(1);
    expect(actError(g, { type: 'activate', player: 0, sourceUid: m, use: 'level' })).toContain('1ターン1回');
    expect(actError(g, { type: 'activate', player: 0, sourceUid: m })).toContain('起動できません');
    g = nextMine(g);
    g = act(g, { type: 'activate', player: 0, sourceUid: m, use: 'level' });
    expect(monster(g, m)!.counters.level).toBe(3);
    g = nextMine(g);
    expect(actError(g, { type: 'activate', player: 0, sourceUid: m, use: 'level' })).toContain('最大');
    expect(battle.activateInfos(g, 0).find((x) => x.use === 'level')?.blocked).toContain('最大');
  });

  it('Lvアップ（パワー）：「Lv2以上なら」の効果は Lv2 から働く', () => {
    let g = fresh();
    const pw = POWER([fx({ id: 'shield', value: 3, target: 'self', timing: 'turnStart', condition: 'level2' })], { abilities: [AB('levelUp', 0, { option: '1' })] });
    g = play(g, giveCard(g, 0, pw));
    g = nextMine(g);
    expect(g.players[0].shield).toBe(0);
    const uid = g.players[0].powers[0]!.uid;
    g = act(g, { type: 'activate', player: 0, sourceUid: uid, use: 'level' });
    expect(g.players[0].powers[0]!.level).toBe(2);
    g = nextMine(g);
    expect(g.players[0].shield).toBe(3);
  });

  it('忠誠：+1・−K はどちらか1ターン1回。−K は忠誠が足りなければ使えない。相手のモンスターの攻撃で−1、0で消える', () => {
    let g = fresh();
    const pw = POWER([fx({ ...DRAW1, timing: 'loyaltyPlus' }), fx({ ...DMG4, timing: 'loyaltyMinus' })], { abilities: [AB('loyalty', 3, { option: '3' })] });
    g = play(g, giveCard(g, 0, pw));
    const uid = g.players[0].powers[0]!.uid;
    expect(g.players[0].powers[0]!.loyalty).toBe(3);
    const hand = g.players[0].hand.length;
    g = act(g, { type: 'activate', player: 0, sourceUid: uid, use: 'plus' });
    expect(g.players[0].powers[0]!.loyalty).toBe(4);
    expect(g.players[0].hand.length).toBe(hand + 1);
    expect(actError(g, { type: 'activate', player: 0, sourceUid: uid, use: 'minus', chosen: { enemy: P(1) } })).toContain('1ターン1回');
    g = nextMine(g);
    const hp = g.players[1].hp;
    g = act(g, { type: 'activate', player: 0, sourceUid: uid, use: 'minus', chosen: { enemy: P(1) } });
    expect(g.players[0].powers[0]!.loyalty).toBe(1);
    expect(g.players[1].hp).toBe(hp - 4);
    g = nextMine(g);
    expect(actError(g, { type: 'activate', player: 0, sourceUid: uid, use: 'minus', chosen: { enemy: P(1) } })).toContain('忠誠が足りません');
    // 相手のモンスターの攻撃で HP が減ると −1 → 0 で消える
    g = endTurn(g);
    const e = putMonster(g, 1, MON(2, 2));
    g = attack(g, e, P(0));
    expect(g.players[0].powers).toEqual([]);
    expect(g.log.some((x) => x.text.includes('忠誠が0になって消えた'))).toBe(true);
  });
});

// ---------------------------------------------------------------- 裏向き（対戦）
describe('裏向きのモンスター（対戦）', () => {
  it('変装：2で裏向き（2/2・護法1・効果なし）。表にすると印刷のステータス（受けたダメージは引き継ぐ）と「表になったとき」', () => {
    let g = fresh();
    const def = MON(4, 6, { effects: [fx({ ...DMG4, timing: 'revealed' }), fx({ ...DMG4, timing: 'summon' })], abilities: [AB('disguise', 1)] });
    const c = giveCard(g, 0, def);
    const cardId = `p0:${def.id}`;
    const hp = g.players[1].hp;
    g = play(g, c, { alt: 'faceDown' });
    expect(g.players[0].energy).toBe(18);
    const m = monster(g, c)!;
    expect(m).toMatchObject({ attack: 2, hp: 2, card: { cardId: battle.FACE_DOWN_WARD_CARD_ID } });
    expect(m.faceDown).toMatchObject({ kind: 'disguise', revealCost: 1 });
    expect(g.players[1].hp).toBe(hp);
    expect(view(g, 1)).not.toContain(cardId);
    expect(view(g, 1)).toContain('裏向き');
    expect(battle.viewFor(g, 1).players[0].board[0]!.faceDown).toEqual({ kind: 'disguise', revealCost: null });
    // 護法1：相手がカードで選ぶと+1
    g = endTurn(g);
    const zap = giveCard(g, 1, SPELL([fx({ id: 'damage', value: 1 })], { rarity: 'common', cost: 1 }));
    rich(g, 1, 20);
    expect(battle.playInfo(g, 1, g.players[1].hand.find((x) => x.uid === zap)!).targetCosts).toEqual({ [c]: 2 });
    g = play(g, zap, { chosen: { enemy: M(c) } });
    expect(monster(g, c)!.hp).toBe(1);
    g = rich(endTurn(g), 0);
    expect(view(g, 1)).not.toContain(cardId);
    g = act(g, { type: 'reveal', player: 0, uid: c, chosen: { enemy: P(1) } });
    expect(monster(g, c)).toMatchObject({ attack: 4, hp: 5, maxHp: 6, card: { cardId } });
    expect(monster(g, c)!.faceDown).toBeUndefined();
    expect(g.players[1].hp).toBe(hp - 4);
    expect(g.players[0].energy).toBe(19);
  });

  it('裏向きのまま破壊されると公開されて捨て札へ（「破壊されたとき」は出ない）', () => {
    let g = fresh();
    const def = MON(4, 6, { effects: [fx({ ...DRAW1, timing: 'destroyed' })], abilities: [AB('disguise', 1)] });
    const c = giveCard(g, 0, def);
    g = play(g, c, { alt: 'faceDown' });
    g = endTurn(g);
    rich(g, 1, 20);
    const hand = g.players[0].hand.length;
    g = play(g, giveCard(g, 1, SPELL([fx({ id: 'damage', value: 5 })], { rarity: 'common', cost: 1 })), { chosen: { enemy: M(c) } });
    expect(monster(g, c)).toBeUndefined();
    expect(g.players[0].discard.map((x) => x.cardId)).toContain(`p0:${def.id}`);
    expect(g.players[0].hand.length).toBe(hand);
    expect(g.log.some((e) => e.text.includes('裏向きのモンスターは「'))).toBe(true);
  });

  it('予示：山札の一番上を裏向きで出す。モンスターならその印刷コストで表にでき、モンスター以外は表にできない', () => {
    let g = fresh();
    const top = MON(5, 5, { cost: 4 });
    g.cards[`p0:${top.id}`] = top;
    g.players[0].deck.unshift({ uid: 'top1', cardId: `p0:${top.id}`, owner: 0 });
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'manifest', target: 'self' })])));
    expect(monster(g, 'top1')).toMatchObject({ attack: 2, hp: 2, faceDown: { kind: 'manifest', revealCost: 4 }, card: { cardId: battle.FACE_DOWN_CARD_ID } });
    expect(view(g, 1)).not.toContain(`p0:${top.id}`);
    g = act(g, { type: 'reveal', player: 0, uid: 'top1' });
    expect(monster(g, 'top1')).toMatchObject({ attack: 5, hp: 5 });
    // 予示したのがモンスターでなければ表にできない
    g.players[0].deck.unshift({ uid: 'top2', cardId: g.players[0].deck[1]!.cardId, owner: 0 });
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'manifest', target: 'self' })])));
    expect(monster(g, 'top2')?.faceDown?.revealCost).toBeNull();
    expect(actError(g, { type: 'reveal', player: 0, uid: 'top2' })).toContain('表にできません');
    expect(battle.revealInfos(g, 0).find((x) => x.uid === 'top2')?.blocked).toContain('表にできません');
  });
});

// ---------------------------------------------------------------- 追加ターン・特殊勝利・HP交換・強奪・紋章・砦
describe('追加ターン・特殊勝利・HP交換・強奪・紋章・砦（対戦）', () => {
  it('追加ターン：このターンのあと、もう一度自分のターン（1試合1回）。待機で無料で使ったときは不発', () => {
    let g = fresh();
    const xt = SPELL([fx({ id: 'extraTurn', target: 'self' })]);
    g = play(g, giveCard(g, 0, xt));
    expect(g.players[0].extraTurnPending).toBe(true);
    const t = g.turnIndex;
    g = endTurn(g);
    expect(g.active).toBe(0);
    expect(g.turnIndex).toBe(t + 1);
    expect(g.players[0].turnsTaken).toBe(2);
    expect(g.log.some((e) => e.ev?.kind === 'turnStart' && e.ev.extra)).toBe(true);
    rich(g, 0, 20);
    g = play(g, giveCard(g, 0, xt));
    expect(g.players[0].extraTurnPending).toBeUndefined();
    g = endTurn(g);
    expect(g.active).toBe(1);
    // 待機で無料で使ったときは不発
    let h = fresh();
    const c = giveCard(h, 0, SPELL([fx({ id: 'extraTurn', target: 'self' })], { abilities: [AB('suspend', 1, { option: '1' })] }));
    h = act(h, { type: 'setAside', player: 0, cardUid: c, kind: 'suspend' });
    h = nextMine(h);
    expect(h.players[0].extraTurnUsed).toBeUndefined();
    expect(h.log.some((e) => e.text.includes('追加ターンは、無料で使ったとき'))).toBe(true);
  });

  it('特殊勝利（ターン）：目標に届いても通算8ターンより前には勝たない。届いていれば8ターン以降のターン開始時に勝つ', () => {
    let g = fresh();
    const pw = POWER([fx({ id: 'shield', value: 1, target: 'self', timing: 'turnStart' })], { cost: 5, abilities: [AB('altWin', undefined, { option: 'turns' })] });
    g = play(g, giveCard(g, 0, pw));
    expect(g.players[0].powers[0]!.progress).toBe(0);
    g = nextMine(g); // 3
    g = nextMine(g); // 5
    g = nextMine(g); // 7
    expect(g.players[0].powers[0]!.progress).toBe(3);
    g = nextMine(g); // 9
    expect(g.phase).toBe('ended');
    expect(g.result).toEqual({ winner: 0, reason: 'altWin' });
  });

  it('特殊勝利（カード）：目標の数だけ使うと勝つ（8ターン目より前はたまるだけ）。解除でパワーごと消える', () => {
    let g = fresh();
    const pw = POWER([fx({ id: 'shield', value: 1, target: 'self', timing: 'turnStart' })], { cost: 5, abilities: [AB('altWin', undefined, { option: 'cards' })] });
    g = play(g, giveCard(g, 0, pw));
    g.players[0].powers[0]!.progress = 11;
    g = play(g, giveCard(g, 0, SPELL([DRAW1], { rarity: 'common', cost: 1 })));
    expect(g.phase).toBe('main');
    expect(g.players[0].powers[0]!.progress).toBe(12);
    // 相手の解除で消える
    g = endTurn(g);
    rich(g, 1, 20);
    g = play(g, giveCard(g, 1, SPELL([fx({ id: 'dispel', target: 'enemyPlayer' })])));
    if (g.pending) g = act(g, { type: 'choose', player: 1, picks: [g.pending.options.find((o) => o.id.startsWith('altwin:'))!.id] });
    expect(g.players[0].powers).toEqual([]);
    // 8ターン目以降なら勝つ
    let h = fresh();
    h.turnIndex = 9;
    h = play(h, giveCard(h, 0, pw));
    h.players[0].powers[0]!.progress = 11;
    h = play(h, giveCard(h, 0, SPELL([DRAW1], { rarity: 'common', cost: 1 })));
    expect(h.result).toEqual({ winner: 0, reason: 'altWin' });
  });

  it('特殊勝利（場）：自分のターン開始時にモンスターが5体以上なら勝つ', () => {
    let g = fresh();
    g.turnIndex = 9;
    g = play(g, giveCard(g, 0, POWER([fx({ id: 'shield', value: 1, target: 'self', timing: 'turnStart' })], { cost: 5, abilities: [AB('altWin', undefined, { option: 'board' })] })));
    for (let i = 0; i < 5; i++) putMonster(g, 0, MON(1, 9, { keywords: [] }));
    g = endTurn(g);
    g = endTurn(g);
    expect(g.result).toEqual({ winner: 0, reason: 'altWin' });
  });

  it('HP交換：自分のHPが相手より少ないときだけ・1試合1回。得る HP は最大HPの半分まで', () => {
    let g = fresh();
    const sw = SPELL([fx({ id: 'swapHp', target: 'self' })]);
    const c = giveCard(g, 0, sw);
    expect(playErr(g, c)).toContain('少ないとき');
    g.players[0].hp = 30;
    g.players[1].hp = 100;
    g = play(g, c);
    expect([g.players[0].hp, g.players[1].hp]).toEqual([90, 30]);
    g.players[0].hp = 10;
    expect(playErr(g, giveCard(g, 0, sw))).toContain('1試合1回');
  });

  it('強奪：相手の山札から3枚を見て1枚のコピー（使い切り）を手札へ。相手の山札の順は変わらず、相手には候補が見えない', () => {
    let g = fresh();
    const rare = SPELL([fx({ id: 'damage', value: 9 })], { name: '秘宝' });
    g.cards[`p1:${rare.id}`] = rare;
    g.players[1].deck.splice(2, 0, { uid: 'secret', cardId: `p1:${rare.id}`, owner: 1 });
    const order = g.players[1].deck.map((c) => c.uid);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'heist', target: 'enemyPlayer' })], { rarity: 'rare', cost: 2 })));
    expect(g.pending?.options.length).toBeLessThanOrEqual(3);
    expect(battle.viewFor(g, 1).pending?.options).toEqual([]);
    const pick = g.pending!.options[0]!;
    g = act(g, { type: 'choose', player: 0, picks: [pick.id] });
    const copy = g.players[0].hand.find((c) => c.heisted)!;
    expect(copy).toMatchObject({ copy: 'temp', owner: 0, cardId: pick.cardId });
    expect(g.players[1].deck.map((c) => c.uid)).toEqual(order);
    expect(view(g, 1)).not.toContain(`"heisted":true`);
  });

  it('紋章：パワーの上限に数えず、解除されない。1人1つまで', () => {
    let g = fresh();
    const em = POWER([fx({ id: 'shield', value: 2, target: 'self', timing: 'turnStart' })], { cost: 2, abilities: [AB('emblem')] });
    g = play(g, giveCard(g, 0, em));
    expect(g.players[0].emblems).toHaveLength(1);
    expect(g.players[0].powers).toHaveLength(0);
    expect(playErr(g, giveCard(g, 0, em))).toContain('紋章は1人1つ');
    for (let i = 0; i < 3; i++) g = play(g, giveCard(g, 0, POWER([fx({ id: 'shield', value: 1, target: 'self', timing: 'turnEnd' })], { rarity: 'common', cost: 1 })));
    expect(g.players[0].powers).toHaveLength(3);
    expect(g.players[0].emblems).toHaveLength(1);
    g = endTurn(g);
    rich(g, 1, 20);
    g = play(g, giveCard(g, 1, SPELL([fx({ id: 'dispel', target: 'enemyPlayer' })])));
    if (g.pending) g = act(g, { type: 'choose', player: 1, picks: [g.pending.options[0]!.id] });
    expect(g.players[0].emblems).toHaveLength(1);
    g = endTurn(g);
    expect(g.players[0].shield).toBe(2);
  });

  it('砦：相手の場に置く（攻撃も反撃もしない・トークンの上限に数えない）。壊すと築いた人に報酬。1人1つまで。奪取・バウンスでは報酬なし', () => {
    let g = fresh();
    const sg = SPELL([fx({ id: 'siege', value: 3, target: 'self' }), fx({ id: 'draw', value: 2, target: 'self', timing: 'siegeWon' })], { rarity: 'common', cost: 1 });
    g = play(g, giveCard(g, 0, sg));
    const s = g.players[1].board[0]!;
    expect(s).toMatchObject({ attack: 0, hp: 3, controller: 1, siege: { player: 0 } });
    expect(battle.tokenCount(g, 1)).toBe(0);
    expect(battle.attackBlockReason({ ...g, active: 1 }, s)).toContain('砦');
    g = play(g, giveCard(g, 0, sg));
    expect(g.players[1].board).toHaveLength(1);
    const a = putMonster(g, 0, MON(3, 3));
    const hand = g.players[0].hand.length;
    g = attack(g, a, M(s.uid));
    expect(g.players[1].board).toEqual([]);
    expect(monster(g, a)!.hp).toBe(3);
    expect(g.players[0].hand.length).toBe(hand + 2);
    // バウンスでは報酬なし
    g = play(g, giveCard(g, 0, sg));
    const s2 = g.players[1].board[0]!.uid;
    const hand2 = g.players[0].hand.length;
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'bounce', value: 5 })])), { chosen: { enemy: M(s2) } });
    expect(g.players[1].board).toEqual([]);
    expect(g.players[0].hand.length).toBe(hand2);
  });
});

// ---------------------------------------------------------------- 決着の片付け
describe('決着の片付け（△ バッチC）', () => {
  it('降参しても待機ゾーン・裏向きのカードは増えも減りもしない', () => {
    let g = fresh();
    const c = giveCard(g, 0, SPELL([DMG4], { abilities: [AB('plot')] }));
    g = act(g, { type: 'setAside', player: 0, cardUid: c, kind: 'plot' });
    const d = giveCard(g, 0, MON(2, 2, { abilities: [AB('disguise', 1)] }));
    g = play(g, d, { alt: 'faceDown' });
    const count = (s: G) => {
      const ps = s.players[0];
      return ps.deck.length + ps.hand.length + ps.discard.length + ps.exile.length + (ps.waiting ?? []).length + ps.board.filter((m) => !m.card.token).length;
    };
    const before = count(g);
    g = act(g, { type: 'concede', player: 0 });
    expect(count(g)).toBe(before);
  });
});

// ---------------------------------------------------------------- オンライン（受付）
describe('オンラインの受付（△ バッチC）', () => {
  it('新しい行動・項目を検証して作り直す。範囲外・型違いは拒否、知らない項目は捨てる', () => {
    expect(parseAction({ type: 'setAside', player: 0, cardUid: 'c1', kind: 'foretell', junk: 1 })).toEqual({ type: 'setAside', player: 0, cardUid: 'c1', kind: 'foretell' });
    expect(parseAction({ type: 'setAside', player: 0, cardUid: 'c1', kind: 'warp' })).toBeNull();
    expect(parseAction({ type: 'reveal', player: 1, uid: 'm1', chosen: { enemy: { kind: 'player', player: 0 } }, x: 2 })).toEqual({
      type: 'reveal',
      player: 1,
      uid: 'm1',
      chosen: { enemy: { kind: 'player', player: 0 } },
    });
    expect(parseAction({ type: 'reveal', player: 1, uid: 3 })).toBeNull();
    expect(parseAction({ type: 'activate', player: 0, sourceUid: 's', use: 'minus' })).toMatchObject({ use: 'minus' });
    expect(parseAction({ type: 'activate', player: 0, sourceUid: 's', use: 'boom' })).toBeNull();
    expect(parseAction({ type: 'playCard', player: 0, cardUid: 'c', from: 'waiting' })).toMatchObject({ from: 'waiting' });
    expect(parseAction({ type: 'playCard', player: 0, cardUid: 'c', from: 'deck' })).toBeNull();
    for (const alt of ['warp', 'adventure', 'faceDown']) expect(parseAction({ type: 'playCard', player: 0, cardUid: 'c', alt })).toMatchObject({ alt });
  });
});

// ---------------------------------------------------------------- CPU
describe('CPU（△ バッチC）', () => {
  const m = (id: string, name: string, cost: number, a: number, h: number, extra: Partial<CardDef> = {}) =>
    card({ id, name, rarity: 'common', cost, stats: { attack: a, hp: h, defense: 0 }, ...extra });
  const s = (id: string, name: string, cost: number, effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id, name, rarity: 'common', cost, effects, ...extra });
  const D = (v: number, extra: Partial<EffectInstance> = {}) => fx({ id: 'damage', value: v, ...extra });
  const SH = (timing: EffectInstance['timing'], extra: Partial<EffectInstance> = {}) => fx({ id: 'shield', value: 1, target: 'self', timing, ...extra });
  const cards: CardDef[] = [
    s('foretell', '伏せた矢', 2, [D(3)], { abilities: [AB('foretell', 1)] }),
    s('plot', '計画の書', 2, [D(4)], { abilities: [AB('plot')] }),
    m('suspend', '眠れる巨人', 3, 3, 3, { abilities: [AB('suspend', 1, { option: '1' })] }),
    m('warp', 'ワープ兵', 2, 2, 2, { effects: [D(2, { timing: 'summon' })], abilities: [AB('warp', 1)] }),
    m('adventure', '冒険者', 3, 3, 3, { effects: [D(3, { timing: 'adventure' })], abilities: [AB('adventure', 1)] }),
    s('quest', '謎の事件', 2, [fx({ ...DRAW1, timing: 'achievedNow' }), SH('turnStart', { condition: 'achieved' })], { abilities: [AB('quest', undefined, { condition: 'hasMonster' })] }),
    m('evolve', '幼竜', 2, 2, 2, { abilities: [AB('evolve', 1, { condition: 'allyAttackedThisTurn' })] }),
    m('level', '見習い', 2, 1, 2, { abilities: [AB('levelUp', 1, { option: '1' })] }),
    m('disguise', '覆面', 3, 3, 4, { effects: [D(2, { timing: 'revealed' })], abilities: [AB('disguise', 1)] }),
    s('siege', '砦の策', 1, [fx({ id: 'siege', value: 3, target: 'self' }), fx({ id: 'draw', value: 2, target: 'self', timing: 'siegeWon' })]),
    s('extraTurn', '時の裂け目', 5, [fx({ id: 'extraTurn', target: 'self' })], { rarity: 'legend' }),
    s('altWin', '王の道', 5, [SH('turnStart')], { rarity: 'legend', abilities: [AB('altWin', undefined, { option: 'turns' })] }),
    s('loyalty', '英雄', 3, [fx({ ...DRAW1, timing: 'loyaltyPlus' }), D(4, { timing: 'loyaltyMinus' })], { rarity: 'rare', abilities: [AB('loyalty', 3, { option: '3' })] }),
    s('manifest', '予示の術', 1, [fx({ id: 'manifest', target: 'self' })], { rarity: 'rare' }),
    s('heist', '強奪', 2, [fx({ id: 'heist', target: 'enemyPlayer' })], { rarity: 'rare' }),
    s('emblem', '紋章', 3, [SH('turnStart')], { rarity: 'legend', abilities: [AB('emblem')] }),
    s('swap', '入れ替え', 4, [fx({ id: 'swapHp', target: 'self' })], { rarity: 'legend' }),
  ];
  const deckOf = (id: string, counts: Record<string, number>) => ({ v: 1 as const, id, name: id, entries: Object.entries(counts).map(([cardId, count]) => ({ cardId, count })) });
  const deckA = deckOf('tcA', { foretell: 3, plot: 3, suspend: 3, warp: 3, adventure: 3, quest: 2, evolve: 3, level: 3, disguise: 3, siege: 2, extraTurn: 1, altWin: 1 });
  const deckB = deckOf('tcB', { loyalty: 3, manifest: 3, heist: 2, emblem: 1, swap: 1, warp: 3, adventure: 3, level: 3, evolve: 3, disguise: 3, foretell: 3, siege: 2 });
  const byId = new Map(cards.map((c) => [c.id, c]));

  it('カードとデッキはすべて作れる（30枚ずつ）', () => {
    for (const c of cards) expect(analyzeCard(c).violations, c.name).toEqual([]);
    for (const d of [deckA, deckB]) {
      expect(d.entries.reduce((x, e) => x + e.count, 0)).toBe(30);
      expect(analyzeDeck(d, byId).violations).toEqual([]);
    }
  });

  const used = new Set<string>();
  const runGame = (seed: number, level: ai.CpuLevel, vsPreset = false) => {
    const opp = PRESET_DECKS[seed % PRESET_DECKS.length]!;
    const r = battle.createGame({
      seed,
      players: [
        { name: 'A', deck: deckA, cards },
        vsPreset ? { name: opp.name, deck: opp.deck, cards: opp.cards } : { name: 'B', deck: deckB, cards },
      ],
    });
    if (!r.ok) throw new Error(r.error);
    let g = r.state;
    let steps = 0;
    while (g.phase !== 'ended') {
      const p = g.phase === 'mulligan' ? (g.players[0].mulligan.done ? 1 : 0) : g.pending ? g.pending.player : g.active;
      const action = ai.cpuAction(g, p, steps, level);
      const next = battle.applyAction(g, action);
      expect(next.ok, next.ok ? '' : `${next.error}（${JSON.stringify(action)}）`).toBe(true);
      if (!next.ok) return g;
      if (action.type === 'setAside') used.add(`setAside:${action.kind}`);
      if (action.type === 'playCard' && action.from === 'waiting') used.add('fromWaiting');
      if (action.type === 'playCard' && action.alt) used.add(`alt:${action.alt}`);
      if (action.type === 'activate' && action.use) used.add(`use:${action.use}`);
      if (action.type === 'reveal') used.add('reveal');
      // 相手から見える状態に、隠したカードが漏れていない
      if (steps % 7 === 0) {
        for (const viewer of [0, 1] as const) {
          const v = battle.viewFor(g, viewer);
          const other = viewer === 0 ? 1 : 0;
          for (const w of v.players[other].waiting ?? []) if (w.hidden) expect(w.card.cardId).toBe(battle.HIDDEN_CARD_ID);
          for (const mm of v.players[other].board) if (mm.faceDown) expect(mm.faceDown.card).toBeUndefined();
        }
      }
      g = next.state;
      expect(++steps).toBeLessThan(6000);
    }
    for (const p of g.players) {
      if ((p.emblems ?? []).length) used.add('emblem');
      if (p.extraTurnUsed) used.add('extraTurn');
      if (p.swapUsed) used.add('swapHp');
    }
    if (g.log.some((e) => e.text.includes('を解明した'))) used.add('quest');
    if (g.log.some((e) => e.text.includes('は進化した'))) used.add('evolve');
    if (g.log.some((e) => e.text.includes('砦を落とした'))) used.add('siegeWon');
    if (g.log.some((e) => e.text.includes('強奪'))) used.add('heist');
    if (g.result?.reason === 'altWin') used.add('altWinResult');
    expect(g.result).not.toBeNull();
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
    return g;
  };

  for (const level of ['easy', 'normal'] as const) {
    it(`${ai.CPU_LEVEL_LABEL[level]}：新要素のデッキどうし・プリセットと最後まで不正な行動なしで戦える`, () => {
      runGame(2, level);
      runGame(7, level, true);
    }, 240_000);
  }
  it(`${ai.CPU_LEVEL_LABEL.hard}：最後まで不正な行動なしで戦える`, () => {
    runGame(4, 'hard');
  }, 300_000);
  it('CPU は新しい行動・能力を実際に使う', () => {
    for (const seed of [3, 9, 11, 13]) runGame(seed, 'normal');
    expect([...used].sort()).toEqual(
      expect.arrayContaining(['alt:adventure', 'alt:faceDown', 'alt:warp', 'emblem', 'evolve', 'fromWaiting', 'heist', 'quest', 'reveal', 'use:level', 'use:minus', 'use:plus']),
    );
    // 待機させるのは、ターンの終わりにエナジーが余ったとき（手札は捨て札になるので）
    expect([...used].some((k) => k.startsWith('setAside:'))).toBe(true);
  }, 300_000);
});
