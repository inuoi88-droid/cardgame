// MTG 要素 ○ バッチA（条件15・タイミング3・対象3・修飾2・デメリット4）。倍率1で確かめる（表で書く）
import { describe, expect, it } from 'vitest';
import {
  ai,
  analyzeCard,
  analyzeDeck,
  battle,
  changeDrawbackOption,
  conditionsFor,
  createDrawback,
  CONDITIONS,
  describeDrawback,
  describeEffect,
  fitEffect,
  getEffect,
  modifiersFor,
  parseCard,
  targetsForEffect,
  TIMINGS,
  type CardDef,
  type ConditionId,
  type DrawbackInstance,
  type EffectInstance,
} from '../src/engine/index.ts';
import { checkCondition, type ConditionOpts } from '../src/engine/battle/conditions.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { EXAMPLES, card, codes } from './helpers.ts';
import { act, actError, attack, endTurn, fx, giveCard, logText, M, monster, P, play, putMonster, rich, startGame } from './battle/helpers.ts';

type G = battle.GameState;

let seq = 0;
const MON = (a: number, h: number, extra: Partial<CardDef> = {}) =>
  card({ id: `am${++seq}`, name: `獣${seq}`, rarity: 'legend', stats: { attack: a, hp: h, defense: 0 }, ...extra });
const SPELL = (effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id: `as${++seq}`, name: `呪文${seq}`, rarity: 'legend', effects, ...extra });
const DB = (id: string, extra: Partial<DrawbackInstance> = {}): DrawbackInstance => ({ id, timing: null, ...extra });
const srcOf = (g: G, uid: string): battle.SourceRef => {
  const m = monster(g, uid)!;
  return { kind: 'monster', uid, cardId: m.card.cardId, name: 'x', controller: m.controller };
};
/** 捨て札にカードを置く */
function toDiscard(g: G, p: battle.PlayerId, def: CardDef, n = 1): void {
  g.cards[`p${p}:${def.id}`] = def;
  for (let i = 0; i < n; i++) g.players[p].discard.push({ uid: `d${++seq}`, cardId: `p${p}:${def.id}`, owner: p });
}
/** 山札の一番上にカードを置く */
function toDeckTop(g: G, p: battle.PlayerId, def: CardDef): string {
  g.cards[`p${p}:${def.id}`] = def;
  const uid = `k${++seq}`;
  g.players[p].deck.unshift({ uid, cardId: `p${p}:${def.id}`, owner: p });
  return uid;
}

const SKILL = card({ id: 'skillA', name: '薬', effects: [fx({ id: 'heal', value: 1, target: 'self' })] });
const ATTACK = card({ id: 'atkA', name: '矢', effects: [fx({ id: 'damage', value: 1 })] });
const BEAST = card({ id: 'beastA', name: '獣', stats: { attack: 1, hp: 1, defense: 0 } });
const CURSE = card({ id: 'curseA', name: '呪薬', effects: [fx({ id: 'heal', value: 1, target: 'self' })], drawbacks: [DB('selfDamage', { value: 1, timing: 'play' })] });

const pointsOf = (c: CardDef, i = 0) => analyzeCard(c).points.lines.filter((l) => l.kind === 'effect')[i]!.value;
const dbPointsOf = (c: CardDef) => -analyzeCard(c).points.lines.find((l) => l.kind === 'drawback')!.value;
const SPELL_DMG5 = (condition: ConditionId) => card({ rarity: 'legend', cost: 5, effects: [fx({ id: 'damage', value: 5, condition })] });
const MON_ATK_DMG5 = (condition: ConditionId) =>
  card({ rarity: 'legend', cost: 5, stats: { attack: 1, hp: 1, defense: 0 }, effects: [fx({ id: 'damage', value: 5, timing: 'attack', condition })] });

// ---------------------------------------------------------------- 条件：テキストとポイント
describe('条件（○ バッチA）：テキストとポイント', () => {
  // ダメージ5（15pt）× 条件の倍率（切り上げ）。「このモンスター」の条件は攻撃するたび（×2.0）
  const table: [ConditionId, number, 'spell' | 'monster'][] = [
    ['enemyPlayedMany', 9, 'spell'],
    ['veteran', 18, 'monster'],
    ['strongerAlly', 21, 'monster'],
    ['totalAttack', 9, 'spell'],
    ['twoAllyAttacks', 9, 'spell'],
    ['coven', 8, 'spell'],
    ['delirium', 11, 'spell'],
    ['criticalHp', 6, 'spell'],
    ['bigDamageThisTurn', 9, 'spell'],
    ['skillsInDiscard', 13, 'spell'],
    ['healedThisTurn', 9, 'spell'],
    ['enemyPoisonHigh', 6, 'spell'],
    ['notFirstCard', 12, 'spell'],
    ['clash', 7, 'spell'],
    ['exploit', 9, 'spell'],
  ];
  it.each(table)('%s：%ipt、テキストの前置き、違反なし', (id, pts, base) => {
    const c = base === 'spell' ? SPELL_DMG5(id) : MON_ATK_DMG5(id);
    expect(analyzeCard(c).violations).toEqual([]);
    expect(pointsOf(c)).toBe(pts);
    expect(describeEffect(c.effects[0]!)).toContain(CONDITIONS[id].textPrefix);
  });

  it('数字は BALANCE から：ラベルに出る', () => {
    expect(CONDITIONS.totalAttack.label).toBe('自分のモンスターの攻撃力の合計が8以上');
    expect(CONDITIONS.bigDamageThisTurn.label).toBe('このターン相手に合計6以上のダメージを与えた');
    expect(CONDITIONS.enemyPoisonHigh.label).toBe('相手の毒が3以上');
    expect(describeEffect(fx({ id: 'damage', value: 5, condition: 'clash' }))).toBe('激突して勝てば、相手1体に5ダメージを与える。');
  });

  it('付けられるタイミング・土台（エディターの表）', () => {
    // このモンスターの条件はモンスターのカードだけ。召喚時（veteran）・破壊されたとき・引いたときは外す
    expect(conditionsFor('attack', 'monster')).toEqual(expect.arrayContaining(['veteran', 'strongerAlly']));
    expect(conditionsFor('play', 'spell')).not.toContain('veteran');
    expect(conditionsFor('play', 'spell')).not.toContain('strongerAlly');
    expect(conditionsFor('summon', 'monster')).not.toContain('veteran');
    expect(conditionsFor('summon', 'monster')).toContain('strongerAlly');
    expect(conditionsFor('destroyed', 'monster')).not.toContain('strongerAlly');
    expect(conditionsFor('drawn', 'monster')).not.toContain('veteran');
    // 濫用は使用時・召喚時だけ。2枚目以降は使用時・召喚時・カードを使うたび
    expect(conditionsFor('turnEnd', 'spell')).not.toContain('exploit');
    expect(conditionsFor('summon', 'monster')).toContain('exploit');
    expect(conditionsFor('cardPlayed', 'spell')).toContain('notFirstCard');
    expect(conditionsFor('turnStart', 'spell')).not.toContain('notFirstCard');
    expect(conditionsFor('turnStart', 'spell')).not.toContain('twoAllyAttacks');
    expect(conditionsFor('turnStart', 'spell')).not.toContain('bigDamageThisTurn');
    const v = (c: CardDef) => codes(analyzeCard(c).violations);
    expect(v(card({ rarity: 'legend', cost: 5, effects: [fx({ id: 'damage', value: 5, condition: 'veteran' })] }))).toContain('EFFECT_CONDITION');
    expect(v(card({ rarity: 'legend', cost: 5, effects: [fx({ id: 'heal', value: 5, target: 'self', timing: 'turnEnd', condition: 'exploit' })] }))).toContain('EFFECT_CONDITION');
  });
});

// ---------------------------------------------------------------- 条件：満たす盤面・満たさない盤面
describe('条件（○ バッチA）：判定の表', () => {
  type Setup = (g: G) => ConditionOpts | void;
  const at = (n: number) => (g: G) => {
    g.players[0].hp = n;
  };
  const table: [ConditionId, Setup, Setup][] = [
    ['enemyPlayedMany', (g) => void (g.players[1].lastTurn = { cardsPlayed: 3 }), (g) => void (g.players[1].lastTurn = { cardsPlayed: 2 })],
    [
      'veteran',
      (g) => ({ src: srcOf(g, putMonster(g, 0, MON(1, 1), { counters: { attacksTotal: 3 } })) }),
      (g) => ({ src: srcOf(g, putMonster(g, 0, MON(1, 1), { counters: { attacksTotal: 2 } })) }),
    ],
    [
      'strongerAlly',
      (g) => {
        const a = putMonster(g, 0, MON(1, 1));
        putMonster(g, 0, MON(3, 1));
        return { src: srcOf(g, a) };
      },
      (g) => {
        const a = putMonster(g, 0, MON(3, 1));
        putMonster(g, 0, MON(3, 1));
        return { src: srcOf(g, a) };
      },
    ],
    [
      'totalAttack',
      (g) => {
        putMonster(g, 0, MON(5, 1));
        putMonster(g, 0, MON(2, 1), { tempAttack: 1 });
      },
      (g) => {
        putMonster(g, 0, MON(5, 1));
        putMonster(g, 0, MON(2, 1));
      },
    ],
    ['twoAllyAttacks', (g) => void (g.players[0].turn.allyAttacks = 2), (g) => void (g.players[0].turn.allyAttacks = 1)],
    [
      'coven',
      (g) => [1, 2, 3].forEach((a) => putMonster(g, 0, MON(a, 1))),
      (g) => [1, 2, 2].forEach((a) => putMonster(g, 0, MON(a, 1))),
    ],
    [
      'delirium',
      (g) => {
        toDiscard(g, 0, BEAST);
        toDiscard(g, 0, CURSE); // スキルと呪いの2種類に数える
      },
      (g) => {
        toDiscard(g, 0, BEAST);
        toDiscard(g, 0, SKILL, 3);
        g.players[0].discard.push({ uid: 'nz', cardId: battle.NOISE_CARD_ID, owner: 0 });
      },
    ],
    ['criticalHp', at(30), at(31)],
    ['bigDamageThisTurn', (g) => void (g.players[0].turn.enemyDamageTotal = 6), (g) => void (g.players[0].turn.enemyDamageTotal = 5)],
    [
      'skillsInDiscard',
      (g) => toDiscard(g, 0, SKILL, 2),
      (g) => {
        toDiscard(g, 0, SKILL);
        toDiscard(g, 0, ATTACK, 3);
      },
    ],
    ['healedThisTurn', (g) => void (g.players[0].turn.healed = true), () => undefined],
    ['enemyPoisonHigh', (g) => void (g.players[1].status.poison = 3), (g) => void (g.players[1].status.poison = 2)],
    ['notFirstCard', (g) => void (g.players[0].turn.cardsPlayed = 2), (g) => void (g.players[0].turn.cardsPlayed = 1)],
    [
      'clash',
      (g) => {
        toDeckTop(g, 0, card({ id: 'c3', cost: 3 }));
        toDeckTop(g, 1, card({ id: 'c2', cost: 2 }));
        return { roll: { depth: 0 } };
      },
      (g) => {
        toDeckTop(g, 0, card({ id: 'c2b', cost: 2 }));
        toDeckTop(g, 1, card({ id: 'c2c', cost: 2 }));
        return { roll: { depth: 0 } };
      },
    ],
    [
      'exploit',
      (g) => {
        g.protect.k1 = { poison: 0, burn: 0, exploited: true };
        return { protectKey: 'k1' };
      },
      (g) => {
        g.protect.k1 = { poison: 0, burn: 0 };
        return { protectKey: 'k1' };
      },
    ],
  ];
  it.each(table)('%s', (id, yes, no) => {
    const g1 = startGame();
    expect(checkCondition(g1, 0, id, yes(g1) ?? {})).toBe(true);
    const g2 = startGame();
    expect(checkCondition(g2, 0, id, no(g2) ?? {})).toBe(false);
  });

  it('「このターン」系（大隊・集団戦術・注入）は相手のターンには満たさない', () => {
    const g = endTurn(startGame());
    g.players[0].turn.allyAttacks = 5;
    g.players[0].turn.enemyDamageTotal = 50;
    g.players[0].turn.healed = true;
    for (const id of ['twoAllyAttacks', 'bigDamageThisTurn', 'healedThisTurn'] as const) expect(checkCondition(g, 0, id)).toBe(false);
  });

  it('このモンスター：出どころが場にいなければ偽', () => {
    const g = startGame();
    const a = putMonster(g, 0, MON(1, 1), { counters: { attacksTotal: 5 } });
    putMonster(g, 0, MON(3, 1));
    const src = srcOf(g, a);
    g.players[0].board.shift();
    expect(checkCondition(g, 0, 'veteran', { src })).toBe(false);
    expect(checkCondition(g, 0, 'strongerAlly', { src })).toBe(false);
  });

  it('2枚目以降：コストの計算（forCost）では、これから使う1枚も数える', () => {
    const g = startGame();
    g.players[0].turn.cardsPlayed = 1;
    expect(checkCondition(g, 0, 'notFirstCard')).toBe(false);
    expect(checkCondition(g, 0, 'notFirstCard', { forCost: true })).toBe(true);
  });

  it('前の相手のターン：ターン終了時に使った枚数が記録され、相手のターン中も「最後に終えたターン」を見る', () => {
    let g = rich(startGame());
    for (let i = 0; i < 3; i++) g = play(g, g.players[0].hand[0]!.uid);
    g = endTurn(g);
    expect(g.players[0].lastTurn).toEqual({ cardsPlayed: 3 });
    expect(checkCondition(g, 1, 'enemyPlayedMany')).toBe(true);
    g = endTurn(g); // P0 のターン：P0 の今のターンではなく前のターンの記録
    expect(checkCondition(g, 1, 'enemyPlayedMany')).toBe(true);
    expect(checkCondition(g, 0, 'enemyPlayedMany')).toBe(false); // P1 は0枚
  });

  it('攻撃した回数：攻撃するたびに数え、3回目の攻撃で発動する', () => {
    let g = rich(startGame());
    g.players[1].hp = 100;
    const vet = putMonster(g, 0, MON(1, 9, { effects: [fx({ id: 'damage', value: 5, timing: 'attack', target: 'chosen', condition: 'veteran' })] }), {
      counters: { attacksTotal: 1 },
    });
    g = attack(g, vet, P(1));
    expect(g.players[1].hp).toBe(99);
    expect(monster(g, vet)!.counters.attacksTotal).toBe(2);
    g = endTurn(endTurn(g));
    g = attack(g, vet, P(1));
    expect(g.players[1].hp).toBe(93); // 1 + 5
  });

  it('このターン相手に与えたダメージの合計・回復した：実際の記録で数える', () => {
    let g = rich(startGame());
    g.players[0].hp = 100;
    const bolt = SPELL([fx({ id: 'damage', value: 3 })]);
    g = play(g, giveCard(g, 0, bolt), { enemy: P(1) });
    g = play(g, giveCard(g, 0, bolt), { enemy: P(1) });
    expect(g.players[0].turn.enemyDamageTotal).toBe(6);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'heal', value: 2, target: 'self' })])));
    expect(g.players[0].turn.healed).toBe(true);
    // 最大HPで回復しても数えない
    let h = rich(startGame());
    h = play(h, giveCard(h, 0, SPELL([fx({ id: 'heal', value: 2, target: 'self' })])));
    expect(h.players[0].turn.healed ?? false).toBe(false);
  });

  it('激突：同じシードで同じ結果、山札の順は変わらない、公開ログ。注意の表示では行わない', () => {
    let g = rich(startGame());
    g.players[0].hp = 100;
    const top0 = toDeckTop(g, 0, card({ id: 'big', name: '大', cost: 4 }));
    const top1 = toDeckTop(g, 1, card({ id: 'small', name: '小', cost: 1 }));
    const deck0 = g.players[0].deck.map((c) => c.uid);
    const clash = SPELL([fx({ id: 'heal', value: 7, target: 'self', condition: 'clash' })]);
    const uid = giveCard(g, 0, clash);
    expect(battle.playInfo(g, 0, g.players[0].hand.find((c) => c.uid === uid)!).warnings).toEqual([]);
    g = play(g, uid);
    expect(g.players[0].hp).toBe(107);
    expect(g.players[0].deck.map((c) => c.uid)).toEqual(deck0);
    expect(g.players[1].deck[0]!.uid).toBe(top1);
    expect(g.players[0].deck[0]!.uid).toBe(top0);
    const line = g.log.find((e) => e.text.startsWith('激突：'))!;
    expect(line.text).toContain('『大』（コスト4）');
    expect(line.private).toBeUndefined();
    expect(line.ev).toMatchObject({ kind: 'status', status: 'clash', amount: 1 });
    // 山札が0枚ならコスト−1：負ける側
    g.players[0].deck = [];
    g = play(g, giveCard(g, 0, clash));
    expect(g.players[0].hp).toBe(107);
  });

  it('濫用：選ばなければ不発。選べば破壊して発動。召喚時は自分自身も選べる。場にいなければ選択なし', () => {
    let g = rich(startGame());
    const spell = SPELL([fx({ id: 'damage', value: 5, condition: 'exploit' })]);
    // 場にいない：選択なしで不発（注意も出る）
    const u0 = giveCard(g, 0, spell);
    expect(battle.playInfo(g, 0, g.players[0].hand.find((c) => c.uid === u0)!).warnings).toContain('条件を満たしていません：自分のモンスター1体を生け贄にしたなら');
    g = play(g, u0, { enemy: P(1) });
    expect(g.pending).toBeNull();
    expect(g.players[1].hp).toBe(120);
    const a = putMonster(g, 0, MON(1, 1));
    g = play(g, giveCard(g, 0, spell), { enemy: P(1) });
    expect(g.pending).toMatchObject({ player: 0, min: 0, max: 1 });
    expect(g.pending!.step.t).toBe('exploitChoice');
    g = act(g, { type: 'choose', player: 0, picks: [] });
    expect(g.players[1].hp).toBe(120);
    expect(monster(g, a)).toBeDefined();
    g = play(g, giveCard(g, 0, spell), { enemy: P(1) });
    g = act(g, { type: 'choose', player: 0, picks: [a] });
    expect(monster(g, a)).toBeUndefined();
    expect(g.players[1].hp).toBe(115);
    // 召喚時：出たモンスター自身を生け贄にできる（その後の「このモンスター」は不発）
    g.players[0].hp = 100;
    const self = MON(2, 2, {
      effects: [fx({ id: 'heal', value: 4, timing: 'summon', target: 'self', condition: 'exploit' }), fx({ id: 'train', value: 1, timing: 'summon', target: 'thisMonster' })],
    });
    const su = giveCard(g, 0, self);
    g = play(g, su);
    expect(g.pending!.options.map((o) => o.id)).toEqual([su]);
    g = act(g, { type: 'choose', player: 0, picks: [su] });
    expect(g.players[0].hp).toBe(104);
    expect(monster(g, su)).toBeUndefined();
  });
});

// ---------------------------------------------------------------- タイミング
describe('タイミング（○ バッチA）', () => {
  it.each([
    ['drawn', 'spell', fx({ id: 'draw', value: 1, timing: 'drawn', target: 'self' }), 4, '引いたとき、カードを1枚引く。'],
    ['targeted', 'monster', fx({ id: 'heal', value: 2, timing: 'targeted', target: 'self' }), 12, '自分のカードの対象になるたび、自分のHPを2回復する。'],
    ['bigCardPlayed（モンスター）', 'monster', fx({ id: 'heal', value: 2, timing: 'bigCardPlayed', target: 'self' }), 10, 'コスト3以上のカードを使うたび、自分のHPを2回復する。'],
    ['bigCardPlayed（パワー）', 'spell', fx({ id: 'heal', value: 2, timing: 'bigCardPlayed', target: 'self' }), 28, 'コスト3以上のカードを使うたび、自分のHPを2回復する。'],
  ] as const)('%s：ポイントとテキスト', (_n, base, e, pts, text) => {
    const c = card({ rarity: 'legend', cost: 5, effects: [e], ...(base === 'monster' ? { stats: { attack: 1, hp: 1, defense: 0 } } : {}) });
    expect(analyzeCard(c).violations).toEqual([]);
    expect(pointsOf(c)).toBe(pts);
    expect(describeEffect(e)).toBe(text);
  });

  it('タイミングの見出しと土台：引いたときは「手札・捨て札」、対象になるたびはモンスター専用、演目はパワーにもなる', () => {
    expect(TIMINGS.drawn.group).toBe('手札・捨て札');
    expect(TIMINGS.targeted.bases).toEqual(['monster']);
    expect(analyzeCard(card({ rarity: 'legend', cost: 5, effects: [fx({ id: 'heal', value: 2, timing: 'bigCardPlayed', target: 'self' })] })).cardType).toBe('power');
    expect(analyzeCard(card({ rarity: 'rare', cost: 1, effects: [fx({ id: 'draw', value: 1, timing: 'drawn', target: 'self' })] })).cardType).toBe('skill');
    // 引いたとき：カード自身はまだ手札なので「このモンスター」「自分の他のモンスター全体」は選べない
    expect(targetsForEffect(getEffect('train')!, 'drawn', 'monster')).toEqual(['random', 'allyMonsters', 'weakestAlly', 'tribeAllies']);
  });

  it('引いたとき：効果のポイントの合計はコスト0のときのレアリティ上限まで（DRAWN_OVER_CAP）', () => {
    const drawn = (rarity: CardDef['rarity'], v: number) =>
      card({ rarity, cost: 2, effects: [fx({ id: 'draw', value: v, timing: 'drawn', target: 'self' })] });
    expect(codes(analyzeCard(drawn('common', 1)).violations)).toContain('DRAWN_OVER_CAP'); // 4 > 3
    expect(codes(analyzeCard(drawn('rare', 1)).violations)).toEqual([]); // 4 ≤ 6
    expect(codes(analyzeCard(drawn('rare', 2)).violations)).toContain('DRAWN_OVER_CAP'); // 8 > 6
  });

  it('引いたとき：ターン開始のドローで出る。配った手札・マリガンでは出ない。引く連鎖は1ターン10枚で止まる', () => {
    const chain = card({ id: 'chain', name: '連鎖', rarity: 'rare', effects: [fx({ id: 'draw', value: 1, timing: 'drawn', target: 'self' })] });
    const chainDeck = () => Array.from({ length: 25 }, (_, i) => ({ uid: `ch${i}`, cardId: 'p0:chain', owner: 0 as const }));
    let g = startGame({ mulligan: false });
    g.cards['p0:chain'] = chain;
    g.players[0].deck = chainDeck();
    g = act(g, { type: 'mulligan', player: 0, mode: 'all' });
    g = act(g, { type: 'mulligan', player: 0, mode: 'keep' });
    g = act(g, { type: 'mulligan', player: 1, mode: 'keep' });
    // マリガンの引き直し・1ターン目は引いたときが出ない
    expect(g.players[0].hand.some((c) => c.cardId === 'p0:chain')).toBe(true);
    expect(logText(g)).not.toContain('引いたときの効果');
    g.players[0].deck = chainDeck();
    g = endTurn(endTurn(g));
    expect(g.players[0].hand).toHaveLength(10);
    expect(logText(g)).toContain('引いたときの効果');
    expect(logText(g)).toContain('もう引けない（1ターン10枚まで）');
  });

  it('自分のカードの対象になるたび：カードの効果より先、1ターン2回まで。相手のカードや自分自身の召喚では出ない', () => {
    let g = rich(startGame());
    g.players[0].hp = 100;
    const hero = putMonster(g, 0, MON(1, 5, { effects: [fx({ id: 'heal', value: 3, timing: 'targeted', target: 'self' })] }));
    const buff = SPELL([fx({ id: 'train', value: 1, target: 'chosen' })]);
    g = play(g, giveCard(g, 0, buff), { ally: hero });
    expect(g.players[0].hp).toBe(103);
    const text = logText(g);
    expect(text.indexOf('HPを3回復')).toBeLessThan(text.lastIndexOf('攻撃力と体力を+1'));
    g = play(g, giveCard(g, 0, buff), { ally: hero });
    g = play(g, giveCard(g, 0, buff), { ally: hero });
    expect(g.players[0].hp).toBe(106); // 3回目は出ない
    // 対象を選ばない全体の効果では出ない
    g = endTurn(endTurn(g));
    g.players[0].energy = 20;
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'train', value: 1, target: 'allyMonsters' })])));
    expect(g.players[0].hp).toBe(106);
  });

  it('コスト3以上のカードを使うたび：印刷コストで判定、いま置いたパワー自身は出ない、1ターン2回まで', () => {
    let g = rich(startGame());
    g.players[0].hp = 100;
    const prowess = SPELL([fx({ id: 'heal', value: 2, timing: 'bigCardPlayed', target: 'self' })], { cost: 3 });
    g = play(g, giveCard(g, 0, prowess));
    expect(g.players[0].powers).toHaveLength(1);
    expect(g.players[0].hp).toBe(100);
    const cheap = SPELL([fx({ id: 'draw', value: 1, target: 'self' })], { cost: 2 });
    const big = SPELL([fx({ id: 'draw', value: 1, target: 'self' })], { cost: 3 });
    g = play(g, giveCard(g, 0, cheap));
    expect(g.players[0].hp).toBe(100);
    g = play(g, giveCard(g, 0, big));
    expect(g.players[0].hp).toBe(102);
    g.players[0].discount = 2; // 軽減しても印刷コストは3
    g = play(g, giveCard(g, 0, big));
    expect(g.players[0].hp).toBe(104);
    g = play(g, giveCard(g, 0, big));
    expect(g.players[0].hp).toBe(104);
    // モンスターに付いた演目：自分自身を召喚したときは出ない
    let h = rich(startGame());
    h.players[0].hp = 100;
    const bard = MON(1, 1, { cost: 3, effects: [fx({ id: 'heal', value: 2, timing: 'bigCardPlayed', target: 'self' })] });
    h = play(h, giveCard(h, 0, bard));
    expect(h.players[0].hp).toBe(100);
    h = play(h, giveCard(h, 0, big));
    expect(h.players[0].hp).toBe(102);
  });
});

// ---------------------------------------------------------------- 対象
describe('対象（○ バッチA）', () => {
  it.each([
    // [効果, ポイント, テキスト]
    [fx({ id: 'pump', value: 1, timing: 'attack', target: 'otherAllies' }), 9, '攻撃するたび、自分の他のモンスター全体の攻撃力をこのターンだけ+1する。'], // 1.5×2.0×2.7（#146）
    [fx({ id: 'train', value: 2, timing: 'summon', target: 'weakestAlly' }), 9, '召喚時、いちばん体力の低い自分のモンスターの攻撃力と体力を+2する。'],
    [fx({ id: 'draw', value: 2, target: 'bothPlayers' }), 4, 'お互い、カードを2枚引く。'],
    [fx({ id: 'cleanse', target: 'bothPlayers' }), 4, 'お互い、状態異常をすべて解除する。'],
  ] as const)('%#：ポイントとテキスト', (e, pts, text) => {
    const monsterCard = e.timing !== 'play';
    const c = card({ rarity: 'legend', cost: 5, effects: [e], ...(monsterCard ? { stats: { attack: 1, hp: 1, defense: 0 } } : {}) });
    expect(analyzeCard(c).violations).toEqual([]);
    expect(pointsOf(c)).toBe(pts);
    expect(describeEffect(e)).toBe(text);
  });

  it('選べる対象の表：お互いは symmetric な効果だけ、他のモンスター全体はモンスターのカードだけ、再行動は他のモンスター全体を外す', () => {
    for (const id of ['draw', 'heal', 'shield', 'regen', 'savings', 'cleanse', 'loot']) expect(targetsForEffect(getEffect(id)!, 'play', 'spell'), id).toContain('bothPlayers');
    for (const id of ['energy', 'discount', 'strength']) expect(targetsForEffect(getEffect(id)!, 'play', 'spell'), id).not.toContain('bothPlayers');
    expect(targetsForEffect(getEffect('train')!, 'play', 'spell')).not.toContain('otherAllies');
    expect(targetsForEffect(getEffect('train')!, 'destroyed', 'monster')).toContain('otherAllies');
    expect(targetsForEffect(getEffect('ready')!, 'summon', 'monster')).not.toContain('otherAllies');
    const v = (c: CardDef) => codes(analyzeCard(c).violations);
    expect(v(card({ rarity: 'legend', cost: 5, effects: [fx({ id: 'damage', value: 1, target: 'bothPlayers' })] }))).toContain('EFFECT_TARGET');
    expect(v(card({ rarity: 'legend', cost: 5, effects: [fx({ id: 'train', value: 1, target: 'otherAllies' })] }))).toContain('EFFECT_TARGET');
  });

  it('自分の他のモンスター全体：自分を含まない。いちばん体力の低い：同じなら左', () => {
    let g = rich(startGame());
    const a = putMonster(g, 0, MON(1, 3));
    const b = putMonster(g, 0, MON(1, 2));
    const c = putMonster(g, 0, MON(1, 2));
    const leader = MON(1, 9, { effects: [fx({ id: 'train', value: 1, timing: 'summon', target: 'otherAllies' })] });
    const lu = giveCard(g, 0, leader);
    g = play(g, lu);
    expect([a, b, c, lu].map((u) => monster(g, u)!.attack)).toEqual([2, 2, 2, 1]);
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'train', value: 5, target: 'weakestAlly' })])));
    // b と c は体力3（+1済み）で同じ → 左の b
    expect([a, b, c].map((u) => monster(g, u)!.hp)).toEqual([4, 8, 3]);
  });

  it('お互い：相手も同じ効果。上限は各自、手札整理の選択は相手が選ぶ', () => {
    let g = rich(startGame());
    const hands = () => g.players.map((p) => p.hand.length);
    const [h0, h1] = hands();
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'draw', value: 2, target: 'bothPlayers' })])));
    expect(hands()).toEqual([h0! + 2, h1! + 2]);
    expect(logText(g)).toContain('P1にも同じ効果');
    // 手札整理：自分の選択 → 相手の選択
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'loot', value: 1, target: 'bothPlayers' })])));
    expect(g.pending?.player).toBe(0);
    g = act(g, { type: 'choose', player: 0, picks: [g.pending!.options[0]!.id] });
    expect(g.pending?.player).toBe(1);
    expect(battle.legalActions(g, 1).every((a) => a.type === 'choose')).toBe(true);
    g = act(g, ai.cpuAction(g, 1, 1, 'normal'));
    expect(g.pending).toBeNull();
    // 回復：お互い
    g.players[0].hp = 50;
    g.players[1].hp = 60;
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'heal', value: 5, target: 'bothPlayers' })])));
    expect([g.players[0].hp, g.players[1].hp]).toEqual([55, 65]);
  });
});

// ---------------------------------------------------------------- 修飾
describe('修飾（○ バッチA）', () => {
  it.each([
    [fx({ id: 'damage', value: 7, mods: ['nextTurn'] }), 16, '次の自分のターン開始時に、相手1体に7ダメージを与える。'],
    [fx({ id: 'damage', value: 5, mods: ['perDiscardMonster'] }), 33, '相手1体に5ダメージを与える（数値は捨て札のモンスター1枚につき、最大5枚）。'],
    [fx({ id: 'damage', value: 2, condition: 'hasMonster', mods: ['pierce', 'nextTurn'] }), 7, '自分の場にモンスターがいれば、次の自分のターン開始時に、相手1体に防御無視の2ダメージを与える。'],
  ] as const)('%#：ポイントとテキスト', (e, pts, text) => {
    const c = card({ rarity: 'legend', cost: 5, effects: [e] });
    expect(analyzeCard(c).violations).toEqual([]);
    expect(pointsOf(c)).toBe(pts);
    expect(describeEffect(e)).toBe(text);
  });

  it('付けられる組み合わせ：遅延は使用時・召喚時だけ、X と併用不可、再行動には付かない', () => {
    const v = (e: EffectInstance) => codes(analyzeCard(card({ rarity: 'legend', cost: 5, effects: [e] })).violations);
    expect(v(fx({ id: 'damage', value: 1, mods: ['nextTurn', 'xEnergy'] }))).toContain('DELAY_WITH_X');
    expect(v(fx({ id: 'damage', value: 1, mods: ['nextTurn', 'perEnemyMonster'] }))).toEqual([]);
    expect(v(fx({ id: 'heal', value: 1, target: 'self', timing: 'turnStart', mods: ['nextTurn'] }))).toContain('EFFECT_MODS_TIMING');
    expect(v(fx({ id: 'ready', target: 'chosen', mods: ['nextTurn'] }))).toContain('EFFECT_MODS');
    expect(modifiersFor(getEffect('ready')!, 'play').map((m) => m.id)).not.toContain('nextTurn');
    expect(fitEffect(fx({ id: 'damage', value: 1, mods: ['xEnergy', 'nextTurn'] }), 'spell').mods).toEqual(['nextTurn']);
    expect(v(fx({ id: 'damage', value: 1, mods: ['perDiscardMonster', 'perEnemyMonster'] }))).toContain('EFFECT_MODS_SCALE_MULTI');
  });

  it('次のターンに：次の自分のターン開始時に発動、条件は予約時に判定、対象がいなければ不発、予約は6件まで', () => {
    let g = rich(startGame());
    const later = SPELL([fx({ id: 'damage', value: 5, mods: ['nextTurn'] })]);
    g = play(g, giveCard(g, 0, later), { enemy: P(1) });
    expect(g.players[1].hp).toBe(120);
    expect(g.players[0].delayed).toHaveLength(1);
    expect(g.players[0].delayed![0]!.effect.mods).toBeUndefined();
    // 条件は予約するときに判定（満たさなければ予約しない）
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'damage', value: 5, condition: 'enemyPoisoned', mods: ['nextTurn'] })])), { enemy: P(1) });
    expect(g.players[0].delayed).toHaveLength(1);
    // 相手モンスターを対象に予約 → そのモンスターがいなくなれば不発
    const foe = putMonster(g, 1, MON(0, 30));
    g = play(g, giveCard(g, 0, later), { enemy: M(foe) });
    expect(g.players[0].delayed).toHaveLength(2);
    g = endTurn(g);
    expect(g.players[1].hp).toBe(120); // 相手のターンには出ない
    g.players[1].board = [];
    g = endTurn(g);
    expect(g.players[1].hp).toBe(115);
    expect(logText(g)).toContain('対象がいないため何も起きない');
    expect(g.players[0].delayed).toEqual([]);
    // 上限6件
    g.players[0].energy = 30;
    for (let i = 0; i < 7; i++) g = play(g, giveCard(g, 0, later), { enemy: P(1) });
    expect(g.players[0].delayed).toHaveLength(6);
    expect(logText(g)).toContain('予約は6件まで');
    // 状態は JSON にできる・公開情報
    expect(battle.viewFor(g, 1).players[0].delayed).toHaveLength(6);
  });

  it('次のターンに：数値の倍数は予約時の値で確定する（このターン使ったカード1枚につき が0にならない）', () => {
    let g = rich(startGame());
    g.players[0].hp = 50;
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'draw', value: 1, target: 'self' })])));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'heal', value: 3, target: 'self', mods: ['nextTurn', 'perCardPlayed'] })])));
    expect(g.players[0].delayed![0]!.effect).toMatchObject({ value: 6 });
    g = endTurn(endTurn(g));
    expect(g.players[0].hp).toBe(56);
  });

  it('捨て札のモンスター1枚につき：0枚で不発、最大5枚', () => {
    let g = rich(startGame());
    const grave = SPELL([fx({ id: 'damage', value: 2, mods: ['perDiscardMonster'] })]);
    g = play(g, giveCard(g, 0, grave), { enemy: P(1) });
    expect(g.players[1].hp).toBe(120);
    expect(logText(g)).toContain('数値が0のため不発');
    toDiscard(g, 0, BEAST, 7);
    toDiscard(g, 0, SKILL, 2);
    g = play(g, giveCard(g, 0, grave), { enemy: P(1) });
    expect(g.players[1].hp).toBe(110);
  });
});

// ---------------------------------------------------------------- デメリット
describe('デメリット（○ バッチA）', () => {
  it.each([
    ['伝説', card({ rarity: 'legend', cost: 3, stats: { attack: 3, hp: 3, defense: 0 }, drawbacks: [DB('legendary')] }), 2, '伝説（自分の場に同じ名前のものがあると使えない）。'],
    ['消耗', card({ rarity: 'legend', cost: 3, stats: { attack: 3, hp: 3, defense: 0 }, drawbacks: [DB('exert')] }), 3, '攻撃したら、次の自分のターンは攻撃できない。'],
    ['枯朽', card({ rarity: 'legend', cost: 3, effects: [fx({ id: 'draw', value: 1, target: 'self' })], drawbacks: [DB('blight', { value: 2, timing: 'play' })] }), 6, '自分のモンスター1体の攻撃力と体力を−2する（いなければ使えない）。'],
    ['捨て札の除外（枚数）', card({ rarity: 'legend', cost: 3, effects: [fx({ id: 'draw', value: 1, target: 'self' })], drawbacks: [DB('exileDiscard', { value: 3, timing: 'play', option: 'count' })] }), 2, '捨て札を3枚除外する。'],
    ['捨て札の除外（コスト合計）', card({ rarity: 'legend', cost: 3, effects: [fx({ id: 'draw', value: 1, target: 'self' })], drawbacks: [DB('exileDiscard', { value: 5, timing: 'play', option: 'costSum' })] }), 2, '捨て札からコストの合計が5以上になるようにカードを除外する。'],
  ] as const)('%s：ポイントとテキスト', (_n, c, pts, text) => {
    expect(dbPointsOf(c)).toBe(pts);
    expect(describeDrawback(c.drawbacks[0]!)).toBe(text);
  });

  it('付けられる種類・タイミング・入力欄（validate のコード）', () => {
    const v = (c: CardDef) => codes(analyzeCard(c).violations);
    const skill = (d: DrawbackInstance) => card({ rarity: 'legend', cost: 3, effects: [fx({ id: 'draw', value: 1, target: 'self' })], drawbacks: [d] });
    expect(v(skill(DB('legendary')))).toContain('DRAWBACK_CARD_TYPE');
    expect(v(skill(DB('exert')))).toContain('DRAWBACK_MONSTER_ONLY');
    expect(v(skill(DB('blight', { value: 1, timing: 'turnEnd' })))).toContain('DRAWBACK_TIMING');
    expect(v(skill(DB('blight', { value: 6, timing: 'play' })))).toContain('DRAWBACK_VALUE');
    expect(v(skill(DB('exileDiscard', { value: 3, timing: 'play', option: 'weird' })))).toContain('DRAWBACK_OPTION');
    expect(v(skill(DB('exileDiscard', { value: 1, timing: 'play', option: 'costSum' })))).toContain('DRAWBACK_VALUE'); // コスト合計は2から
    expect(v(skill(DB('exileDiscard', { value: 6, timing: 'play', option: 'count' })))).toContain('DRAWBACK_VALUE'); // 枚数は5まで
    // エディター：作るときの初期値・数え方を変えると入力欄の初期値に戻る
    const d = createDrawback('exileDiscard', 'spell');
    expect(d).toMatchObject({ option: 'count', value: 3, timing: 'play' });
    expect(changeDrawbackOption(d, 'costSum')).toMatchObject({ option: 'costSum', value: 4 });
    // 取り込み：option は残る
    const parsed = parseCard(JSON.parse(JSON.stringify(skill(DB('exileDiscard', { value: 3, timing: 'play', option: 'costSum' })))));
    expect(parsed.ok && parsed.value.drawbacks[0]!.option).toBe('costSum');
  });

  it('伝説：自分の場に同じ名前のモンスター・パワーがあると使えない', () => {
    let g = rich(startGame());
    const dragon = MON(3, 3, { name: '竜王', drawbacks: [DB('legendary')] });
    g = play(g, giveCard(g, 0, dragon));
    const u = giveCard(g, 0, dragon);
    expect(actError(g, { type: 'playCard', player: 0, cardUid: u })).toBe('伝説：同じ名前のモンスター「竜王」が場にあります');
    expect(battle.legalActions(g, 0).some((a) => a.type === 'playCard' && a.cardUid === u)).toBe(false);
    // 相手の場に同じ名前があっても使える
    let h = rich(startGame());
    putMonster(h, 1, dragon);
    h = play(h, giveCard(h, 0, dragon));
    expect(h.players[0].board).toHaveLength(1);
    // パワー
    const aura = SPELL([fx({ id: 'heal', value: 1, timing: 'turnStart', target: 'self' })], { name: '王の加護', drawbacks: [DB('legendary')] });
    g = play(g, giveCard(g, 0, aura));
    expect(actError(g, { type: 'playCard', player: 0, cardUid: giveCard(g, 0, aura) })).toBe('伝説：同じ名前のパワー『王の加護』が場にあります');
  });

  it('消耗：攻撃したら次の自分のターンは攻撃できない（自動攻撃もしない）。その次は攻撃できる。反撃はする。奪われたら消える', () => {
    let g = startGame();
    const ox = putMonster(g, 0, MON(3, 20, { drawbacks: [DB('exert')] }));
    g = attack(g, ox, P(1));
    g = endTurn(g);
    // 相手の攻撃には反撃する
    const foe = putMonster(g, 1, MON(1, 9));
    g = attack(g, foe, M(ox));
    expect(monster(g, foe)!.hp).toBe(6);
    g = endTurn(g);
    expect(battle.attackBlockReason(g, monster(g, ox)!)).toBe('消耗：このターンは攻撃できない');
    expect(battle.legalActions(g, 0).some((a) => a.type === 'attack')).toBe(false);
    g = endTurn(endTurn(g));
    expect(battle.attackBlockReason(g, monster(g, ox)!)).toBeNull();
    // 混乱の自動攻撃もしない
    g = attack(g, ox, P(1));
    monster(g, ox)!.status.confusePending = true;
    const hp = g.players[1].hp;
    g = endTurn(endTurn(g));
    expect(g.players[1].hp).toBe(hp);
    expect(logText(g)).not.toContain('混乱で対象はランダム');
  });

  it('枯朽：いなければ使えない。召喚時は自分を選べない。体力0で破壊（ダメージではない）', () => {
    let g = rich(startGame());
    const wilt = SPELL([fx({ id: 'draw', value: 1, target: 'self' })], { drawbacks: [DB('blight', { value: 2, timing: 'play' })] });
    const u = giveCard(g, 0, wilt);
    expect(actError(g, { type: 'playCard', player: 0, cardUid: u })).toBe('枯朽にするモンスターがいません');
    const small = putMonster(g, 0, MON(3, 2, { keywords: [{ id: 'undying' }] }));
    g = play(g, u);
    expect(monster(g, small)).toBeUndefined(); // 不屈は効かない
    const big = putMonster(g, 0, MON(3, 9));
    const beast = MON(4, 4, { drawbacks: [DB('blight', { value: 1, timing: 'summon' })] });
    const bu = giveCard(g, 0, beast);
    g = play(g, bu);
    expect(g.pending).toBeNull(); // 自分は選べないので1体だけ → 自動
    expect(monster(g, big)).toMatchObject({ attack: 2, hp: 8 });
    expect(monster(g, bu)).toMatchObject({ attack: 4, hp: 4 });
  });

  it('捨て札の除外：足りなければ使えない。枚数は選ぶ、コスト合計は足りなければ古い順に足す', () => {
    let g = rich(startGame());
    const feast = SPELL([fx({ id: 'draw', value: 1, target: 'self' })], { drawbacks: [DB('exileDiscard', { value: 2, timing: 'play', option: 'count' })] });
    const u = giveCard(g, 0, feast);
    toDiscard(g, 0, SKILL, 1);
    expect(actError(g, { type: 'playCard', player: 0, cardUid: u })).toBe('捨て札が足りません');
    toDiscard(g, 0, ATTACK, 2);
    g = play(g, u);
    expect(g.pending).toMatchObject({ min: 2, max: 2 });
    const pick = g.pending!.options.slice(1).map((o) => o.id);
    g = act(g, { type: 'choose', player: 0, picks: pick });
    expect(g.players[0].exile.map((c) => c.uid)).toEqual(pick);
    // コスト合計4：コスト1×3＋コスト3。1枚だけ選ぶと古い順に足す
    let h = rich(startGame());
    h.players[0].discard = [];
    const c1 = card({ id: 'c1', name: '一', cost: 1, effects: [fx({ id: 'heal', value: 1, target: 'self' })] });
    const c3 = card({ id: 'c3', name: '三', cost: 3, effects: [fx({ id: 'heal', value: 1, target: 'self' })] });
    toDiscard(h, 0, c1, 3);
    toDiscard(h, 0, c3, 1);
    const evidence = SPELL([fx({ id: 'draw', value: 1, target: 'self' })], { drawbacks: [DB('exileDiscard', { value: 4, timing: 'play', option: 'costSum' })] });
    h = play(h, giveCard(h, 0, evidence));
    h = act(h, { type: 'choose', player: 0, picks: [h.pending!.options[0]!.id] });
    expect(h.players[0].exile).toHaveLength(4);
    expect(logText(h)).toContain('古い順に足した');
  });
});

// ---------------------------------------------------------------- 価格の確かめ（仕様の例）
describe('価格の確かめ（仕様の例・倍率1）', () => {
  const ok = (c: CardDef) => {
    const a = analyzeCard(c);
    expect(a.violations, c.name).toEqual([]);
    return a;
  };
  it('仕様の例が作れる', () => {
    // 喊声1：攻撃力2・体力3のコスト2コモン
    const warcry = card({ name: '喊声', cost: 2, stats: { attack: 2, hp: 3, defense: 0 }, effects: [fx({ id: 'pump', value: 1, timing: 'attack', target: 'otherAllies' })] });
    ok(warcry);
    expect(pointsOf(warcry)).toBe(9); // 1.5×2.0×2.7＝8.1→9（#146 で他の全体 1.8→2.7）
    // 鼓舞2
    expect(pointsOf(card({ rarity: 'legend', cost: 5, stats: { attack: 1, hp: 1, defense: 0 }, effects: [fx({ id: 'train', value: 2, timing: 'summon', target: 'weakestAlly' })] }))).toBe(9);
    // お互い、カードを2枚引く＝4：コスト0のコモン（上限3）では作れないので、レア（上限6）で確かめる
    expect(codes(analyzeCard(card({ name: '共有', cost: 0, effects: [fx({ id: 'draw', value: 2, target: 'bothPlayers' })] })).violations)).toEqual(['POINTS_OVER_CAP']);
    ok(card({ name: '共有', rarity: 'rare', cost: 0, effects: [fx({ id: 'draw', value: 2, target: 'bothPlayers' })] }));
    // 次の自分のターン開始時に、相手1体に7ダメージ＝16（コスト1コモン 15 を超える）→ 6ダメージ＝14 なら作れる
    expect(codes(analyzeCard(card({ name: '時限', cost: 1, effects: [fx({ id: 'damage', value: 7, mods: ['nextTurn'] })] })).violations)).toEqual(['POINTS_OVER_CAP']);
    ok(card({ name: '時限', cost: 1, effects: [fx({ id: 'damage', value: 6, mods: ['nextTurn'] })] }));
    // 引いたとき、カードを1枚引く＝4：コスト0の上限（コモン3）を超えるので、レアで作れる
    ok(card({ name: '奇跡', rarity: 'rare', cost: 1, effects: [fx({ id: 'draw', value: 1, timing: 'drawn', target: 'self' })] }));
  });

  it('作成例4枚は今まで通り作れる', () => {
    for (const c of Object.values(EXAMPLES)) expect(analyzeCard(c).violations, c.name).toEqual([]);
  });
});

// ---------------------------------------------------------------- CPU
describe('CPU（○ バッチA）', () => {
  it('選択の方針：枯朽は死なない一番安いもの、捨て札の除外はノイズ・呪いから、濫用はどうせ消えるもの（トークンなど）だけ', () => {
    // 枯朽2：体力1は死ぬので、体力9の弱いほうを選ぶ
    let g = rich(startGame());
    const frail = putMonster(g, 0, MON(5, 1));
    const sturdy = putMonster(g, 0, MON(1, 9));
    g = play(g, giveCard(g, 0, SPELL([fx({ id: 'draw', value: 1, target: 'self' })], { drawbacks: [DB('blight', { value: 2, timing: 'play' })] })));
    expect(ai.cpuAction(g, 0, 1, 'normal')).toEqual({ type: 'choose', player: 0, picks: [sturdy] });
    g = act(g, ai.cpuAction(g, 0, 1, 'normal'));
    expect(monster(g, frail)).toBeDefined();
    // 捨て札の除外（枚数2）：ノイズ → 呪い
    let h = rich(startGame());
    h.players[0].discard = [];
    toDiscard(h, 0, SKILL, 2);
    toDiscard(h, 0, CURSE, 1);
    h.players[0].discard.push({ uid: 'nz', cardId: battle.NOISE_CARD_ID, owner: 0 });
    h = play(h, giveCard(h, 0, SPELL([fx({ id: 'draw', value: 1, target: 'self' })], { drawbacks: [DB('exileDiscard', { value: 2, timing: 'play', option: 'count' })] })));
    const a = ai.cpuAction(h, 0, 1, 'normal');
    const curseUid = h.players[0].discard.find((c) => c.cardId.endsWith('curseA'))!.uid;
    expect(a).toEqual({ type: 'choose', player: 0, picks: ['nz', curseUid] });
    // 濫用：トークンを生け贄にして相手に5ダメージ（すべての強さで合法手）。トークンがいなければ選ばない
    let k = rich(startGame());
    k = play(k, giveCard(k, 0, SPELL([fx({ id: 'token', value: 1, hits: 1, target: 'self' })])));
    putMonster(k, 0, MON(6, 9));
    k = play(k, giveCard(k, 0, SPELL([fx({ id: 'damage', value: 5, condition: 'exploit' })])), { enemy: P(1) });
    const tokenUid = k.players[0].board.find((m) => m.card.token)!.uid;
    for (const level of ai.CPU_LEVELS) {
      const choice = ai.cpuAction(k, 0, 1, level);
      expect(battle.validateAction(k, choice), level).toBeNull();
    }
    expect(ai.cpuAction(k, 0, 1, 'normal')).toEqual({ type: 'choose', player: 0, picks: [tokenUid] });
    k = act(k, ai.cpuAction(k, 0, 1, 'normal'));
    expect(k.players[1].hp).toBe(115);
    k = play(k, giveCard(k, 0, SPELL([fx({ id: 'damage', value: 5, condition: 'exploit' })])), { enemy: P(1) });
    expect(ai.cpuAction(k, 0, 1, 'normal')).toEqual({ type: 'choose', player: 0, picks: [] });
  });

  // 新しい要素を詰めたデッキ（すべて作れるカード）
  const m = (id: string, name: string, a: number, h: number, extra: Partial<CardDef> = {}) => card({ id, name, cost: 2, stats: { attack: a, hp: h, defense: 0 }, ...extra });
  const s = (id: string, name: string, effects: EffectInstance[], extra: Partial<CardDef> = {}) => card({ id, name, effects, ...extra });
  const cards: CardDef[] = [
    s('trap', '罠の矢', [fx({ id: 'damage', value: 3, condition: 'enemyPlayedMany' }), fx({ id: 'damage', value: 2 })]),
    m('vet', '古強者', 2, 4, { effects: [fx({ id: 'damage', value: 3, timing: 'attack', condition: 'veteran' })] }),
    m('trainee', '訓練兵', 1, 3, { cost: 1, effects: [fx({ id: 'train', value: 1, timing: 'attack', target: 'thisMonster', condition: 'strongerAlly' })] }),
    s('team', '連携', [fx({ id: 'draw', value: 2, target: 'self', condition: 'totalAttack' }), fx({ id: 'heal', value: 2, target: 'self' })]),
    m('battalion', '大隊長', 2, 4, { effects: [fx({ id: 'damage', value: 2, timing: 'attack', target: 'random', condition: 'twoAllyAttacks' })] }),
    s('coven', '集会', [fx({ id: 'heal', value: 3, target: 'self', condition: 'coven' }), fx({ id: 'draw', value: 1, target: 'self', condition: 'coven' })]),
    s('delirium', '昂揚', [fx({ id: 'damage', value: 4, condition: 'delirium' })]),
    s('critical', '窮地', [fx({ id: 'heal', value: 5, target: 'self', condition: 'criticalHp' }), fx({ id: 'draw', value: 1, target: 'self' })]),
    s('raid', '集団戦術', [fx({ id: 'draw', value: 2, target: 'self', condition: 'bigDamageThisTurn' }), fx({ id: 'damage', value: 2 })]),
    s('spellcraft', '魔巧', [fx({ id: 'damage', value: 4, condition: 'skillsInDiscard' })]),
    s('infusion', '注入', [fx({ id: 'draw', value: 2, target: 'self', condition: 'healedThisTurn' }), fx({ id: 'heal', value: 2, target: 'self' })]),
    s('corrupt', '堕落', [fx({ id: 'poison', value: 2 }), fx({ id: 'damage', value: 4, condition: 'enemyPoisonHigh' })]),
    s('surge', '怒濤', [fx({ id: 'damage', value: 4, condition: 'notFirstCard' })]),
    s('clash', '激突', [fx({ id: 'damage', value: 6, condition: 'clash' }), fx({ id: 'draw', value: 1, target: 'self' })]),
    m('exploit', '濫用の魔物', 2, 3, { effects: [fx({ id: 'damage', value: 4, timing: 'summon', condition: 'exploit' })] }),
    s('miracle', '奇跡', [fx({ id: 'draw', value: 1, timing: 'drawn', target: 'self' }), fx({ id: 'damage', value: 3 })], { rarity: 'rare' }),
    m('heroic', '英雄', 1, 3, { cost: 1, effects: [fx({ id: 'pump', value: 2, timing: 'targeted', target: 'thisMonster' })] }),
    s('rally', '鼓舞の声', [fx({ id: 'train', value: 1, target: 'chosen' }), fx({ id: 'pump', value: 2, target: 'chosen' })]),
    s('prowess', '演目', [fx({ id: 'draw', value: 1, timing: 'bigCardPlayed', target: 'self' })], { rarity: 'rare', cost: 2 }),
    s('big', '大技', [fx({ id: 'damage', value: 8 }), fx({ id: 'heal', value: 3, target: 'self' })], { cost: 3 }),
    m('warcry', '喊声の戦士', 2, 3, { effects: [fx({ id: 'pump', value: 1, timing: 'attack', target: 'otherAllies' })] }),
    s('bolster', '鼓舞', [fx({ id: 'train', value: 2, target: 'weakestAlly' })]),
    s('both', '共有', [fx({ id: 'draw', value: 2, target: 'bothPlayers' }), fx({ id: 'loot', value: 1, target: 'bothPlayers' })], { rarity: 'rare', cost: 0 }),
    s('bomb', '時限爆弾', [fx({ id: 'damage', value: 6, mods: ['nextTurn'] })]),
    s('grave', '宿根', [fx({ id: 'damage', value: 2, mods: ['perDiscardMonster'] })]),
    m('legend', '伝説の竜', 3, 5, { drawbacks: [DB('legendary'), DB('exert')] }),
    m('blight', '枯朽の獣', 4, 5, { drawbacks: [DB('blight', { value: 2, timing: 'summon' })] }),
    s('feast', '給餌', [fx({ id: 'damage', value: 5 }), fx({ id: 'draw', value: 1, target: 'self' })], { drawbacks: [DB('exileDiscard', { value: 5, timing: 'play', option: 'count' }), DB('selfDamage', { value: 1, timing: 'play' })] }),
    s('evidence', '証拠収集', [fx({ id: 'damage', value: 5 }), fx({ id: 'draw', value: 1, target: 'self' })], { drawbacks: [DB('exileDiscard', { value: 10, timing: 'play', option: 'costSum' }), DB('selfDamage', { value: 1, timing: 'play' })] }),
  ];
  const counts: Record<string, number> = Object.fromEntries(cards.map((c) => [c.id, 1]));
  counts.bomb = 2;
  const deck = { v: 1 as const, id: 'mtgA', name: 'MTG-A', entries: Object.entries(counts).map(([cardId, count]) => ({ cardId, count })) };

  it('カードとデッキはすべて作れる（30枚）', () => {
    for (const c of cards) expect(analyzeCard(c).violations, c.name).toEqual([]);
    expect(analyzeDeck(deck, new Map(cards.map((c) => [c.id, c]))).violations).toEqual([]);
  });

  const runGame = (seed: number, level: ai.CpuLevel) => {
    const opp = PRESET_DECKS[seed % PRESET_DECKS.length]!;
    const r = battle.createGame({ seed, players: [{ name: 'MTG-A', deck, cards }, { name: opp.name, deck: opp.deck, cards: opp.cards }] });
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
});
