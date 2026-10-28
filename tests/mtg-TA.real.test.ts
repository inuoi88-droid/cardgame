// MTG 要素 △ バッチA を実際の倍率（20）で確かめる
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

describe('△ バッチA（実際の倍率）', () => {
  it('量と固定ポイントには倍率を掛け、枚数・上限・ターン数・割合には掛けない', () => {
    expect(BALANCE.effects.rad).toEqual({ perCount: 24, maxCount: 3 });
    expect(BALANCE.effects.guard).toEqual({ indestructible: 160, protection: 140 });
    expect(BALANCE.effects.incubate).toEqual({ perValue: 3, base: 10, maxValue: 100 });
    expect(BALANCE.effects.perpetual).toEqual({ perValue: 4, maxValue: 40, cardCap: 100 });
    expect(BALANCE.keywords.reach).toEqual({ flat: 40 });
    expect(BALANCE.drawbacks.cumulativeUpkeep).toEqual({ perValue: 4, minValue: 20, maxValue: 40, maxAge: 6 });
    expect(BALANCE.battle).toMatchObject({ radCap: 10, radDamage: 20, expCap: 10, iceCap: 1, eggHatchTurns: 2, indestructibleHp: 20 });
    expect(BALANCE.modifierParams).toMatchObject({ expCountCap: 5, gambleRates: [0.5, 1, 1.5], gambleStep: 10 });
  });

  it('価格の例（倍率20）：罠のパワー「攻撃してきたモンスターに5ダメージ」＝300×1.2＝360、培養3＝60×3＋10＝190', () => {
    const trap = fromBaseScale(card({ id: 't', name: '落とし穴', rarity: 'rare', cost: 1, effects: [fx({ id: 'damage', value: 5, timing: 'enemyAttacked', target: 'attacker' })], abilities: [{ id: 'trap' }] }));
    const a = analyzeCard(trap);
    expect(a.violations).toEqual([]);
    expect(a.points.lines.find((l) => l.kind === 'effect')!.value).toBe(360);
    const egg = analyzeCard(fromBaseScale(card({ id: 'e', name: '孵卵', cost: 2, effects: [fx({ id: 'incubate', value: 3, target: 'self' })] })));
    expect(egg.points.lines.find((l) => l.kind === 'effect')!.value).toBe(190);
  });

  it('ばらつきは量の刻み（倍率20では10）に切り捨て、不壊は体力20で踏みとどまる、放射能は1枚20ダメージ', () => {
    // ばらつき：4×20＝80 → 40・80・120 のどれか
    for (let seed = 1; seed <= 6; seed++) {
      const r = battle.createGame({ seed, first: 0, players: [setup('P0'), setup('P1')] });
      if (!r.ok) throw new Error(r.error);
      let g = act(act(r.state, { type: 'mulligan', player: 0, mode: 'keep' }), { type: 'mulligan', player: 1, mode: 'keep' });
      g.players[0].energy = 10;
      const hp = g.players[1].hp;
      g = act(g, { type: 'playCard', player: 0, cardUid: give(g, fromBaseScale(card({ id: 'd', name: '運', effects: [fx({ id: 'damage', value: 4, target: 'chosen', mods: ['gamble'] })] }))), chosen: { enemy: { kind: 'player', player: 1 } } });
      expect([40, 80, 120]).toContain(hp - g.players[1].hp);
    }
    let g = started();
    g.players[0].energy = 10;
    const mon = fromBaseScale(card({ id: 'm', name: '盾兵', cost: 1, stats: { attack: 1, hp: 3, defense: 0 } }));
    g = act(g, { type: 'playCard', player: 0, cardUid: give(g, mon), chosen: {} });
    const uid = g.players[0].board[0]!.uid;
    g = act(g, { type: 'playCard', player: 0, cardUid: give(g, fromBaseScale(card({ id: 'gd', name: '守り', effects: [fx({ id: 'guard', option: 'indestructible' })] }))), chosen: { ally: uid } });
    g = act(g, { type: 'playCard', player: 0, cardUid: give(g, fromBaseScale(card({ id: 'x', name: '矢', effects: [fx({ id: 'damage', value: 9, target: 'chosen' })] }))), chosen: { enemy: { kind: 'player', player: 1 } } });
    g = act(g, { type: 'endTurn', player: 0 });
    g.players[1].energy = 10;
    g = act(g, { type: 'playCard', player: 1, cardUid: give(g, fromBaseScale(card({ id: 'y', name: '矢', effects: [fx({ id: 'damage', value: 9, target: 'chosen' })] })), 1), chosen: { enemy: { kind: 'monster', uid } } });
    expect(g.players[0].board[0]!.hp).toBe(20);
    g.players[0].status.rad = 2;
    const before = g.players[0].hp;
    g = act(g, { type: 'endTurn', player: 1 });
    // 山札はすべて呪文（モンスター以外）なので 2枚×20
    expect(before - g.players[0].hp).toBe(40);
    expect(g.players[0].status.rad).toBe(0);
  });
});
