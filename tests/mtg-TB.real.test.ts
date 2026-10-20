// MTG 要素 △ バッチB を実際の倍率（20）で確かめる
import { describe, expect, it } from 'vitest';
import { BALANCE, analyzeCard, battle, fromBaseScale, type CardDef, type EffectInstance } from '../src/engine/index.ts';
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

describe('△ バッチB（実際の倍率）', () => {
  it('量と固定ポイントには倍率を掛け、回数・エナジー・割合には掛けない', () => {
    expect(BALANCE.abilities.prototype).toEqual({ perCost: 40, maxCut: 3, step: 10 });
    expect(BALANCE.abilities.lifePay).toEqual({ perEnergy: 40, hpPerEnergy: 40, max: 2 });
    expect(BALANCE.abilities.embalm).toMatchObject({ eternalStats: 80, eternalFlat: 40, rate: [0.4, 0.3, 0.2] });
    expect(BALANCE.abilities.unleash).toEqual({ perValue: 2, minValue: 20, maxValue: 40 });
    expect(BALANCE.abilities.casualty).toMatchObject({ minValue: 20, maxValue: 60 });
    expect(BALANCE.abilities.harmonize).toMatchObject({ attackPerEnergy: 40, maxCut: 3 });
    expect(BALANCE.abilities.tiered).toMatchObject({ surcharge: [0, 1, 2], perEnergy: 200 });
    expect(BALANCE.abilities.squad).toMatchObject({ minCost: 2, maxCost: 4, maxTimes: 2 });
    expect(BALANCE.keywords.enlist).toEqual({ flat: 60 });
    expect(BALANCE.battle).toMatchObject({ maxPitchPerTurn: 1, maxDredgePerTurn: 1 });
    expect([BALANCE.timing.renew, BALANCE.timing.forecast, BALANCE.condition.bargained]).toEqual([0.9, 1, 0.6]);
  });

  it('作れる：解鎖20・犠牲20・貪食20（量の能力は倍率で入力）。ポイントは倍率1の20倍', () => {
    const unleash = fromBaseScale(card({ id: 'u', name: '暴れ牛', rarity: 'common', cost: 2, stats: { attack: 2, hp: 3, defense: 0 }, abilities: [{ id: 'unleash', value: 1 }] }));
    expect(unleash.abilities).toEqual([{ id: 'unleash', value: 20 }]);
    const a = analyzeCard(unleash);
    expect(a.violations).toEqual([]);
    expect(a.points.lines.find((l) => l.kind === 'ability')?.value).toBe(40);
  });

  it('試作は刻み10に切り捨て・血の支払いは HP40・永遠のコピーは80/80', () => {
    let g = started();
    const proto = fromBaseScale(card({ id: 'p', name: '試作機', rarity: 'common', cost: 3, stats: { attack: 5, hp: 3, defense: 0 }, abilities: [{ id: 'prototype', value: 2 }] }));
    g = act(g, { type: 'playCard', player: 0, cardUid: give(g, proto), alt: 'prototype' });
    expect([g.players[0].board[0]!.attack, g.players[0].board[0]!.hp]).toEqual([50, 30]);
    const blood = fromBaseScale(card({ id: 'b', name: '血', rarity: 'common', cost: 2, effects: [fx({ id: 'damage', value: 3 })], abilities: [{ id: 'lifePay', value: 1 }] }));
    const hp = g.players[0].hp;
    g = act(g, { type: 'playCard', player: 0, cardUid: give(g, blood), chosen: { enemy: { kind: 'player', player: 1 } }, lifePay: 1 });
    expect(g.players[0].hp).toBe(hp - 40);
    const mummy = fromBaseScale(card({ id: 'm', name: '木乃伊', rarity: 'common', cost: 2, stats: { attack: 1, hp: 1, defense: 0 }, abilities: [{ id: 'embalm', value: 1, option: 'eternal' }] }));
    const uid = give(g, mummy);
    g.players[0].discard.push(...g.players[0].hand.splice(g.players[0].hand.findIndex((c) => c.uid === uid), 1));
    g = act(g, { type: 'discardAbility', player: 0, cardUid: uid, ability: 'embalm' });
    const t = g.players[0].board.at(-1)!;
    expect([t.attack, t.hp]).toEqual([80, 80]);
  });
});
