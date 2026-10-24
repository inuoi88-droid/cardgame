// MTG 要素 △ バッチD（リーダー・フィールド・昼と夜）を実際の倍率（20）で確かめる
import { describe, expect, it } from 'vitest';
import { BALANCE, FIELDS, LEADERS, analyzeCard, battle, fromBaseScale, type CardDef, type EffectInstance } from '../src/engine/index.ts';
import { card } from './helpers.ts';

const filler = fromBaseScale(card({ id: 'f', name: '薬', effects: [{ id: 'heal', value: 1, timing: 'play', target: 'self', condition: null }] }));
const setup = (name: string, leader?: battle.PlayerSetup['leader']): battle.PlayerSetup => ({
  name,
  deck: { v: 1, id: 'd', name: 'd', entries: [{ cardId: 'f', count: 30 }] },
  cards: [filler],
  ...(leader ? { leader } : {}),
});
const fx = (e: Partial<EffectInstance> & { id: string }): EffectInstance => ({ timing: 'play', target: 'chosen', condition: null, ...e });

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

describe('△ バッチD（実際の倍率）', () => {
  it('量と固定ポイントには倍率を掛け、枚数・エナジー・ターン・割合には掛けない', () => {
    expect(BALANCE.leaders).toEqual({
      knight: { hp: 200 },
      mage: { firstHand: 1 },
      summoner: { hp: 20 },
      alchemist: { everyTurns: 4, energy: 1 },
      scholar: { everyTurns: 2, draw: 1 },
    });
    expect(BALANCE.fields).toEqual({ volcano: { attack: 10 }, library: { draw: 1 }, sanctuary: { heal: 40 }, arena: { enabled: false }, market: { discount: 1 }, fog: { rate: 0.25 }, planarEvery: 6 });
    expect(BALANCE.effects.setField).toEqual({ flat: 120 });
    expect(BALANCE.dayNight).toEqual({ toNight: 0, toDay: 2 });
    expect(BALANCE.draft).toEqual({ rounds: 15, offer: 3, copies: 2, field: 6, takes: 15 });
    expect([BALANCE.condition.isDay, BALANCE.condition.isNight]).toEqual([0.6, 0.6]);
    // 説明文の数字も実際の倍率
    expect(LEADERS.knight.description).toContain('+200');
    expect(FIELDS.volcano.description).toContain('+10');
  });

  it('効果「フィールド」は 120pt（コスト1のコモンでも作れる）', () => {
    const c = fromBaseScale(card({ id: 'v', name: '火山', rarity: 'common', cost: 1, effects: [fx({ id: 'setField', target: 'self', option: 'volcano' })] }));
    const a = analyzeCard(c);
    expect(a.violations).toEqual([]);
    expect(a.points.lines.find((l) => l.kind === 'effect')?.value).toBe(120);
  });

  it('騎士は HP 2600、召喚士は出たモンスターの体力+20、火山で攻撃力+10（統合 #101 で 20→10）、霧で顔へのダメージ75%', () => {
    const r = battle.createGame({ seed: 1, first: 0, players: [setup('P0', 'knight'), setup('P1', 'summoner')], rules: { field: 'random' } });
    if (!r.ok) throw new Error(r.error);
    let g = r.state;
    for (const p of [0, 1] as const) g = act(g, { type: 'mulligan', player: p, mode: 'keep' });
    expect(g.players[0].maxHp).toBe(2600);
    g.field = { id: 'volcano', by: null, since: 0 };
    g = act(g, { type: 'endTurn', player: 0 });
    g.players[1].energy = 10;
    const m = fromBaseScale(card({ id: 'm', name: '獣', rarity: 'common', cost: 1, stats: { attack: 2, hp: 3, defense: 0 } }));
    const uid = give(g, m, 1);
    g = act(g, { type: 'playCard', player: 1, cardUid: uid, chosen: {} });
    const mon = g.players[1].board[0]!;
    expect([mon.hp, mon.maxHp]).toEqual([80, 80]);
    expect(battle.effectiveAttack(g, mon)).toBe(50);
    g.field = { id: 'fog', by: null, since: 0 };
    g = act(g, { type: 'endTurn', player: 1 });
    g = act(g, { type: 'endTurn', player: 0 });
    g = act(g, { type: 'attack', player: 1, attackerUid: mon.uid, target: { kind: 'player', player: 0 } });
    expect(g.players[0].hp).toBe(2600 - 30);
  });
});
