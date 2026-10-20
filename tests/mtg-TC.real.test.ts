// MTG 要素 △ バッチC を実際の倍率（20）で確かめる
import { describe, expect, it } from 'vitest';
import { BALANCE, analyzeCard, battle, fromBaseScale, timingMultiplier, type CardDef, type EffectInstance } from '../src/engine/index.ts';
import { card } from './helpers.ts';

const filler = fromBaseScale(card({ id: 'f', name: '薬', effects: [{ id: 'heal', value: 1, timing: 'play', target: 'self', condition: null }] }));
const setup = (name: string): battle.PlayerSetup => ({ name, deck: { v: 1, id: 'd', name: 'd', entries: [{ cardId: 'f', count: 30 }] }, cards: [filler] });
const fx = (e: Partial<EffectInstance> & { id: string }): EffectInstance => ({ timing: 'play', target: 'chosen', condition: null, ...e });

function started(): battle.GameState {
  const r = battle.createGame({ seed: 1, first: 0, players: [setup('P0'), setup('P1')] });
  if (!r.ok) throw new Error(r.error);
  let g = r.state;
  for (const p of [0, 1] as const) g = act(g, { type: 'mulligan', player: p, mode: 'keep' });
  g.players[0].energy = 10;
  return g;
}

function act(g: battle.GameState, a: battle.Action): battle.GameState {
  const r = battle.applyAction(g, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function give(g: battle.GameState, def: CardDef, p: battle.PlayerId = 0): string {
  g.cards[`p${p}:${def.id}`] = def;
  const uid = `g${def.id}${g.players[p].hand.length}`;
  g.players[p].hand.push({ uid, cardId: `p${p}:${def.id}`, owner: p });
  return uid;
}

describe('△ バッチC（実際の倍率）', () => {
  it('量と固定ポイントには倍率を掛け、回数・エナジー・ターン・割合には掛けない', () => {
    expect(BALANCE.abilities.foretell).toEqual({ setCost: 2, base: 40, perCut: 120, maxCut: 2 });
    expect(BALANCE.abilities.evolve).toEqual({ flat: 20, perValue: 2.7, minValue: 20, maxValue: 60 });
    expect(BALANCE.abilities.levelUp).toMatchObject({ perValue: 5, maxCost: 3, maxValue: 40 });
    expect(BALANCE.abilities.altWin).toEqual({ flat: 600, goals: { cards: 12, turns: 4, board: 5 } });
    expect(BALANCE.effects.siege).toEqual({ flat: 20, minValue: 40, maxValue: 120 });
    expect(BALANCE.effects.swapHp).toEqual({ flat: 600, gainCapRate: 0.5 });
    expect(BALANCE.battle).toMatchObject({ maxWaiting: 5, maxLevel: 3, loyaltyMax: 9, faceDownStats: 40, faceDownWard: 1, maxEmblems: 1, maxSieges: 1, altWinEarliestTurn: 8 });
    // 砦の体力は倍率で入力し、倍率1の数字（2〜6）で倍率表を引く
    expect([40, 60, 120].map((v) => timingMultiplier('siegeWon', 'spell', undefined, { effects: [{ id: 'siege', value: v }] }))).toEqual([0.9, 0.8, 0.5]);
  });

  it('作れる：進化20（量の能力は倍率で入力）。ポイントは倍率1の20倍', () => {
    const ev = fromBaseScale(card({ id: 'e', name: '幼竜', rarity: 'common', cost: 2, stats: { attack: 2, hp: 2, defense: 0 }, abilities: [{ id: 'evolve', value: 1, condition: 'veteran' }] }));
    expect(ev.abilities).toEqual([{ id: 'evolve', value: 20, condition: 'veteran' }]);
    const a = analyzeCard(ev);
    expect(a.violations).toEqual([]);
    expect(a.points.lines.find((l) => l.kind === 'ability')?.value).toBe(74);
  });

  it('裏向きは攻撃力・体力40、砦は体力60で置かれる', () => {
    let g = started();
    const d = fromBaseScale(card({ id: 'd', name: '覆面', rarity: 'common', cost: 3, stats: { attack: 3, hp: 4, defense: 0 }, abilities: [{ id: 'disguise', value: 1 }] }));
    const uid = give(g, d);
    g = act(g, { type: 'playCard', player: 0, cardUid: uid, alt: 'faceDown' });
    expect([g.players[0].board[0]!.attack, g.players[0].board[0]!.hp]).toEqual([40, 40]);
    g = act(g, { type: 'reveal', player: 0, uid });
    expect([g.players[0].board[0]!.attack, g.players[0].board[0]!.hp]).toEqual([60, 80]);
    const s = fromBaseScale(card({ id: 's', name: '砦', rarity: 'common', cost: 1, effects: [fx({ id: 'siege', value: 3, target: 'self' })] }));
    g = act(g, { type: 'playCard', player: 0, cardUid: give(g, s) });
    expect(g.players[1].board[0]!.hp).toBe(60);
  });
});
