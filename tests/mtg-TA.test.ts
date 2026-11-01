// MTG 要素 △ バッチA（条件3・タイミング3・対象1・修飾3・キーワード2・デメリット2・効果12・選択肢3・カードの能力1）。倍率1で確かめる（表で書く）
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
  modifiersFor,
  getEffect,
  parseCard,
  targetsForEffect,
  timingMultiplier,
  TIMING_GROUPS,
  TIMINGS,
  timingsFor,
  type AbilityInstance,
  type CardDef,
  type EffectInstance,
} from '../src/engine/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { parseAction } from '../src/online/protocol.ts';
import { card, codes } from './helpers.ts';
import { act, actError, attack, endTurn, fx, giveCard, logText, M, monster, P, putMonster, rich, startGame } from './battle/helpers.ts';

type G = battle.GameState;

let seq = 0;
const AB = (id: string, value?: number, extra: Partial<AbilityInstance> = {}): AbilityInstance => ({ id, ...(value === undefined ? {} : { value }), ...extra });
const SPELL = (effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id: `tas${++seq}`, name: `呪文${seq}`, rarity: 'legend', cost: 2, effects, ...extra });
const MON = (a: number, h: number, extra: Partial<CardDef> = {}) =>
  card({ id: `tam${++seq}`, name: `獣${seq}`, rarity: 'legend', cost: 2, stats: { attack: a, hp: h, defense: 0 }, ...extra });
const vio = (c: CardDef) => codes(analyzeCard(c).violations);
const play = (g: G, cardUid: string, extra: Partial<Extract<battle.Action, { type: 'playCard' }>> = {}) =>
  act(g, { type: 'playCard', player: g.active, cardUid, chosen: {}, ...extra });
/** P0 のターンを終えて P1 のターンも終え、P0 の次のターンにする */
const nextOwnTurn = (g: G) => endTurn(endTurn(g));
/** 山札の上に p のカードを並べた順に積む。積んだカードの uid（上から） */
const stack = (g: G, p: battle.PlayerId, defs: CardDef[]) => {
  const cards = defs.map((d, i) => {
    g.cards[`p${p}:${d.id}`] = d;
    return { uid: `stk${p}-${++seq}-${i}`, cardId: `p${p}:${d.id}`, owner: p };
  });
  g.players[p].deck.unshift(...cards);
  return cards.map((c) => c.uid);
};

const DMG5 = fx({ id: 'damage', value: 5 });
const DRAW1 = fx({ id: 'draw', value: 1, target: 'self' });

// ---------------------------------------------------------------- 定義：ポイントとテキスト
describe('定義（△ バッチA）：ポイント・テキスト', () => {
  // [名前, カード, 効果・能力・デメリットの合計（ステータス・コストの差し引き前）, 効果テキスト（デメリット・能力があればそれも）]
  const table: [string, CardDef, number, string[]][] = [
    ['収斂（このターン3種類以上）', SPELL([fx({ ...DMG5, condition: 'converge' })]), 8, ['このターン3種類以上のカードを使っていれば、相手1体に5ダメージを与える。']],
    ['落魄（捨て札にモンスターとパワー4枚）', SPELL([fx({ ...DMG5, condition: 'descend' })]), 11, ['捨て札にモンスターとパワーが合わせて4枚以上あれば、相手1体に5ダメージを与える。']],
    [
      '長久（攻撃していなければ育つ）',
      MON(2, 2, { effects: [fx({ id: 'train', value: 1, timing: 'turnEnd', target: 'thisMonster', condition: 'rested' })] }),
      8,
      ['自分のターン終了時、このモンスターがこのターン攻撃していなければ、このモンスターの攻撃力と体力を+1する。'],
    ],
    [
      '相手のモンスターが攻撃するたび（モンスター）',
      MON(1, 1, { effects: [fx({ id: 'damage', value: 5, timing: 'enemyAttacked', target: 'attacker' })] }),
      23,
      ['相手のモンスターが攻撃するたび、攻撃してきたモンスターに5ダメージを与える。'],
    ],
    ['罠のパワー（×1.2）', SPELL([fx({ id: 'damage', value: 5, timing: 'enemyAttacked', target: 'attacker' })], { abilities: [AB('trap')] }), 18, ['相手のモンスターが攻撃するたび、攻撃してきたモンスターに5ダメージを与える。']],
    ['捨てられたとき（マッドネス）', SPELL([fx({ ...DRAW1, timing: 'discarded' })]), 3, ['このカードが手札から捨てられたとき、カードを1枚引く。']],
    ['雄姿', MON(1, 1, { effects: [fx({ id: 'train', value: 1, timing: 'valiant', target: 'thisMonster' })] }), 5, ['各ターン初めて自分のカードの対象になったとき、このモンスターの攻撃力と体力を+1する。']],
    ['萎縮（+10%）', SPELL([fx({ ...DMG5, mods: ['witherDmg'] })]), 17, ['相手1体に5ダメージを与える（萎縮：減った体力のぶん最大体力も減る）。']],
    ['経験1につき（+100%）', SPELL([fx({ id: 'damage', value: 2, mods: ['perExp'] })]), 12, ['相手1体に2ダメージを与える（数値は自分の経験1につき、最大5）。']],
    ['ばらつき（−10%）', SPELL([fx({ ...DMG5, mods: ['gamble'] })]), 14, ['相手1体に5ダメージを与える（ばらつき：数値は0.5倍・そのまま・1.5倍のどれか）。']],
    ['消滅の印', SPELL([fx({ id: 'finality' })]), 2, ['相手モンスター1体に消滅の印を付ける（破壊されたら除外される）。']],
    ['放射能2', SPELL([fx({ id: 'rad', value: 2, target: 'self' })]), 3, ['相手に放射能2を与える。']],
    ['経験を得る1', SPELL([fx({ id: 'gainExp', value: 1, target: 'self' })]), 2, ['経験+1を得る。']],
    ['氷結1', SPELL([fx({ id: 'iceLock', value: 1, target: 'enemyPlayer' })]), 4, ['相手の次のターン、手札1枚を凍らせる（そのターンは使えない）。']],
    ['章を進める', SPELL([fx({ id: 'advanceSaga', target: 'self' })]), 3, ['自分の英雄譚1つを次の章に進める。']],
    ['培養3（3×3＋0.5）', SPELL([fx({ id: 'incubate', value: 3, target: 'self' })]), 10, ['攻撃力0・体力3の卵を出す（2ターン後に孵化して攻撃力3）。']],
    ['容疑', SPELL([fx({ id: 'suspect' })]), 5, ['相手モンスター1体に容疑をかける（攻撃力+1・挑発を失う・反撃しない）。']],
    ['容疑（このモンスター）', MON(1, 1, { effects: [fx({ id: 'suspect', timing: 'summon', target: 'thisMonster' })] }), 5, ['召喚時、このモンスターに容疑をかける（攻撃力+1・挑発を失う・反撃しない）。']],
    ['守護（加護）', SPELL([fx({ id: 'guard', option: 'protection' })]), 7, ['次の持ち主のターン開始まで、自分のモンスター1体に加護を与える。']],
    ['守護（加護）', SPELL([fx({ id: 'guard', option: 'protection' })]), 7, ['次の持ち主のターン開始まで、自分のモンスター1体に加護を与える。']],
    ['賛助1', MON(1, 1, { effects: [fx({ id: 'backup', value: 1, timing: 'summon' })] }), 7, ['召喚時、自分の他のモンスター1体の攻撃力と体力を+1し、このターンこのモンスターのキーワードを与える。']],
    ['消術2', SPELL([fx({ id: 'fateseal', value: 2, target: 'enemyPlayer' })]), 3, ['相手の山札の上2枚を見て、好きな枚数を山札の下に置く。']],
    ['永久強化1', SPELL([fx({ id: 'perpetual', value: 1, target: 'self' })]), 4, ['手札のモンスターカード1枚の攻撃力と体力を、この試合のあいだ+1する。']],
    // 1枚につき 6（決定事項 #150。以前は 1.2）
    ['山札消滅2', SPELL([fx({ id: 'exileMill', value: 2, target: 'enemyPlayer' })]), 12, ['相手の山札の上2枚を除外する。']],
    ['トークン生成「落とし子」', SPELL([fx({ id: 'token', value: 1, hits: 1, option: 'spawn', target: 'self' })]), 7, ['攻撃力1・体力1の小鬼（落とし子：破壊されるとエナジー+1）を1体出す。']],
    ['倍化「3倍」（12＋20）', SPELL([fx({ id: 'double', option: 'poison3', target: 'self' })]), 32, ['相手の毒を3倍にする（増えるのは最大10）。']],
    [
      '蓄積「プラン」（×max(1, 4×0.35)）',
      SPELL([fx({ id: 'damage', value: 1, timing: 'charged', target: 'enemyAll' })], { abilities: [AB('charge', 3, { option: 'cardPlayed', once: true })] }),
      15,
      ['蓄積がたまったとき、相手全体に1ダメージを与える。'],
    ],
  ];
  it.each(table)('%s', (_label, c, sum, text) => {
    expect(analyzeCard(c).violations).toEqual([]);
    const pts = analyzeCard(c)
      .points.lines.filter((l) => l.kind !== 'stat' && l.kind !== 'keyword' && l.kind !== 'cost')
      .reduce((s, l) => s + l.value, 0);
    expect(pts).toBe(sum);
    expect(describeCard(c).effects).toEqual(text);
  });

  it('キーワード2・デメリット2・能力2のポイントとテキスト', () => {
    const kw = (id: string) => analyzeCard(MON(1, 1, { keywords: [{ id }] }));
    expect(kw('reach').points.lines.find((l) => l.kind === 'keyword')).toMatchObject({ label: '対空', value: 2 });
    expect(kw('skulk').text.keywords).toEqual([{ name: '潜伏', text: '挑発がすべてこのモンスターより攻撃力が高ければ、挑発を無視して攻撃できる' }]);
    const drawback = (c: CardDef) => c.drawbacks.length && analyzeCard(c).points.lines.find((l) => l.kind === 'drawback');
    expect(drawback(MON(3, 3, { drawbacks: [{ id: 'cumulativeUpkeep', value: 2, timing: null }] }))).toMatchObject({ value: -8 });
    // 休眠：モンスターは max(2, 攻撃力×1.5)、パワーはパワーの効果のポイント×0.4
    expect(drawback(MON(1, 3, { drawbacks: [{ id: 'dormant', timing: null }] }))).toMatchObject({ value: -2 });
    expect(drawback(MON(4, 3, { drawbacks: [{ id: 'dormant', timing: null }] }))).toMatchObject({ value: -6 });
    expect(drawback(SPELL([fx({ id: 'damage', value: 2, timing: 'turnStart', target: 'enemyPlayer' })], { drawbacks: [{ id: 'dormant', timing: null }] }))).toMatchObject({ value: -14 });
    expect(describeCard(MON(1, 1, { drawbacks: [{ id: 'cumulativeUpkeep', value: 1, timing: null }] })).drawbacks).toEqual([
      '累加維持費1（自分のターン開始時、場にあるターン数×1のダメージを受ける）。',
    ]);
    expect(getAbility('trap')?.name).toBe('罠');
    expect(getAbility('charge')?.onceOption?.label).toContain('プラン');
  });

  it('倍率：タイミング（モンスター1.5・パワー4.0・罠1.2・捨てられたとき0.6・雄姿1.0）・条件・対象', () => {
    expect(timingMultiplier('enemyAttacked', 'monster')).toBe(1.5);
    expect(timingMultiplier('enemyAttacked', 'spell')).toBe(4);
    expect(timingMultiplier('enemyAttacked', 'spell', undefined, { abilities: [AB('trap')] })).toBe(1.2);
    expect(timingMultiplier('allyDestroyed', 'spell', undefined, { abilities: [AB('trap')] })).toBe(1.2);
    expect(timingMultiplier('turnStart', 'spell', undefined, { abilities: [AB('trap')] })).toBe(6);
    expect([timingMultiplier('discarded', 'spell'), timingMultiplier('valiant', 'monster')]).toEqual([0.6, 1]);
    expect(['converge', 'descend', 'rested'].map((c) => CONDITIONS[c as 'converge'].group)).toEqual(['このターン', '捨て札', 'このモンスター']);
    expect(TIMING_GROUPS).toContain('相手の行動');
    expect(TIMINGS.enemyAttacked.group).toBe('相手の行動');
    expect(timingsFor('spell')).toEqual(expect.arrayContaining(['enemyAttacked', 'discarded']));
    expect(timingsFor('spell')).not.toContain('valiant');
    // 長久はモンスターのカードだけ、召喚時・攻撃するたびでは選べない
    expect(conditionsFor('turnEnd', 'monster')).toContain('rested');
    expect(conditionsFor('turnEnd', 'spell')).not.toContain('rested');
    expect(conditionsFor('summon', 'monster')).not.toContain('rested');
    // 攻撃してきたモンスターは「相手のモンスターが攻撃するたび」だけ
    expect(targetsForEffect(getEffect('damage')!, 'enemyAttacked', 'spell')).toEqual(['enemyPlayer', 'attacker', 'random', 'enemyMonsters', 'enemyAll', 'everyone']);
    expect(targetsForEffect(getEffect('damage')!, 'play', 'spell')).not.toContain('attacker');
    expect(targetsForEffect(getEffect('execute')!, 'enemyAttacked', 'spell')).toContain('attacker');
    // ばらつきは量の効果だけ
    expect(modifiersFor(getEffect('draw')!, 'play').map((m) => m.id)).not.toContain('gamble');
    expect(modifiersFor(getEffect('draw')!, 'play').map((m) => m.id)).toContain('perExp');
  });
});

// ---------------------------------------------------------------- 検証
describe('検証（△ バッチA）', () => {
  const table: [string, CardDef, string[]][] = [
    ['攻撃してきたモンスターは使用時に選べない', SPELL([fx({ id: 'damage', value: 5, target: 'attacker' })]), ['EFFECT_TARGET']],
    ['長久はモンスターのカードだけ', SPELL([fx({ ...DRAW1, timing: 'turnEnd', condition: 'rested' })], { cost: 5 }), ['EFFECT_CONDITION']],
    ['ばらつきは枚数に付けられない', SPELL([fx({ ...DRAW1, mods: ['gamble'] })]), ['EFFECT_MODS_SCALE']],
    ['萎縮はダメージ系だけ', SPELL([fx({ id: 'heal', value: 1, target: 'self', mods: ['witherDmg'] })]), ['EFFECT_MODS']],
    ['倍化の3倍はレジェンドだけ', SPELL([fx({ id: 'double', option: 'bleed3', target: 'self' })], { rarity: 'epic', cost: 4 }), ['OPTION_RARITY']],
    ['捨てられたときの効果はコスト0の上限まで', SPELL([fx({ id: 'damage', value: 10, timing: 'discarded', target: 'enemyPlayer' })], { rarity: 'common', cost: 5 }), ['DISCARDED_OVER_CAP']],
    ['罠にターン開始時の効果', SPELL([fx({ ...DRAW1, timing: 'turnStart' })], { abilities: [AB('trap')] }), ['TRAP_TIMING']],
    ['罠にパワーの効果が無い', SPELL([DRAW1], { abilities: [AB('trap')] }), ['ABILITY_CARD_TYPE', 'TRAP_TIMING']],
    ['1回きりは蓄積だけ', SPELL([fx({ ...DRAW1, timing: 'enemyAttacked' })], { abilities: [AB('trap', undefined, { once: true })] }), ['ABILITY_ONCE']],
    ['賛助はモンスターの召喚時だけ', SPELL([fx({ id: 'backup', value: 1 })]), ['EFFECT_BASE', 'EFFECT_TIMING']],
    ['累加維持費はモンスターとパワーだけ', SPELL([DRAW1], { drawbacks: [{ id: 'cumulativeUpkeep', value: 1, timing: null }] }), ['DRAWBACK_CARD_TYPE', 'CURSE_TOO_WEAK']],
    ['休眠のタイミングは選べない', MON(1, 1, { drawbacks: [{ id: 'dormant', timing: 'turnStart' }] }), ['DRAWBACK_TIMING', 'CURSE_TOO_WEAK']],
  ];
  it.each(table)('%s', (_label, c, expected) => {
    expect(vio(c)).toEqual(expected);
  });

  it('取り込み：能力の once は真偽値だけ（false は省く）', () => {
    const raw = (once: unknown) => JSON.parse(JSON.stringify({ ...SPELL([fx({ id: 'damage', value: 1, timing: 'charged', target: 'enemyAll' })]), abilities: [{ id: 'charge', value: 3, once }] }));
    const ok = parseCard(raw(true));
    expect(ok.ok && ok.value.abilities).toEqual([{ id: 'charge', value: 3, once: true }]);
    const off = parseCard(raw(false));
    expect(off.ok && off.value.abilities).toEqual([{ id: 'charge', value: 3 }]);
    expect(parseCard(raw('yes')).ok).toBe(false);
  });
});

// ---------------------------------------------------------------- 対戦：条件・タイミング・対象
describe('条件・タイミング・対象（対戦）', () => {
  it('収斂：このターン3種類以上（モンスター・スキル＋このアタック）。2種類なら発動しない。コストの計算ではこれから使う1枚も数える', () => {
    let g = rich(startGame());
    const hp = g.players[1].hp;
    const conv = SPELL([fx({ ...DMG5, target: 'enemyPlayer', condition: 'converge' })]);
    g = play(g, giveCard(g, 0, SPELL([DRAW1], { cost: 0 })));
    g = play(g, giveCard(g, 0, conv));
    expect(g.players[1].hp).toBe(hp);
    g = play(g, giveCard(g, 0, MON(1, 1, { cost: 0 })));
    expect(g.players[0].turn.typesPlayed).toEqual(['skill', 'attack', 'monster']);
    g = play(g, giveCard(g, 0, conv));
    expect(g.players[1].hp).toBe(hp - 5);
    // 条件付き軽減：スキル・モンスターを使ったあと、アタックを使えば3種類
    let h = rich(startGame());
    h = play(h, giveCard(h, 0, SPELL([DRAW1], { cost: 0 })));
    h = play(h, giveCard(h, 0, MON(1, 1, { cost: 0 })));
    const cut = giveCard(h, 0, SPELL([fx({ ...DMG5, target: 'enemyPlayer' })], { abilities: [AB('costCut', 1, { condition: 'converge' })] }));
    expect(battle.effectiveCost(h, 0, h.players[0].hand.find((c) => c.uid === cut)!)).toBe(1);
  });

  it('落魄：捨て札のモンスターとパワーのカードが4枚以上', () => {
    const g = rich(startGame());
    const hp = g.players[1].hp;
    const mon = MON(1, 1);
    const pow = SPELL([fx({ ...DRAW1, timing: 'turnStart' })]);
    g.cards['p0:dm'] = { ...mon, id: 'dm' };
    g.cards['p0:dp'] = { ...pow, id: 'dp' };
    g.players[0].discard = [
      { uid: 'd1', cardId: 'p0:dm', owner: 0 },
      { uid: 'd2', cardId: 'p0:dm', owner: 0 },
      { uid: 'd3', cardId: 'p0:dp', owner: 0 },
      { uid: 'd4', cardId: 'filler', owner: 0 },
    ];
    const desc = SPELL([fx({ ...DMG5, target: 'enemyPlayer', condition: 'descend' })]);
    let h = play(g, giveCard(g, 0, desc));
    expect(h.players[1].hp).toBe(hp);
    h.players[0].discard.push({ uid: 'd5', cardId: 'p0:dp', owner: 0 });
    h = play(h, giveCard(h, 0, desc));
    expect(h.players[1].hp).toBe(hp - 5);
  });

  it('長久：攻撃しなかったターンの終わりだけ育つ', () => {
    let g = rich(startGame());
    const uid = putMonster(g, 0, MON(2, 2, { effects: [fx({ id: 'train', value: 1, timing: 'turnEnd', target: 'thisMonster', condition: 'rested' })] }));
    g = endTurn(g);
    expect(monster(g, uid)).toMatchObject({ attack: 3, hp: 3 });
    g = endTurn(g);
    g = attack(g, uid, P(1));
    g = endTurn(g);
    expect(monster(g, uid)).toMatchObject({ attack: 3, hp: 3 });
  });

  it('相手のモンスターが攻撃するたび（罠のパワー）：攻撃のあと、攻撃してきたモンスターに。1回で消える。自分のモンスターの攻撃では出ない', () => {
    let g = rich(startGame());
    const trap = SPELL([fx({ id: 'damage', value: 2, timing: 'enemyAttacked', target: 'attacker' })], { name: '落とし穴', abilities: [AB('trap')] });
    g = endTurn(g);
    g = rich(g, 1);
    g = play(g, giveCard(g, 1, trap));
    expect(g.players[1].powers.map((p) => p.name)).toEqual(['落とし穴']);
    const own = putMonster(g, 1, MON(1, 5));
    g = attack(g, own, P(0));
    expect(g.players[1].powers.length).toBe(1);
    g = endTurn(g);
    const a = putMonster(g, 0, MON(1, 5));
    const hp = g.players[1].hp;
    g = attack(g, a, P(1));
    expect(g.players[1].hp).toBe(hp - 1);
    expect(monster(g, a)?.hp).toBe(3);
    expect(g.players[1].powers).toEqual([]);
    expect(logText(g)).toContain('罠『落とし穴』が発動して消えた');
    // もう一度攻撃しても何も起きない
    const b = putMonster(g, 0, MON(1, 5));
    g = attack(g, b, P(1));
    expect(monster(g, b)?.hp).toBe(5);
  });

  it('攻撃してきたモンスターが反撃で倒れていたら不発。罠でないパワー・モンスターは1ターン2回まで', () => {
    let g = rich(startGame());
    g = endTurn(g);
    g = rich(g, 1);
    g = play(g, giveCard(g, 1, SPELL([fx({ id: 'damage', value: 1, timing: 'enemyAttacked', target: 'attacker' })], { cost: 5 })));
    putMonster(g, 1, MON(5, 9));
    g = endTurn(g);
    const weak = putMonster(g, 0, MON(1, 1));
    const wall = g.players[1].board[0]!.uid;
    g = attack(g, weak, M(wall));
    expect(monster(g, weak)).toBeUndefined();
    expect(logText(g)).toContain('対象がいないため何も起きない');
    for (let i = 0; i < 3; i++) g = attack(g, putMonster(g, 0, MON(1, 9)), P(1));
    expect(logText(g)).toContain('このターンもう発動しない（1ターン2回まで）');
  });

  it('捨てられたとき：手札整理・サイクリングで出る。ターン終了時の手札の捨てでは出ない', () => {
    const madness = SPELL([fx({ id: 'damage', value: 3, timing: 'discarded', target: 'enemyPlayer' })], { name: '狂気', abilities: [AB('cycling')] });
    let g = rich(startGame());
    g.players[0].hand = [];
    const hp = g.players[1].hp;
    const uid = giveCard(g, 0, madness);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'loot', value: 1, target: 'self' })], { cost: 0 })));
    if (g.pending) g = act(g, { type: 'choose', player: 0, picks: [uid] });
    expect(g.players[1].hp).toBe(hp - 3);
    expect(g.players[0].discard.find((c) => c.uid === uid)?.discardedTurn).toBe(g.turnIndex);
    const c2 = giveCard(g, 0, madness);
    g = act(g, { type: 'handAbility', player: 0, cardUid: c2, ability: 'cycling', chosen: {} });
    expect(g.players[1].hp).toBe(hp - 6);
    giveCard(g, 0, madness);
    g = endTurn(g);
    expect(g.players[1].hp).toBe(hp - 6);
  });

  it('雄姿：各ターン最初に自分のカードの対象になったときだけ', () => {
    let g = rich(startGame());
    const uid = putMonster(g, 0, MON(1, 1, { effects: [fx({ id: 'train', value: 1, timing: 'valiant', target: 'thisMonster' })] }));
    const pump = SPELL([fx({ id: 'pump', value: 1, target: 'chosen' })], { cost: 0 });
    g = play(g, giveCard(g, 0, pump), { chosen: { ally: uid } });
    g = play(g, giveCard(g, 0, pump), { chosen: { ally: uid } });
    expect(monster(g, uid)).toMatchObject({ attack: 2, hp: 2 });
    g = nextOwnTurn(g);
    g = play(g, giveCard(g, 0, pump), { chosen: { ally: uid } });
    expect(monster(g, uid)).toMatchObject({ attack: 3, hp: 3 });
  });

  it('オンライン：行動の「攻撃してきたモンスター」は受付で捨てる', () => {
    const a = parseAction({ type: 'playCard', player: 0, cardUid: 'c1', chosen: { enemy: { kind: 'player', player: 1 }, trigger: 'm9' } });
    expect(a).toEqual({ type: 'playCard', player: 0, cardUid: 'c1', chosen: { enemy: { kind: 'player', player: 1 } } });
  });

  it('攻撃してきたモンスターは行動では選べない', () => {
    const g = rich(startGame());
    const uid = giveCard(g, 0, SPELL([DMG5]));
    putMonster(g, 1, MON(1, 1));
    expect(actError(g, { type: 'playCard', player: 0, cardUid: uid, chosen: { enemy: P(1), trigger: g.players[1].board[0]!.uid } })).toBe('その対象は選べません');
  });
});

// ---------------------------------------------------------------- 対戦：修飾・キーワード・デメリット
describe('修飾・キーワード・デメリット（対戦）', () => {
  it('萎縮：減った体力のぶん最大体力も減り、修理で戻らない', () => {
    let g = rich(startGame());
    const t = putMonster(g, 1, MON(1, 10));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'damage', value: 3, mods: ['witherDmg'] })])), { chosen: { enemy: M(t) } });
    expect(monster(g, t)).toMatchObject({ hp: 7, maxHp: 7 });
    g = endTurn(g);
    g = rich(g, 1);
    g = play(g, giveCard(g, 1, SPELL([fx({ id: 'repair', value: 5, target: 'chosen' })])), { chosen: { ally: t } });
    expect(monster(g, t)).toMatchObject({ hp: 7, maxHp: 7 });
  });

  it('経験1につき：経験0なら不発、上限5', () => {
    let g = rich(startGame());
    const hp = g.players[1].hp;
    const card = SPELL([fx({ id: 'damage', value: 2, target: 'enemyPlayer', mods: ['perExp'] })]);
    g = play(g, giveCard(g, 0, card));
    expect(g.players[1].hp).toBe(hp);
    expect(logText(g)).toContain('経験0：数値が0のため不発');
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'gainExp', value: 2, target: 'self' })], { cost: 0 })));
    g.players[0].exp = 9;
    g = play(g, giveCard(g, 0, card));
    expect(g.players[1].hp).toBe(hp - 10);
    // 経験の上限
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'gainExp', value: 2, target: 'self' })], { cost: 0 })));
    expect(g.players[0].exp).toBe(10);
  });

  it('ばらつき：同じシードなら同じ値、値は 半分・そのまま・1.5倍 のどれか', () => {
    const run = (seed: number) => {
      let g = rich(startGame({ seed }));
      const hp = g.players[1].hp;
      g = play(g, giveCard(g, 0, SPELL([fx({ id: 'damage', value: 4, target: 'enemyPlayer', mods: ['gamble'] })])));
      return hp - g.players[1].hp;
    };
    const seen = new Set<number>();
    for (let s = 1; s <= 20; s++) {
      expect(run(s)).toBe(run(s));
      seen.add(run(s));
    }
    expect([...seen].every((v) => [2, 4, 6].includes(v))).toBe(true);
    expect(seen.size).toBeGreaterThan(1);
  });

  it('対空：飛行のモンスターは対空しか攻撃できない。飛行でなければ関係ない', () => {
    const g = rich(startGame());
    const flyer = putMonster(g, 0, MON(2, 2, { keywords: [{ id: 'flying' }] }));
    const walker = putMonster(g, 0, MON(2, 2));
    const reach = putMonster(g, 1, MON(1, 3, { keywords: [{ id: 'reach' }] }));
    putMonster(g, 1, MON(1, 3));
    expect(battle.attackTargets(g, monster(g, flyer)!)).toEqual([M(reach)]);
    expect(battle.attackTargets(g, monster(g, walker)!).length).toBe(3);
  });

  it('潜伏：挑発がすべて自分より攻撃力が高ければ無視できる', () => {
    const g = rich(startGame());
    const sk = putMonster(g, 0, MON(2, 2, { keywords: [{ id: 'skulk' }] }));
    const big = putMonster(g, 1, MON(3, 3, { keywords: [{ id: 'taunt' }] }));
    expect(battle.attackTargets(g, monster(g, sk)!)).toEqual([P(1), M(big)]);
    const same = putMonster(g, 1, MON(2, 3, { keywords: [{ id: 'taunt' }] }));
    expect(battle.attackTargets(g, monster(g, sk)!)).toEqual([M(big), M(same)]);
  });

  it('累加維持費：持ち主のターン開始時に 場にあるターン数×N（増えていく）', () => {
    let g = rich(startGame());
    putMonster(g, 0, MON(3, 3, { drawbacks: [{ id: 'cumulativeUpkeep', value: 2, timing: null }] }));
    const hp = g.players[0].hp;
    g = nextOwnTurn(g);
    expect(g.players[0].hp).toBe(hp - 2);
    g = nextOwnTurn(g);
    expect(g.players[0].hp).toBe(hp - 2 - 4);
    expect(g.players[0].board[0]!.counters.age).toBe(2);
  });

  it('累加維持費（パワー）', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, SPELL([fx({ ...DRAW1, timing: 'turnStart' })], { cost: 3, drawbacks: [{ id: 'cumulativeUpkeep', value: 1, timing: null }] })));
    const hp = g.players[0].hp;
    g = nextOwnTurn(g);
    g = nextOwnTurn(g);
    expect(g.players[0].hp).toBe(hp - 1 - 2);
    expect(g.players[0].powers[0]!.age).toBe(2);
  });

  it('休眠：出た次の自分のターン（とその次の相手のターン）は攻撃できず効果も出ない', () => {
    let g = rich(startGame());
    const sleeper = MON(3, 5, { cost: 1, effects: [fx({ id: 'damage', value: 1, timing: 'turnStart', target: 'enemyPlayer' })], drawbacks: [{ id: 'dormant', timing: null }] });
    const uid = giveCard(g, 0, sleeper);
    g = play(g, uid);
    const hp = g.players[1].hp;
    g = nextOwnTurn(g);
    expect(g.players[1].hp).toBe(hp);
    expect(battle.attackBlockReason(g, monster(g, uid)!)).toBe('休眠中：このターンは攻撃できない');
    g = nextOwnTurn(g);
    expect(g.players[1].hp).toBe(hp - 1);
    expect(battle.attackBlockReason(g, monster(g, uid)!)).toBeNull();
  });
});

// ---------------------------------------------------------------- 対戦：効果と選択肢
describe('効果・選択肢（対戦）', () => {
  it('消滅の印：破壊されたら除外。バウンスで消える', () => {
    let g = rich(startGame());
    const t = putMonster(g, 1, MON(1, 3));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'finality' })])), { chosen: { enemy: M(t) } });
    expect(monster(g, t)?.finality).toBe(true);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'damage', value: 5 })])), { chosen: { enemy: M(t) } });
    expect(g.players[1].exile.some((c) => c.uid === t)).toBe(true);
    expect(g.players[1].discard.some((c) => c.uid === t)).toBe(false);
    const u = putMonster(g, 1, MON(1, 3));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'finality' })])), { chosen: { enemy: M(u) } });
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'bounce', value: 5 })])), { chosen: { enemy: M(u) } });
    expect(g.players[1].hand.some((c) => c.uid === u)).toBe(true);
  });

  it('放射能：ターン開始時に山札の上を捨て札へ、モンスター以外1枚ごとにダメージ、その分減る', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'rad', value: 3, target: 'self' })])));
    expect(g.players[1].status.rad).toBe(3);
    // P1 の山札の上：モンスター1枚・呪文2枚（後攻の1ターン目は引かない）
    const f = FILL();
    g.players[1].deck = [];
    stack(g, 1, [MON(1, 1), f, f, f, f]);
    const hp = g.players[1].hp;
    g = endTurn(g);
    expect(g.players[1].hp).toBe(hp - 2);
    expect(g.players[1].status.rad).toBe(1);
    expect(logText(g)).toContain('放射能3');
  });

  it('氷結：相手の次のターンだけ、手札 N 枚が使えない（ノイズ以外。#146 で1ターンに1枚まで）', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'iceLock', value: 1, target: 'enemyPlayer' })])));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'iceLock', value: 1, target: 'enemyPlayer' })])));
    expect(g.players[1].ice).toBe(1);
    g = endTurn(g);
    const iced = g.players[1].hand.filter((c) => c.iced === g.turnIndex);
    expect(iced.length).toBe(1);
    expect(g.players[1].ice).toBe(0);
    g = rich(g, 1);
    expect(actError(g, { type: 'playCard', player: 1, cardUid: iced[0]!.uid, chosen: {} })).toBe('氷結：このターンは使えない');
    expect(battle.playInfo(g, 1, iced[0]!).blocked).toBe('氷結：このターンは使えない');
    // 相手からは凍った手札が見えない
    const v = battle.viewFor(g, 0);
    expect(v.players[1].hand.every((c) => c.iced === undefined)).toBe(true);
    expect(v.log.some((l) => l.text.startsWith('凍ったカード：'))).toBe(false);
  });

  it('章を進める：英雄譚を次の章へ。最後まで進めると終わる', () => {
    let g = rich(startGame());
    const saga = SPELL([fx({ ...DRAW1, timing: 'chapter1' }), fx({ id: 'damage', value: 2, timing: 'chapter2', target: 'enemyPlayer' }), fx({ id: 'damage', value: 3, timing: 'chapter3', target: 'enemyPlayer' })], { name: '物語' });
    g = play(g, giveCard(g, 0, saga));
    const hp = g.players[1].hp;
    const adv = SPELL([fx({ id: 'advanceSaga', target: 'self' })], { cost: 0 });
    g = play(g, giveCard(g, 0, adv));
    expect(g.players[1].hp).toBe(hp - 2);
    expect(g.players[0].powers[0]!.chapter).toBe(2);
    g = play(g, giveCard(g, 0, adv));
    expect(g.players[1].hp).toBe(hp - 5);
    expect(g.players[0].powers).toEqual([]);
    const last = giveCard(g, 0, adv);
    const info = battle.playInfo(g, 0, g.players[0].hand.find((c) => c.uid === last)!);
    expect(info.warnings).toContain('進められる英雄譚がありません');
  });

  it('培養：卵は攻撃できず、2回目の自分のターン開始時に孵化して攻撃力+N', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'incubate', value: 3, target: 'self' })])));
    const egg = g.players[0].board[0]!;
    expect(egg).toMatchObject({ attack: 0, hp: 3 });
    expect(g.cards[egg.card.cardId]?.name).toBe('卵');
    g = nextOwnTurn(g);
    expect(battle.attackBlockReason(g, monster(g, egg.uid)!)).toBe('卵はまだ攻撃できない（孵化を待つ）');
    g = nextOwnTurn(g);
    const hatched = monster(g, egg.uid)!;
    expect(hatched).toMatchObject({ attack: 3, hp: 3 });
    expect(hatched.card.cardId).toBe(battle.TOKEN_CARD_ID);
    expect(battle.attackBlockReason(g, hatched)).toBeNull();
  });

  it('容疑：挑発を失い、攻撃力+1、反撃しない。容疑のモンスターが攻撃しても反撃を受けない', () => {
    let g = rich(startGame());
    const taunt = putMonster(g, 1, MON(3, 9, { keywords: [{ id: 'taunt' }] }));
    const a = putMonster(g, 0, MON(2, 5));
    expect(battle.attackTargets(g, monster(g, a)!)).toEqual([M(taunt)]);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'suspect' })])), { chosen: { enemy: M(taunt) } });
    expect(battle.attackTargets(g, monster(g, a)!).length).toBe(2);
    expect(battle.effectiveAttack(g, monster(g, taunt)!)).toBe(4);
    g = attack(g, a, M(taunt));
    expect(monster(g, a)?.hp).toBe(5);
    const me = putMonster(g, 0, MON(2, 5));
    g = play(g, giveCard(g, 0, MON(1, 1, { cost: 0, effects: [] })));
    g.players[0].board.find((m) => m.uid === me)!.suspected = true;
    g = attack(g, me, M(taunt));
    expect(monster(g, me)?.hp).toBe(5);
  });

  it('守護（不壊）：体力1で踏みとどまり、破壊の効果も効かない。生け贄は効く。次のターン開始時に消える', () => {
    let g = rich(startGame());
    const uid = putMonster(g, 0, MON(1, 3));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'guard', option: 'indestructible' })])), { chosen: { ally: uid } });
    g = endTurn(g);
    g = rich(g, 1);
    g = play(g, giveCard(g, 1, SPELL([fx({ id: 'damage', value: 9 })])), { chosen: { enemy: M(uid) } });
    expect(monster(g, uid)?.hp).toBe(1);
    g = play(g, giveCard(g, 1, SPELL([fx({ id: 'execute', value: 5 })])), { chosen: { enemy: M(uid) } });
    expect(monster(g, uid)).toBeDefined();
    expect(logText(g)).toContain('不壊なので破壊されない');
    g = endTurn(g);
    expect(monster(g, uid)?.guard).toBeUndefined();
    // 生け贄は不壊でも止まらない
    const v = putMonster(g, 0, MON(1, 3), { guard: { kind: 'indestructible', until: 99 } });
    g = play(g, giveCard(g, 0, MON(1, 1, { cost: 0, drawbacks: [{ id: 'sacrifice', timing: 'summon' }] })));
    if (g.pending) g = act(g, { type: 'choose', player: 0, picks: [v] });
    expect(monster(g, v)).toBeUndefined();
  });

  it('守護（加護）：ダメージを受けず、相手のカードに選ばれない（ランダムは当たる）', () => {
    let g = rich(startGame());
    const uid = putMonster(g, 0, MON(1, 3));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'guard', option: 'protection' })])), { chosen: { ally: uid } });
    g = endTurn(g);
    g = rich(g, 1);
    const shot = giveCard(g, 1, SPELL([fx({ id: 'damage', value: 9 })]));
    expect(battle.playInfo(g, 1, g.players[1].hand.find((c) => c.uid === shot)!).enemyTargets).toEqual([P(0)]);
    g = play(g, giveCard(g, 1, SPELL([fx({ id: 'damage', value: 9, target: 'enemyMonsters' })])));
    expect(monster(g, uid)?.hp).toBe(3);
  });

  it('賛助：自分の他のモンスターを+N、このターンだけキーワード。自分自身は選べない', () => {
    let g = rich(startGame());
    const ally = putMonster(g, 0, MON(1, 1));
    const b = giveCard(g, 0, MON(2, 2, { keywords: [{ id: 'flying' }, { id: 'bushido', value: 1 }], effects: [fx({ id: 'backup', value: 1, timing: 'summon' })] }));
    const info = battle.playInfo(g, 0, g.players[0].hand.find((c) => c.uid === b)!);
    expect(info.allyTargets).toEqual([ally]);
    g = play(g, b, { chosen: { ally } });
    expect(monster(g, ally)).toMatchObject({ attack: 2, hp: 2, tempGranted: ['flying'] });
    expect(battle.keywordFlags(g, monster(g, ally)!).flying).toBe(true);
    g = endTurn(g);
    expect(monster(g, ally)?.tempGranted).toBeUndefined();
  });

  it('消術：相手の山札の上を見て下へ（選ぶのは使った人だけ）', () => {
    let g = rich(startGame());
    const top = stack(g, 1, [MON(9, 9, { name: '切り札' }), FILL()]);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'fateseal', value: 2, target: 'enemyPlayer' })])));
    expect(g.pending?.options.map((o) => o.id)).toEqual(top);
    const opp = battle.viewFor(g, 1);
    expect(opp.pending?.options).toEqual([]);
    g = act(g, { type: 'choose', player: 0, picks: [top[0]!] });
    expect(g.players[1].deck[0]!.uid).toBe(top[1]);
    expect(g.players[1].deck.at(-1)!.uid).toBe(top[0]);
  });

  it('永久強化：手札のモンスターに残り、場に出たとき・捨て札から戻ったときも+N。相手には見えない', () => {
    let g = rich(startGame());
    g.players[0].hand = [];
    const mon = giveCard(g, 0, MON(2, 2, { cost: 1 }));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'perpetual', value: 2, target: 'self' })])));
    expect(g.players[0].hand.find((c) => c.uid === mon)?.perm).toEqual({ attack: 2, hp: 2 });
    expect(battle.viewFor(g, 1).log.some((l) => l.text.startsWith('永久強化したカード'))).toBe(false);
    expect(battle.viewFor(g, 1).players[0].hand.every((c) => c.perm === undefined)).toBe(true);
    g = play(g, mon);
    expect(monster(g, mon)).toMatchObject({ attack: 4, hp: 4 });
  });

  it('山札消滅：相手の山札の上 N 枚を除外', () => {
    let g = rich(startGame());
    const top = g.players[1].deck.slice(0, 2).map((c) => c.uid);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'exileMill', value: 2, target: 'enemyPlayer' })])));
    expect(g.players[1].exile.map((c) => c.uid)).toEqual(top);
  });

  it('落とし子：破壊されたら持ち主のエナジー+1（相手のターンなら次のターン）', () => {
    let g = rich(startGame(), 0, 5);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'token', value: 1, hits: 2, option: 'spawn', target: 'self' })], { cost: 1 })));
    expect(g.players[0].energy).toBe(4);
    // 自分のターンに2体とも破壊：このターンのエナジー+2（1ターンの増加の上限の中）
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'damage', value: 1, target: 'everyone' })], { cost: 1 })));
    expect(g.players[0].board).toEqual([]);
    expect(g.players[0].energy).toBe(5);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'token', value: 1, hits: 1, option: 'spawn', target: 'self' })], { cost: 1 })));
    const t = g.players[0].board[0]!.uid;
    g = endTurn(g);
    g = rich(g, 1);
    g = play(g, giveCard(g, 1, SPELL([fx({ id: 'damage', value: 1 })])), { chosen: { enemy: M(t) } });
    expect(g.players[0].next.energy).toBe(1);
  });

  it('倍化の3倍：毒3 → 9（増えるのは毒の上限まで）', () => {
    let g = rich(startGame());
    g.players[1].status.poison = 3;
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'double', option: 'poison3', target: 'self' })])));
    expect(g.players[1].status.poison).toBe(9);
    g.players[1].status.poison = 8;
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'double', option: 'poison3', target: 'self' })])));
    expect(g.players[1].status.poison).toBe(18);
  });

  it('プラン：蓄積がたまったら効果を出して消える', () => {
    let g = rich(startGame());
    const plan = SPELL([fx({ id: 'damage', value: 1, timing: 'charged', target: 'enemyPlayer' })], { name: '陰謀', abilities: [AB('charge', 2, { option: 'cardPlayed', once: true })] });
    g = play(g, giveCard(g, 0, plan));
    const hp = g.players[1].hp;
    g = play(g, giveCard(g, 0, SPELL([DRAW1], { cost: 0 })));
    g = play(g, giveCard(g, 0, SPELL([DRAW1], { cost: 0 })));
    expect(g.players[1].hp).toBe(hp - 1);
    expect(g.players[0].powers).toEqual([]);
    expect(logText(g)).toContain('プラン『陰謀』が果たされて消えた');
  });
});

// ---------------------------------------------------------------- CPU：新要素のデッキで最後まで
describe('CPU（△ バッチA）', () => {
  const m = (id: string, name: string, a: number, h: number, extra: Partial<CardDef> = {}) =>
    card({ id, name, rarity: 'common', cost: 2, stats: { attack: a, hp: h, defense: 0 }, ...extra });
  const s = (id: string, name: string, effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id, name, rarity: 'common', cost: 2, effects, ...extra });
  const cards: CardDef[] = [
    s('trap', '落とし穴', [fx({ id: 'damage', value: 4, timing: 'enemyAttacked', target: 'attacker' })], { rarity: 'rare', cost: 1, abilities: [AB('trap')] }),
    m('sentry', '見張り', 1, 3, { effects: [fx({ id: 'damage', value: 1, timing: 'enemyAttacked', target: 'attacker' })] }),
    s('mad', '狂気の詩', [fx({ id: 'damage', value: 3, timing: 'discarded', target: 'enemyPlayer' }), fx({ id: 'damage', value: 2 })], { rarity: 'rare', abilities: [AB('cycling')] }),
    s('loot', '物色', [fx({ id: 'loot', value: 2, target: 'self' })], { cost: 1 }),
    m('valiant', '勇者', 2, 2, { effects: [fx({ id: 'train', value: 1, timing: 'valiant', target: 'thisMonster' })] }),
    m('elder', '長老', 1, 3, { effects: [fx({ id: 'train', value: 1, timing: 'turnEnd', target: 'thisMonster', condition: 'rested' })] }),
    s('wither', '萎れの矢', [fx({ id: 'damage', value: 3, mods: ['witherDmg'] })], { cost: 1 }),
    s('exp', '修練', [fx({ id: 'gainExp', value: 1, target: 'self' }), fx({ id: 'damage', value: 1, mods: ['perExp'] })], { cost: 1 }),
    s('dice', '運試し', [fx({ id: 'damage', value: 4, mods: ['gamble'] })], { cost: 1 }),
    m('archer', '弓兵', 1, 3, { keywords: [{ id: 'reach' }, { id: 'skulk' }] }),
    m('old', '古木', 4, 5, { rarity: 'rare', cost: 2, drawbacks: [{ id: 'cumulativeUpkeep', value: 1, timing: null }, { id: 'dormant', timing: null }] }),
    s('mark', '刻印', [fx({ id: 'finality' }), fx({ id: 'damage', value: 2 })], { cost: 1 }),
    s('rad', '汚染弾', [fx({ id: 'rad', value: 2, target: 'self' }), fx({ id: 'iceLock', value: 1, target: 'enemyPlayer' })], { rarity: 'rare' }),
    s('egg', '孵卵', [fx({ id: 'incubate', value: 2, target: 'self' })], { cost: 1 }),
    s('sus', '告発', [fx({ id: 'suspect' })], { cost: 1 }),
    s('guard', '守りの祈り', [fx({ id: 'guard', option: 'protection' }), DRAW1], { cost: 1 }),
    m('backup', '援軍', 2, 2, { keywords: [{ id: 'haste' }], effects: [fx({ id: 'backup', value: 1, timing: 'summon' })] }),
    s('seal', '運命封じ', [fx({ id: 'fateseal', value: 2, target: 'enemyPlayer' }), fx({ id: 'exileMill', value: 1, target: 'enemyPlayer' })], { cost: 1 }),
    s('perm', '鍛冶', [fx({ id: 'perpetual', value: 1, target: 'self' }), DRAW1], { cost: 1 }),
    s('spawn', '落とし子', [fx({ id: 'token', value: 1, hits: 2, option: 'spawn', target: 'self' })], { cost: 1 }),
    s('plan', '陰謀', [fx({ id: 'damage', value: 2, timing: 'charged', target: 'enemyPlayer' })], { rarity: 'rare', cost: 1, abilities: [AB('charge', 2, { option: 'cardPlayed', once: true })] }),
    s('conv', '収斂の光', [fx({ id: 'damage', value: 3 }), fx({ id: 'damage', value: 3, condition: 'converge' })], { rarity: 'rare' }),
  ];
  const counts: Record<string, number> = Object.fromEntries(cards.map((c) => [c.id, 1]));
  Object.assign(counts, { sentry: 2, valiant: 2, elder: 2, archer: 2, egg: 2, backup: 2, wither: 2, loot: 2 });
  const deck = { v: 1 as const, id: 'mtgTA', name: 'MTG-TA', entries: Object.entries(counts).map(([cardId, count]) => ({ cardId, count })) };

  it('カードとデッキはすべて作れる（30枚）', () => {
    for (const c of cards) expect(analyzeCard(c).violations, c.name).toEqual([]);
    expect(deck.entries.reduce((x, e) => x + e.count, 0)).toBe(30);
    expect(analyzeDeck(deck, new Map(cards.map((c) => [c.id, c]))).violations).toEqual([]);
  });

  const used = new Set<string>();
  const runGame = (seed: number, level: ai.CpuLevel) => {
    const opp = PRESET_DECKS[seed % PRESET_DECKS.length]!;
    const r = battle.createGame({ seed, players: [{ name: 'MTG-TA', deck, cards }, { name: opp.name, deck: opp.deck, cards: opp.cards }] });
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
      for (const l of g.log.slice(-20)) {
        if (l.text.includes('罠『')) used.add('trap');
        if (l.text.includes('孵化')) used.add('egg');
        if (l.text.includes('捨てられたときの効果')) used.add('discarded');
      }
      if (g.players[1].status.rad) used.add('rad');
      if (g.players[0].exp) used.add('exp');
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
  it('CPU は新しい要素（罠・卵・放射能・経験）を実際に使う', () => {
    for (const seed of [3, 9, 11]) runGame(seed, 'normal');
    expect([...used].sort()).toEqual(expect.arrayContaining(['egg', 'exp', 'rad']));
  }, 180_000);
});

/** 当たり障りのない呪文（山札用） */
function FILL(): CardDef {
  return SPELL([fx({ id: 'heal', value: 1, target: 'self' })], { rarity: 'common', cost: 1 });
}
