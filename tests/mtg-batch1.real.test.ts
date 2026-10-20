// MTG 要素の採用：バッチ1を実際の倍率（20）で確かめる
import { describe, expect, it } from 'vitest';
import { BALANCE, analyzeCard, battle, describeEffect, fromBaseScale, CONDITIONS } from '../src/engine/index.ts';
import { card } from './helpers.ts';

const filler = fromBaseScale(card({ id: 'f', name: '薬', effects: [{ id: 'heal', value: 1, timing: 'play', target: 'self', condition: null }] }));
const setup = (name: string): battle.PlayerSetup => ({ name, deck: { v: 1, id: 'd', name: 'd', entries: [{ cardId: 'f', count: 30 }] }, cards: [filler] });

describe('バッチ1（実際の倍率）', () => {
  it('量の条件は倍率を掛け、数の条件・上限は掛けない', () => {
    expect(BALANCE.conditionParams.bigMonsterAttack).toBe(80);
    expect(BALANCE.conditionParams.discardMin).toBe(10);
    expect(BALANCE.modifierParams.scaleCountCap).toBe(3);
    expect(BALANCE.battle.maxRepeatTriggersPerTurn).toBe(2);
    expect(CONDITIONS.bigMonster.textPrefix).toBe('攻撃力80以上の自分のモンスターがいれば、');
  });

  it('仕様の例が実際の倍率でも作れる', () => {
    const cards = [
      card({ id: 'a', name: '追い打ち', cost: 2, effects: [{ id: 'damage', value: 13, timing: 'play', target: 'chosen', condition: 'enemyDamagedThisTurn' }] }),
      card({ id: 'b', name: '全力の一撃', cost: 1, effects: [{ id: 'damage', value: 4, timing: 'play', target: 'chosen', condition: null, mods: ['xEnergy'] }] }),
      card({ id: 'c', name: '鼓舞の旗', rarity: 'rare', cost: 1, effects: [{ id: 'attackUp', value: 1, timing: 'allySummoned', target: 'chosen', condition: null }] }),
    ].map(fromBaseScale);
    for (const c of cards) expect(analyzeCard(c).violations, c.name).toEqual([]);
    expect(describeEffect(cards[1]!.effects[0]!)).toBe('残りのエナジーをすべて使い、相手1体に80ダメージを与える（数値は使ったエナジー1につき）。');
  });

  it('X の値は 1枚のダメージの上限（倍率込み）で頭打ち', () => {
    const r = battle.createGame({
      seed: 1,
      first: 0,
      players: [setup('P0'), setup('P1')],
    });
    if (!r.ok) throw new Error(r.error);
    let g = r.state;
    for (const p of [0, 1] as const) {
      const n = battle.applyAction(g, { type: 'mulligan', player: p, mode: 'keep' });
      if (!n.ok) throw new Error(n.error);
      g = n.state;
    }
    const x = fromBaseScale(card({ id: 'x', name: '全力', effects: [{ id: 'damage', value: 10, timing: 'play', target: 'chosen', condition: null, mods: ['xEnergy'] }] }));
    g.cards['p0:x'] = x;
    g.players[0].hand.push({ uid: 'xx', cardId: 'p0:x', owner: 0 });
    g.players[0].energy = 6;
    const s = battle.applyAction(g, { type: 'playCard', player: 0, cardUid: 'xx', chosen: { enemy: { kind: 'player', player: 1 } } });
    if (!s.ok) throw new Error(s.error);
    expect(s.state.players[1].hp).toBe(BALANCE.battle.playerHp - BALANCE.params.damagePerCardMax);
    expect(s.state.players[0].energy).toBe(0);
  });
});
