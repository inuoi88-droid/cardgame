// MTG 要素 △ バッチD（対戦のオプション：リーダー・フィールド（次元・ワールド）・効果「フィールド」・昼と夜と条件「昼なら／夜なら」）。
// 倍率1で確かめる（表で書く）。ドラフト戦・コスト分布・テンプレートは tests/draft.test.ts・tests/templates.test.ts
import { describe, expect, it } from 'vitest';
import {
  ai,
  analyzeCard,
  analyzeDeck,
  BALANCE,
  battle,
  CONDITIONS,
  conditionsFor,
  describeCard,
  FIELD_IDS,
  FIELDS,
  LEADER_IDS,
  LEADERS,
  normalizeRules,
  toLeaderId,
  type CardDef,
  type EffectInstance,
  type FieldId,
  type LeaderId,
  type MatchRules,
} from '../src/engine/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { card } from './helpers.ts';
import { act, attack, deckOf, endTurn, FILLER, fx, giveCard, M, P, putMonster, rich } from './battle/helpers.ts';

type G = battle.GameState;
const B = BALANCE.battle;

/** 両者が手札を決めて、先攻（P0）の1ターン目が始まった状態（リーダー・ルールつき） */
function startWith(opts: { leaders?: [LeaderId?, LeaderId?]; rules?: MatchRules; seed?: number } = {}): G {
  const r = battle.createGame({
    seed: opts.seed ?? 1,
    first: 0,
    players: [
      { name: 'P0', deck: deckOf([FILLER]), cards: [FILLER], ...(opts.leaders?.[0] ? { leader: opts.leaders[0] } : {}) },
      { name: 'P1', deck: deckOf([FILLER]), cards: [FILLER], ...(opts.leaders?.[1] ? { leader: opts.leaders[1] } : {}) },
    ],
    ...(opts.rules ? { rules: opts.rules } : {}),
  });
  if (!r.ok) throw new Error(r.error);
  let g = act(r.state, { type: 'mulligan', player: 0, mode: 'keep' });
  g = act(g, { type: 'mulligan', player: 1, mode: 'keep' });
  return g;
}
/** P0 の n ターン目の開始まで進める（何もせずにターンを終える） */
function toMyTurn(g: G, n: number): G {
  while (g.players[0].turnsTaken < n || g.active !== 0) g = endTurn(g);
  return g;
}
const withField = (g: G, id: FieldId): G => {
  g.field = { id, by: null, since: g.turnIndex };
  return g;
};

let seq = 0;
const MON = (a: number, h: number, extra: Partial<CardDef> = {}) =>
  card({ id: `tdm${++seq}`, name: `獣${seq}`, rarity: 'common', cost: 1, stats: { attack: a, hp: h, defense: 0 }, ...extra });
const SPELL = (effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id: `tds${++seq}`, name: `術${seq}`, rarity: 'common', cost: 1, effects, ...extra });
const DRAW1 = fx({ id: 'draw', value: 1, target: 'self' });
const SET = (option: FieldId) => fx({ id: 'setField', target: 'self', option });

// ---------------------------------------------------------------- 定義
describe('定義（△ バッチD）：ポイント・テキスト・条件', () => {
  it('効果「フィールド」は x(6)＝6pt（倍率1）。選んだフィールドの名前と説明がテキストに出る', () => {
    for (const id of FIELD_IDS) {
      const c = SPELL([SET(id)]);
      const a = analyzeCard(c);
      expect(a.violations, id).toEqual([]);
      expect(a.points.lines.find((l) => l.kind === 'effect')?.value).toBe(6);
      expect(JSON.stringify(describeCard(c))).toContain(`フィールドを「${FIELDS[id].name}」（${FIELDS[id].description}）にする`);
    }
  });

  // [条件, 倍率, テキストの前置き]
  const table: [string, number, string][] = [
    ['isDay', 0.6, '昼なら、'],
    ['isNight', 0.6, '夜なら、'],
  ];
  it.each(table)('条件 %s：倍率 %d・見出し「昼と夜」・どのタイミングでも選べる', (id, mult, prefix) => {
    const c = CONDITIONS[id as 'isDay'];
    expect(BALANCE.condition[id as 'isDay']).toBe(mult);
    expect(c.group).toBe('昼と夜');
    expect(c.textPrefix).toBe(prefix);
    expect(c.description.length).toBeGreaterThan(5);
    for (const t of ['play', 'summon', 'turnStart', 'attack', 'destroyed'] as const) expect(conditionsFor(t, t === 'play' ? 'spell' : 'monster')).toContain(id);
    const dmg = SPELL([fx({ id: 'damage', value: 5, condition: id as 'isDay' })]);
    expect(analyzeCard(dmg).violations).toEqual([]);
    expect(JSON.stringify(describeCard(dmg))).toContain(prefix);
  });

  it('リーダー6つ（なしを含む）とフィールド6つに名前・アイコン・説明がある。知らない値は none・無し扱い', () => {
    expect(LEADER_IDS).toHaveLength(6);
    for (const id of LEADER_IDS) expect(LEADERS[id].description.length).toBeGreaterThan(3);
    for (const id of FIELD_IDS) expect(FIELDS[id].description.length).toBeGreaterThan(3);
    expect(toLeaderId('dragon')).toBe('none');
    expect(toLeaderId(undefined)).toBe('none');
    expect(toLeaderId('mage')).toBe('mage');
    expect(normalizeRules({ field: 'planar', dayNight: true, x: 1 })).toEqual({ field: 'planar', dayNight: true });
    expect(normalizeRules({ field: 'off', dayNight: false })).toBeUndefined();
    expect(normalizeRules({ field: 'chaos', dayNight: 'yes' })).toBeUndefined();
    expect(normalizeRules(null)).toBeUndefined();
  });
});

// ---------------------------------------------------------------- リーダー
describe('リーダー', () => {
  const L = BALANCE.leaders;
  it('騎士：最大HPとHPが増える', () => {
    const g = startWith({ leaders: ['knight'] });
    expect([g.players[0].hp, g.players[0].maxHp]).toEqual([B.playerHp + L.knight.hp, B.playerHp + L.knight.hp]);
    expect([g.players[1].hp, g.players[1].maxHp]).toEqual([B.playerHp, B.playerHp]);
    expect(g.players[0].leader).toBe('knight');
    expect(g.players[1].leader).toBeUndefined();
  });

  it('魔術師：最初の手札が多い（全部引き直しでも同じ枚数）', () => {
    const r = battle.createGame({ seed: 3, first: 0, players: [{ name: 'P0', deck: deckOf([FILLER]), cards: [FILLER], leader: 'mage' }, { name: 'P1', deck: deckOf([FILLER]), cards: [FILLER] }] });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.players[0].hand).toHaveLength(B.drawPerTurn + L.mage.firstHand);
    expect(r.state.players[1].hand).toHaveLength(B.drawPerTurn);
    const g = act(r.state, { type: 'mulligan', player: 0, mode: 'all' });
    expect(g.players[0].hand).toHaveLength(B.drawPerTurn + L.mage.firstHand);
  });

  it('召喚士：自分のモンスターが出るたび体力・最大体力が増える（相手のモンスターは増えない）', () => {
    let g = rich(startWith({ leaders: ['summoner'] }));
    const m = MON(2, 3);
    const uid = giveCard(g, 0, m);
    g = act(g, { type: 'playCard', player: 0, cardUid: uid, chosen: {} });
    const mon = g.players[0].board[0]!;
    expect([mon.hp, mon.maxHp]).toEqual([3 + L.summoner.hp, 3 + L.summoner.hp]);
    g = endTurn(g);
    rich(g, 1);
    const uid2 = giveCard(g, 1, m);
    g = act(g, { type: 'playCard', player: 1, cardUid: uid2, chosen: {} });
    expect(g.players[1].board[0]!.hp).toBe(3);
  });

  // [リーダー, そのリーダーで効くターン, 効かないターン]
  const turnTable: [LeaderId, number, number][] = [
    ['alchemist', L.alchemist.everyTurns, L.alchemist.everyTurns - 1],
    ['scholar', L.scholar.everyTurns, L.scholar.everyTurns + 1],
  ];
  it.each(turnTable)('%s：自分の %d ターン目に効き、%d ターン目には効かない', (leader, on, off) => {
    const run = (n: number, l?: LeaderId) => toMyTurn(startWith({ leaders: [l] }), n).players[0];
    const plus = leader === 'alchemist' ? (ps: battle.PlayerState) => ps.energy : (ps: battle.PlayerState) => ps.hand.length;
    expect(plus(run(on, leader)) - plus(run(on))).toBe(leader === 'alchemist' ? L.alchemist.energy : L.scholar.draw);
    expect(plus(run(off, leader)) - plus(run(off))).toBe(0);
  });

  it('JSON にでき、公開情報として相手にも見える', () => {
    const g = startWith({ leaders: ['knight', 'scholar'] });
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
    const v = battle.viewFor(g, 1);
    expect(v.players[0].leader).toBe('knight');
    expect(v.players[1].leader).toBe('scholar');
  });
});

// ---------------------------------------------------------------- フィールド
describe('フィールド', () => {
  const F = BALANCE.fields;
  it('火山：すべてのモンスターの攻撃力が上がる（砦は0のまま）', () => {
    const g = withField(startWith(), 'volcano');
    const a = putMonster(g, 0, MON(2, 2));
    const b = putMonster(g, 1, MON(3, 2));
    expect(battle.effectiveAttack(g, battle.findMonster(g, a)!)).toBe(2 + F.volcano.attack);
    expect(battle.effectiveAttack(g, battle.findMonster(g, b)!)).toBe(3 + F.volcano.attack);
    let h = attack(g, a, P(1));
    expect(h.players[1].hp).toBe(B.playerHp - 2 - F.volcano.attack);
  });

  it('大図書館：ターン開始時に多く引く（1ターン目も。両者）', () => {
    const base = toMyTurn(startWith(), 2).players[0].hand.length;
    let g = withField(startWith(), 'library');
    g = toMyTurn(g, 2);
    expect(g.players[0].hand.length).toBe(base + F.library.draw);
  });

  it('聖域：ターン開始時に HP が回復する（最大HPまで）', () => {
    let g = withField(startWith(), 'sanctuary');
    g.players[1].hp = B.playerHp - 10;
    g = endTurn(g);
    expect(g.players[1].hp).toBe(B.playerHp - 10 + F.sanctuary.heal);
    g = endTurn(g);
    expect(g.players[0].hp).toBe(B.playerHp);
  });

  it('闘技場：場に出したターンから攻撃できる（無ければできない）', () => {
    const m = MON(2, 2);
    let g = rich(startWith());
    let uid = giveCard(g, 0, m);
    g = act(g, { type: 'playCard', player: 0, cardUid: uid, chosen: {} });
    expect(battle.attackBlockReason(g, g.players[0].board[0]!)).toBe('場に出たターンは攻撃できません');
    g = rich(withField(startWith(), 'arena'));
    uid = giveCard(g, 0, m);
    g = act(g, { type: 'playCard', player: 0, cardUid: uid, chosen: {} });
    expect(battle.attackBlockReason(g, g.players[0].board[0]!)).toBeNull();
    g = attack(g, g.players[0].board[0]!.uid, P(1));
    expect(g.players[1].hp).toBe(B.playerHp - 2);
  });

  it('市場：各ターン最初に使うカードだけコスト−1（0まで）', () => {
    let g = rich(withField(startWith(), 'market'));
    const c2 = SPELL([DRAW1], { cost: 2 });
    const c0 = SPELL([DRAW1], { cost: 0 });
    const a = giveCard(g, 0, c2);
    const b = giveCard(g, 0, c2);
    const z = giveCard(g, 0, c0);
    const inst = (uid: string) => g.players[0].hand.find((c) => c.uid === uid)!;
    expect(battle.effectiveCost(g, 0, inst(a))).toBe(2 - F.market.discount);
    expect(battle.costBreakdown(g, 0, inst(a)).steps.map((s) => s.label)).toContain('市場');
    expect(battle.effectiveCost(g, 0, inst(z))).toBe(0);
    g = act(g, { type: 'playCard', player: 0, cardUid: a, chosen: {} });
    expect(g.players[0].energy).toBe(20 - 1);
    expect(battle.effectiveCost(g, 0, g.players[0].hand.find((c) => c.uid === b)!)).toBe(2);
  });

  it('霧：モンスターの攻撃で相手プレイヤーに与えるダメージが減る（モンスターへの攻撃は減らない）', () => {
    const g = withField(startWith(), 'fog');
    const a = putMonster(g, 0, MON(4, 9));
    const t = putMonster(g, 1, MON(0, 9));
    const h = attack(g, a, P(1));
    expect(h.players[1].hp).toBe(B.playerHp - Math.floor(4 * (1 - F.fog.rate)));
    const k = attack(g, a, M(t));
    expect(battle.findMonster(k, t)!.hp).toBe(9 - 4);
  });

  it('次元（ランダム）：開始時に1つ決まり、変わらない', () => {
    let g = startWith({ rules: { field: 'random' } });
    expect(g.rules).toEqual({ field: 'random' });
    const first = g.field!.id;
    expect(g.field!.by).toBeNull();
    for (let i = 0; i < 14; i++) g = endTurn(g);
    expect(g.field!.id).toBe(first);
  });

  it('次元（移り変わる）：通算 planarEvery ターンごとに別のフィールドへ。効果「フィールド」は次の切り替えまで', () => {
    let g = startWith({ rules: { field: 'planar' }, seed: 5 });
    const first = g.field!.id;
    expect(battle.nextPlanarTurn(g)).toBe(1 + F.planarEvery);
    while (g.turnIndex < F.planarEvery) g = endTurn(g);
    expect(g.field!.id).toBe(first);
    g = endTurn(g);
    expect(g.turnIndex).toBe(1 + F.planarEvery);
    expect(g.field!.id).not.toBe(first);
    expect(g.log.some((e) => e.ev?.kind === 'field')).toBe(true);
    // 効果「フィールド」で上書き → 次の切り替えで次元のものへ
    rich(g);
    const other: FieldId = g.field!.id === 'fog' ? 'arena' : 'fog';
    const uid = giveCard(g, g.active, SPELL([SET(other)]));
    g = act(g, { type: 'playCard', player: g.active, cardUid: uid, chosen: {} });
    expect(g.field).toMatchObject({ id: other, by: g.active });
    while (g.turnIndex < 1 + 2 * F.planarEvery) g = endTurn(g);
    expect(g.field!.by).toBeNull();
    expect(g.field!.id).not.toBe(other);
  });

  it('効果「フィールド」：置き換える・同じなら何もしない・相手にも効く', () => {
    let g = rich(startWith());
    expect(g.field).toBeUndefined();
    const uid = giveCard(g, 0, SPELL([SET('volcano')]));
    g = act(g, { type: 'playCard', player: 0, cardUid: uid, chosen: {} });
    expect(g.field).toEqual({ id: 'volcano', by: 0, since: g.turnIndex });
    const n = g.log.length;
    const again = giveCard(g, 0, SPELL([SET('volcano')]));
    g = act(g, { type: 'playCard', player: 0, cardUid: again, chosen: {} });
    expect(g.log.slice(n).some((e) => e.ev?.kind === 'field')).toBe(false);
    const m = putMonster(g, 1, MON(1, 1));
    expect(battle.effectiveAttack(g, battle.findMonster(g, m)!)).toBe(1 + BALANCE.fields.volcano.attack);
    expect(battle.viewFor(g, 1).field).toEqual(g.field);
  });
});

// ---------------------------------------------------------------- 昼と夜
describe('昼と夜', () => {
  const D = BALANCE.dayNight;
  it('オプションありなら昼で始まる。昼に0枚なら夜、夜に2枚以上なら昼', () => {
    let g = startWith({ rules: { dayNight: true } });
    expect(g.dayNight).toBe('day');
    g = endTurn(g);
    expect(g.dayNight).toBe('night');
    rich(g);
    for (let i = 0; i < D.toDay - 1; i++) g = act(g, { type: 'playCard', player: 1, cardUid: giveCard(g, 1, SPELL([DRAW1])), chosen: {} });
    g = endTurn(g);
    expect(g.dayNight).toBe('night');
    rich(g);
    for (let i = 0; i < D.toDay; i++) g = act(g, { type: 'playCard', player: 0, cardUid: giveCard(g, 0, SPELL([DRAW1])), chosen: {} });
    g = endTurn(g);
    expect(g.dayNight).toBe('day');
    // 昼に1枚使えば昼のまま
    rich(g);
    g = act(g, { type: 'playCard', player: 1, cardUid: giveCard(g, 1, SPELL([DRAW1])), chosen: {} });
    g = endTurn(g);
    expect(g.dayNight).toBe('day');
    expect(g.log.filter((e) => e.ev?.kind === 'dayNight').map((e) => e.ev!.status)).toEqual(['day', 'night', 'day']);
  });

  it('オプションなしでは始まらず、条件「昼なら／夜なら」のカードを使う・場に出すと昼で始まる', () => {
    let g = rich(startWith());
    g = endTurn(endTurn(g));
    expect(g.dayNight).toBeUndefined();
    rich(g);
    const plain = giveCard(g, 0, SPELL([DRAW1]));
    g = act(g, { type: 'playCard', player: 0, cardUid: plain, chosen: {} });
    expect(g.dayNight).toBeUndefined();
    // 夜ならのモンスター（召喚時）
    const m = giveCard(g, 0, MON(1, 1, { effects: [fx({ ...DRAW1, timing: 'summon', condition: 'isNight' })] }));
    const hand = g.players[0].hand.length;
    g = act(g, { type: 'playCard', player: 0, cardUid: m, chosen: {} });
    expect(g.dayNight).toBe('day');
    expect(g.players[0].hand.length).toBe(hand - 1);
    expect(battle.usesDayNight(g.cards[g.players[0].board[0]!.card.cardId])).toBe(true);
  });

  // [今, 条件, 発動する]
  const table: ['day' | 'night' | undefined, 'isDay' | 'isNight', boolean][] = [
    ['day', 'isDay', true],
    ['day', 'isNight', false],
    ['night', 'isDay', false],
    ['night', 'isNight', true],
  ];
  it.each(table)('今が %s のとき、条件 %s の効果は発動 %s', (now, cond, fires) => {
    let g = rich(startWith({ rules: { dayNight: true } }));
    g.dayNight = now;
    const uid = giveCard(g, 0, SPELL([fx({ ...DRAW1, condition: cond })]));
    const hand = g.players[0].hand.length;
    g = act(g, { type: 'playCard', player: 0, cardUid: uid, chosen: {} });
    expect(g.players[0].hand.length).toBe(hand - 1 + (fires ? 1 : 0));
  });

  it('使用時に初めて始まるときは昼なので「昼なら」が発動する', () => {
    let g = rich(startWith());
    const uid = giveCard(g, 0, SPELL([fx({ ...DRAW1, condition: 'isDay' })]));
    const hand = g.players[0].hand.length;
    g = act(g, { type: 'playCard', player: 0, cardUid: uid, chosen: {} });
    expect(g.dayNight).toBe('day');
    expect(g.players[0].hand.length).toBe(hand);
  });

  it('古い状態（rules・field・dayNight・leader が無い）でもそのまま進む', () => {
    let g = startWith();
    delete g.rules;
    delete g.field;
    delete g.dayNight;
    for (let i = 0; i < 4; i++) g = endTurn(g);
    expect(g.phase).toBe('main');
    expect(battle.ruleHooks(g, 0)).toMatchObject({ leader: 'none', field: null, extraDraw: 0 });
  });
});

// ---------------------------------------------------------------- CPU
describe('CPU（△ バッチD）', () => {
  const m = (id: string, name: string, cost: number, a: number, h: number, extra: Partial<CardDef> = {}) =>
    card({ id, name, rarity: 'common', cost, stats: { attack: a, hp: h, defense: 0 }, ...extra });
  const s = (id: string, name: string, cost: number, effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id, name, rarity: 'common', cost, effects, ...extra });
  const D = (v: number, extra: Partial<EffectInstance> = {}) => fx({ id: 'damage', value: v, ...extra });
  const cards: CardDef[] = [
    s('volcano', '火山の呼び声', 1, [SET('volcano')]),
    s('fog', '霧の帳', 1, [SET('fog')]),
    s('arena', '闘技場の門', 1, [SET('arena'), fx({ ...DRAW1 })]),
    s('market', '市の開催', 1, [SET('market')]),
    m('dayBeast', '昼の獣', 2, 2, 2, { effects: [D(2, { timing: 'summon', condition: 'isDay' })] }),
    m('nightBeast', '夜の獣', 2, 2, 2, { effects: [D(3, { timing: 'summon', condition: 'isNight' })] }),
    s('dawn', '夜明けの矢', 1, [D(3, { condition: 'isDay' }), fx({ ...DRAW1, condition: 'isNight' })]),
    m('grunt', '兵士', 1, 1, 2),
  ];
  const deckOfIds = (id: string, counts: Record<string, number>) => ({ v: 1 as const, id, name: id, entries: Object.entries(counts).map(([cardId, count]) => ({ cardId, count })) });
  const deckA = deckOfIds('tdA', { volcano: 3, fog: 3, arena: 3, market: 3, dayBeast: 5, nightBeast: 5, dawn: 4, grunt: 4 });
  const byId = new Map(cards.map((c) => [c.id, c]));

  it('カードとデッキはすべて作れる（30枚）', () => {
    for (const c of cards) expect(analyzeCard(c).violations, c.name).toEqual([]);
    expect(analyzeDeck(deckA, byId).violations).toEqual([]);
  });

  const runGame = (seed: number, level: ai.CpuLevel, rules: MatchRules, leaders: [LeaderId, LeaderId]) => {
    const opp = PRESET_DECKS[seed % PRESET_DECKS.length]!;
    const r = battle.createGame({
      seed,
      rules,
      players: [
        { name: 'A', deck: deckA, cards, leader: leaders[0] },
        seed % 2 === 0 ? { name: 'B', deck: deckA, cards, leader: leaders[1] } : { name: opp.name, deck: opp.deck, cards: opp.cards, leader: leaders[1] },
      ],
    });
    if (!r.ok) throw new Error(r.error);
    let g = r.state;
    let steps = 0;
    const seenFields = new Set<string>();
    while (g.phase !== 'ended') {
      const p = g.phase === 'mulligan' ? (g.players[0].mulligan.done ? 1 : 0) : g.pending ? g.pending.player : g.active;
      const action = ai.cpuAction(g, p, steps, level);
      const next = battle.applyAction(g, action);
      expect(next.ok, next.ok ? '' : `${next.error}（${JSON.stringify(action)}）`).toBe(true);
      if (!next.ok) return g;
      g = next.state;
      if (g.field) seenFields.add(g.field.id);
      expect(++steps).toBeLessThan(6000);
    }
    expect(g.result).not.toBeNull();
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
    return { g, seenFields };
  };

  for (const level of ['easy', 'normal', 'hard'] as const) {
    it(`${ai.CPU_LEVEL_LABEL[level]}：新要素のデッキ・リーダー・次元・昼と夜で最後まで不正な行動なしで戦える`, () => {
      const r1 = runGame(level === 'hard' ? 4 : 2, level, { field: 'planar', dayNight: true }, ['knight', 'scholar']) as { g: G };
      expect(r1.g.rules).toEqual({ field: 'planar', dayNight: true });
      if (level !== 'hard') runGame(7, level, { field: 'random' }, ['alchemist', 'summoner']);
    }, 300_000);
  }

  it('CPU は効果「フィールド」と昼と夜のカードを実際に使う', () => {
    const used = new Set<string>();
    for (const seed of [2, 6]) {
      const out = runGame(seed, 'normal', {}, ['mage', 'none']) as { g: G };
      for (const e of out.g.log) {
        if (e.ev?.kind === 'field' && e.ev.player !== undefined) used.add('setField');
        if (e.ev?.kind === 'dayNight') used.add(`dayNight:${e.ev.status}`);
      }
    }
    expect([...used]).toEqual(expect.arrayContaining(['setField', 'dayNight:day']));
  }, 300_000);
});
