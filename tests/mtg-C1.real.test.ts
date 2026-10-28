// MTG 要素 ○ バッチC1 を実際の倍率（20）で確かめる
import { describe, expect, it } from 'vitest';
import { BALANCE, analyzeCard, battle, createAbility, fromBaseScale, type CardDef, type EffectInstance } from '../src/engine/index.ts';
import { card } from './helpers.ts';

const filler = fromBaseScale(card({ id: 'f', name: '薬', effects: [{ id: 'heal', value: 1, timing: 'play', target: 'self', condition: null }] }));
const setup = (name: string): battle.PlayerSetup => ({ name, deck: { v: 1, id: 'd', name: 'd', entries: [{ cardId: 'f', count: 30 }] }, cards: [filler] });
const fx = (e: Partial<EffectInstance> & { id: string }): EffectInstance => ({ timing: 'play', target: 'chosen', condition: null, ...e });

function started(): battle.GameState {
  const r = battle.createGame({ seed: 1, first: 0, players: [setup('P0'), setup('P1')] });
  if (!r.ok) throw new Error(r.error);
  let g = r.state;
  for (const p of [0, 1] as const) g = act(g, { type: 'mulligan', player: p, mode: 'keep' });
  return g;
}

function act(g: battle.GameState, a: battle.Action): battle.GameState {
  const r = battle.applyAction(g, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function put(g: battle.GameState, zone: 'hand' | 'discard', def: CardDef): string {
  g.cards[`p0:${def.id}`] = def;
  const uid = `g${def.id}`;
  g.players[0][zone].push({ uid, cardId: `p0:${def.id}`, owner: 0 });
  return uid;
}

describe('○ バッチC1（実際の倍率）', () => {
  it('ポイントには倍率を掛け、エナジー・枚数・回数には掛けない', () => {
    const A = BALANCE.abilities;
    expect(A.flashback).toMatchObject({ rateByExtra: [0.5, 0.4, 0.3], fromDiscardFlat: 20, maxExtra: 2 });
    expect(A.escape).toMatchObject({ minCount: 2, maxCount: 5 });
    expect(A.cycling).toEqual({ flat: 40, cost: 1 });
    expect(A.affinity).toEqual({ perStep: 80, maxReduction: 3, minCost: 2, minPrintedCost: 2 });
    expect(A.costCut).toEqual({ perStep: 260, maxReduction: 2, minCost: 0 });
    expect(BALANCE.timing.activatedMonster).toEqual([2.2, 1.6, 1.1]);
    expect(BALANCE.conditionByKicker).toEqual([0.6, 0.45]);
    expect(createAbility('activate')).toEqual({ id: 'activate', value: 1 });
    expect(createAbility('escape')).toEqual({ id: 'escape', value: 3 });
  });

  it('価格の例（倍率20）：フラッシュバックの火の雨は 450、親和コスト4は 160（下限2：決定事項 #133）', () => {
    const fb = fromBaseScale(card({ id: 'fb', name: '火の雨', cost: 2, effects: [fx({ id: 'damage', value: 5 })], abilities: [{ id: 'flashback', value: 0 }] }));
    expect(analyzeCard(fb).violations).toEqual([]);
    expect(analyzeCard(fb).points.total + BALANCE.card.costPoints[2]!).toBe(450);
    const aff = fromBaseScale(card({ id: 'af', name: '嵐', rarity: 'epic', cost: 4, effects: [fx({ id: 'damage', value: 5 })], abilities: [{ id: 'affinity' }] }));
    expect(analyzeCard(aff).points.lines.find((l) => l.kind === 'ability')!.value).toBe(160);
  });

  it('捨て札から使う・起動・サイクリングが倍率20の数値で動く', () => {
    let g = started();
    g.players[0].energy = 10;
    const fb = fromBaseScale(card({ id: 'fb', name: '火の雨', cost: 1, effects: [fx({ id: 'damage', value: 5 })], abilities: [{ id: 'flashback', value: 1 }] }));
    const uid = put(g, 'discard', fb);
    const hp = g.players[1].hp;
    g = act(g, { type: 'playCard', player: 0, cardUid: uid, from: 'discard', chosen: { enemy: { kind: 'player', player: 1 } } });
    expect(g.players[1].hp).toBe(hp - 100);
    expect(g.players[0].energy).toBe(8);
    expect(g.players[0].exile.some((c) => c.uid === uid)).toBe(true);
    const cyc = fromBaseScale(card({ id: 'cy', name: '流星', cost: 5, effects: [fx({ id: 'damage', value: 5 })], abilities: [{ id: 'cycling' }] }));
    const c = put(g, 'hand', cyc);
    g = act(g, { type: 'handAbility', player: 0, cardUid: c, ability: 'cycling' });
    expect(g.players[0].energy).toBe(7);
  });
});
