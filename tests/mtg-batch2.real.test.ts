// MTG 要素の採用：バッチ2を実際の倍率（20）で確かめる
import { describe, expect, it } from 'vitest';
import { BALANCE, analyzeCard, battle, describeEffect, fromBaseScale, listKeywords } from '../src/engine/index.ts';
import { card } from './helpers.ts';

const filler = fromBaseScale(card({ id: 'f', name: '薬', effects: [{ id: 'heal', value: 1, timing: 'play', target: 'self', condition: null }] }));
const setup = (name: string): battle.PlayerSetup => ({ name, deck: { v: 1, id: 'd', name: 'd', entries: [{ cardId: 'f', count: 30 }] }, cards: [filler] });

function started(): battle.GameState {
  const r = battle.createGame({ seed: 1, first: 0, players: [setup('P0'), setup('P1')] });
  if (!r.ok) throw new Error(r.error);
  let g = r.state;
  for (const p of [0, 1] as const) {
    const n = battle.applyAction(g, { type: 'mulligan', player: p, mode: 'keep' });
    if (!n.ok) throw new Error(n.error);
    g = n.state;
  }
  return g;
}

describe('バッチ2（実際の倍率）', () => {
  it('量・ポイントには倍率を掛け、数（体数・枚数・ターン・トークンの上限）には掛けない', () => {
    expect(BALANCE.battle.doomCap).toBe(100);
    expect(BALANCE.battle.maxTokens).toBe(5);
    expect(BALANCE.effects.token.maxValue).toBe(100);
    expect(BALANCE.effects.token.maxTokens).toBe(3);
    expect(BALANCE.effects.scry.maxValue).toBe(5);
    expect(BALANCE.keywords.deathtouch.flat).toBe(120);
    expect(BALANCE.drawbacks.lifespan.byTurns).toEqual([120, 80, 40]);
    expect(listKeywords().find((k) => k.id === 'bushido')!.value!.default).toBe(20);
  });

  it('仕様の例が実際の倍率でも作れる', () => {
    const cards = [
      card({ id: 'a', name: '小鬼の群れ', cost: 1, effects: [{ id: 'token', value: 1, hits: 2, timing: 'play', target: 'self', condition: null }] }),
      card({ id: 'b', name: '毒蛇', rarity: 'rare', cost: 1, stats: { attack: 1, hp: 2, defense: 0 }, keywords: [{ id: 'deathtouch' }] }),
      card({ id: 'c', name: '呪いの言葉', cost: 1, effects: [{ id: 'doom', value: 1, timing: 'play', target: 'enemyPlayer', condition: null }] }),
      card({ id: 'd', name: '侍', cost: 1, stats: { attack: 2, hp: 2, defense: 0 }, keywords: [{ id: 'bushido', value: 1 }] }),
      card({ id: 'e', name: '壁', cost: 2, stats: { attack: 3, hp: 8, defense: 0 }, keywords: [{ id: 'taunt' }], drawbacks: [{ id: 'defender', timing: null }] }),
      card({ id: 'f2', name: '短命', cost: 1, stats: { attack: 4, hp: 3, defense: 0 }, drawbacks: [{ id: 'decay', timing: null }, { id: 'lifespan', value: 1, timing: null }] }),
    ].map(fromBaseScale);
    for (const c of cards) expect(analyzeCard(c).violations, c.name).toEqual([]);
    expect(cards[0]!.effects[0]).toMatchObject({ value: 20, hits: 2 });
    expect(cards[5]!.drawbacks[1]).toMatchObject({ value: 1 });
    expect(describeEffect(cards[0]!.effects[0]!)).toBe('攻撃力20・体力20の小鬼を2体出す。');
  });

  it('対戦：トークンの強さ・呪縛の上限・武士道は倍率込み', () => {
    let g = started();
    g.players[0].energy = 20;
    const tok = fromBaseScale(card({ id: 't', name: 't', effects: [{ id: 'token', value: 2, hits: 1, timing: 'play', target: 'self', condition: null }] }));
    const doom = fromBaseScale(card({ id: 'dm', name: 'dm', effects: [{ id: 'doom', value: 2, timing: 'play', target: 'enemyPlayer', condition: null }] }));
    for (const [i, def] of [tok, doom, doom, doom].entries()) {
      g.cards[`p0:${def.id}`] = def;
      g.players[0].hand.push({ uid: `u${i}`, cardId: `p0:${def.id}`, owner: 0 });
      const n = battle.applyAction(g, { type: 'playCard', player: 0, cardUid: `u${i}` });
      if (!n.ok) throw new Error(n.error);
      g = n.state;
    }
    expect(g.players[0].board[0]).toMatchObject({ attack: 40, hp: 40 });
    expect(g.players[1].status.doom).toBe(100);
    const e = battle.applyAction(g, { type: 'endTurn', player: 0 });
    if (!e.ok) throw new Error(e.error);
    expect(e.state.players[1].hp).toBe(BALANCE.battle.playerHp - 100);
  });
});
