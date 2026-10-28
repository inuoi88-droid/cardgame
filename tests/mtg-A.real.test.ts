// MTG 要素 ○ バッチAを実際の倍率（20）で確かめる
import { describe, expect, it } from 'vitest';
import { BALANCE, CONDITIONS, analyzeCard, battle, createDrawback, describeEffect, fromBaseScale, listDrawbacks } from '../src/engine/index.ts';
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

function act(g: battle.GameState, a: battle.Action): battle.GameState {
  const r = battle.applyAction(g, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('○ バッチA（実際の倍率）', () => {
  it('量・ポイントには倍率を掛け、数（枚数・回数・件数・コスト）には掛けない', () => {
    const cp = BALANCE.conditionParams;
    expect([cp.totalAttackMin, cp.bigDamageMin, cp.enemyPoisonMin]).toEqual([160, 120, 60]);
    expect([cp.enemyCardsMin, cp.veteranAttacks, cp.allyAttacksMin, cp.covenMin, cp.deliriumMin, cp.skillsInDiscardMin, cp.notFirstCardFrom]).toEqual([3, 3, 2, 3, 3, 2, 2]);
    expect(BALANCE.timingParams.bigCardCost).toBe(3);
    expect(BALANCE.battle.maxDelayedPerPlayer).toBe(6);
    expect(BALANCE.modifierParams.discardCountCap).toBe(5);
    expect(BALANCE.drawbacks.legendary.fixed).toBe(40);
    expect(BALANCE.drawbacks.exileDiscard).toMatchObject({ perCard: 16, perCost: 8, maxCount: 5, maxCost: 10 });
    expect(listDrawbacks().find((d) => d.id === 'blight')!.value).toMatchObject({ default: 20, max: 100 });
    // 捨て札の除外の枚数・コスト合計は「数」（倍率を掛けない）
    expect(createDrawback('exileDiscard', 'spell')).toMatchObject({ value: 3 });
    expect(CONDITIONS.totalAttack.label).toBe('自分のモンスターの攻撃力の合計が160以上');
  });

  it('仕様の例が実際の倍率でも作れる（ポイントは倍率1の20倍）', () => {
    const cards = [
      card({ id: 'a', name: '喊声', cost: 2, stats: { attack: 2, hp: 3, defense: 0 }, effects: [{ id: 'pump', value: 1, timing: 'attack', target: 'otherAllies', condition: null }] }),
      card({ id: 'b', name: '共有', rarity: 'rare', cost: 0, effects: [{ id: 'draw', value: 2, timing: 'play', target: 'bothPlayers', condition: null }] }),
      card({ id: 'c', name: '時限', cost: 1, effects: [{ id: 'damage', value: 6, timing: 'play', target: 'chosen', condition: null, mods: ['nextTurn'] }] }),
      card({ id: 'd', name: '奇跡', rarity: 'rare', cost: 1, effects: [{ id: 'draw', value: 1, timing: 'drawn', target: 'self', condition: null }] }),
      card({
        id: 'e',
        name: '枯朽の獣',
        cost: 2,
        stats: { attack: 4, hp: 5, defense: 0 },
        drawbacks: [{ id: 'blight', value: 2, timing: 'summon' }],
      }),
      card({
        id: 'f2',
        name: '給餌',
        cost: 1,
        effects: [{ id: 'damage', value: 5, timing: 'play', target: 'chosen', condition: null }],
        drawbacks: [
          { id: 'exileDiscard', value: 5, timing: 'play', option: 'count' },
          { id: 'selfDamage', value: 1, timing: 'play' },
        ],
      }),
    ].map(fromBaseScale);
    for (const c of cards) expect(analyzeCard(c).violations, c.name).toEqual([]);
    expect(cards[2]!.effects[0]).toMatchObject({ value: 120 });
    expect(cards[4]!.drawbacks[0]).toMatchObject({ value: 40 });
    expect(cards[5]!.drawbacks[0]).toMatchObject({ value: 5, option: 'count' });
    expect(describeEffect(cards[2]!.effects[0]!)).toBe('次の自分のターン開始時に、相手1体に120ダメージを与える。');
    expect(analyzeCard(cards[0]!).points.lines.find((l) => l.kind === 'effect')!.value).toBe(162); // 1.5×20 × 2.0 × 2.7（#146）
  });

  it('対戦：予約したダメージが次の自分のターンに倍率込みで入る。激突の条件の量も倍率込み', () => {
    let g = started();
    g.players[0].energy = 20;
    const bomb = fromBaseScale(card({ id: 'bomb', name: '時限', effects: [{ id: 'damage', value: 6, timing: 'play', target: 'chosen', condition: null, mods: ['nextTurn'] }] }));
    g.cards['p0:bomb'] = bomb;
    g.players[0].hand.push({ uid: 'u1', cardId: 'p0:bomb', owner: 0 });
    g = act(g, { type: 'playCard', player: 0, cardUid: 'u1', chosen: { enemy: { kind: 'player', player: 1 } } });
    expect(g.players[1].hp).toBe(BALANCE.battle.playerHp);
    g = act(act(g, { type: 'endTurn', player: 0 }), { type: 'endTurn', player: 1 });
    expect(g.players[1].hp).toBe(BALANCE.battle.playerHp - 120);
    expect(g.players[0].turn.enemyDamageTotal).toBe(120);
  });
});
