// ○ の MTG 要素の統合レビュー（決定事項 #95）で見つけた不具合の再現テスト。倍率1
import { describe, expect, it } from 'vitest';
import { BALANCE, battle, type CardDef } from '../src/engine/index.ts';
import { card } from './helpers.ts';
import { act, fx, giveCard, startGame } from './battle/helpers.ts';
import { buildEvents } from '../src/ui/battle/events.ts';

type G = battle.GameState;

let seq = 0;
const MON = (a: number, h: number, extra: Partial<CardDef> = {}) =>
  card({ id: `xm${++seq}`, name: `獣${seq}`, rarity: 'legend', cost: 1, stats: { attack: a, hp: h, defense: 0 }, ...extra });

/** 元のカード（uid）が、どこに何回あるか */
function count(g: G, uid: string): number {
  let n = 0;
  for (const ps of g.players) {
    for (const z of [ps.deck, ps.hand, ps.discard, ps.exile]) n += z.filter((c) => c.uid === uid).length;
    n += ps.board.filter((m) => m.card.uid === uid).length;
  }
  return n;
}

describe('決着で使っている途中のカードを片付ける', () => {
  it('召喚時に生け贄になったモンスターのカードは、決着で捨て札に2枚にならない', () => {
    const g = startGame();
    g.players[0].energy = 9;
    g.players[1].hp = 1;
    const def = MON(1, 1, { effects: [fx({ id: 'damage', value: 5, timing: 'summon', target: 'enemyPlayer', condition: 'exploit' })] });
    const uid = giveCard(g, 0, def);
    let s = act(g, { type: 'playCard', player: 0, cardUid: uid, chosen: {} });
    // 濫用：自分自身を生け贄にする
    expect(s.pending?.step.t).toBe('exploitChoice');
    s = act(s, { type: 'choose', player: 0, picks: [uid] });
    expect(s.phase).toBe('ended');
    expect(count(s, uid)).toBe(1);
  });
});

const SPELL = (effects: CardDef['effects'], extra: Partial<CardDef> = {}) =>
  card({ id: `xs${++seq}`, name: `呪文${seq}`, rarity: 'legend', cost: 1, effects, ...extra });
const DRAW1 = fx({ id: 'draw', value: 1, target: 'self' });
function toDiscard(g: G, p: battle.PlayerId, def: CardDef): string {
  g.cards[`p${p}:${def.id}`] = def;
  const uid = `xd${++seq}`;
  g.players[p].discard.push({ uid, cardId: `p${p}:${def.id}`, owner: p });
  return uid;
}
const where = (g: G, uid: string) =>
  g.players.flatMap((ps, p) => (['deck', 'hand', 'discard', 'exile'] as const).filter((z) => ps[z].some((c) => c.uid === uid)).map((z) => `${p}.${z}`));

describe('新しい仕組みどうしの組み合わせ', () => {
  it('フラッシュバック＋再利用：捨て札から使ったら除外が先（手札に戻らない）', () => {
    const g = startGame();
    g.players[0].energy = 9;
    const uid = toDiscard(g, 0, SPELL([DRAW1], { abilities: [{ id: 'flashback', value: 0 }, { id: 'buyback' }] }));
    const s = act(g, { type: 'playCard', player: 0, cardUid: uid, chosen: {}, from: 'discard' });
    expect(where(s, uid)).toEqual(['0.exile']);
  });

  it('再活のカードが封殺で無効になっても、捨て札に戻らず除外される', () => {
    const g = startGame();
    g.players[0].energy = 9;
    g.players[0].quash = { kind: 'any', until: g.turnIndex + 1 };
    const uid = toDiscard(g, 0, SPELL([DRAW1], { abilities: [{ id: 'jumpStart' }] }));
    const junk = giveCard(g, 0, SPELL([DRAW1]));
    const s = act(g, { type: 'playCard', player: 0, cardUid: uid, chosen: {}, from: 'discard', discardUid: junk });
    expect(s.log.some((l) => l.text.includes('封殺'))).toBe(true);
    expect(where(s, uid)).toEqual(['0.exile']);
  });

  it('パワーの起動は封殺に当たらず、使った枚数・「カードを使うたび」にも数えない', () => {
    const g = startGame();
    g.players[0].energy = 9;
    g.players[0].quash = { kind: 'any', until: g.turnIndex + 1 };
    const def = SPELL([fx({ id: 'damage', value: 2, timing: 'activated', target: 'enemyPlayer' })], { abilities: [{ id: 'activate', value: 1 }] });
    g.cards[`p0:${def.id}`] = def;
    g.players[0].powers.push({ uid: 'pwA', cardId: `p0:${def.id}`, name: def.name, effects: [{ effect: def.effects[0]!, removed: false }], drawbacks: [] });
    const hp = g.players[1].hp;
    const s = act(g, { type: 'activate', player: 0, sourceUid: 'pwA', chosen: {} });
    expect(s.players[1].hp).toBe(hp - 2);
    expect(s.players[0].quash).toBeDefined();
    expect(s.players[0].turn.cardsPlayed).toBe(0);
  });

  it('居住で増やしても、トークンは1人の上限まで', () => {
    const g = startGame();
    g.players[0].energy = 9;
    g.players[0].board = [];
    // 小鬼を上限まで出してから居住
    const tok = SPELL([fx({ id: 'token', value: 1, target: 'self' })]);
    let s = g;
    for (let i = 0; i < 6; i++) s = act(s, { type: 'playCard', player: 0, cardUid: giveCard(s, 0, { ...tok, cost: 0 }), chosen: {} });
    const pop = SPELL([fx({ id: 'populate', target: 'self' })], { cost: 0 });
    s = act(s, { type: 'playCard', player: 0, cardUid: giveCard(s, 0, pop), chosen: {} });
    if (s.pending) s = act(s, { type: 'choose', player: 0, picks: [s.pending.options[0]!.id] });
    expect(battle.tokenCount(s, 0)).toBe(BALANCE.battle.maxTokens);
  });
});

describe('演出：パワーの札を光らせる（統合 #95）', () => {
  it('パワーの起動・英雄譚の章は、プレイヤーの枠ではなくパワーの札（パワーの uid）を光らせる', () => {
    const g = startGame();
    g.players[0].energy = 9;
    const saga = SPELL([fx({ id: 'draw', value: 1, timing: 'chapter1', target: 'self' }), fx({ id: 'draw', value: 1, timing: 'chapter2', target: 'self' })], { name: '物語' });
    const from = g.log.length;
    const s = act(g, { type: 'playCard', player: 0, cardUid: giveCard(g, 0, saga), chosen: {} });
    const pw = s.players[0].powers[0]!;
    const shows = buildEvents(s.log.slice(from), s, 0, 1).map((e) => e.show);
    expect(shows).toEqual(expect.arrayContaining([expect.objectContaining({ t: 'notice', key: pw.uid })]));

    const def = SPELL([fx({ id: 'damage', value: 2, timing: 'activated', target: 'enemyPlayer' })], { abilities: [{ id: 'activate', value: 1 }] });
    s.cards[`p0:${def.id}`] = def;
    s.players[0].powers.push({ uid: 'pwB', cardId: `p0:${def.id}`, name: def.name, effects: [{ effect: def.effects[0]!, removed: false }], drawbacks: [] });
    const from2 = s.log.length;
    const t = act(s, { type: 'activate', player: 0, sourceUid: 'pwB', chosen: {} });
    const shows2 = buildEvents(t.log.slice(from2), t, 0, 1).map((e) => e.show);
    expect(shows2).toEqual(expect.arrayContaining([expect.objectContaining({ t: 'activate', key: 'pwB' })]));
  });
});
