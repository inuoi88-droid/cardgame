// MTG 要素 ○ バッチBを実際の倍率（20）で確かめる
import { describe, expect, it } from 'vitest';
import { BALANCE, analyzeCard, battle, createAbility, createEffect, describeEffect, fromBaseScale, getKeyword, listAbilities, parseCard, type CardDef } from '../src/engine/index.ts';
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

function give(g: battle.GameState, p: battle.PlayerId, def: CardDef): string {
  g.cards[`p${p}:${def.id}`] = def;
  const uid = `g${def.id}`;
  g.players[p].hand.push({ uid, cardId: `p${p}:${def.id}`, owner: p });
  return uid;
}

describe('○ バッチB（実際の倍率）', () => {
  it('量・ポイントには倍率を掛け、数（枚数・ターン・コスト・回数）には掛けない', () => {
    const E = BALANCE.effects;
    expect(E.equip).toMatchObject({ perValue: 3, flat: 60, maxValue: 100 });
    expect(E.slay).toMatchObject({ flat: 200, perCost: 100, maxValue: 5 });
    expect(E.borrow.byTurns).toEqual([280, 440, 560]);
    expect(E.cascade).toMatchObject({ flat: 80, perCost: 160, maxValue: 4, maxReveal: 10 });
    expect(E.offspring.stat).toBe(20);
    expect(E.discover.look).toBe(3);
    expect(E.boon).toMatchObject({ perValueUse: 2.5, maxValue: 100, maxUses: 3 });
    expect(BALANCE.keywords.ward).toMatchObject({ perValue: 60, maxValue: 2 });
    expect(BALANCE.abilities.grow).toMatchObject({ perValue: 4.5, maxValue: 60, maxGrow: 200 });
    expect([BALANCE.battle.maxFreePlayDepth, BALANCE.battle.maxArmy, BALANCE.battle.rampCap, BALANCE.card.maxAbilities]).toEqual([2, 1, 1, 2]);
    // 入力欄：量は倍率つき、数はそのまま
    expect(createEffect('equip', 'spell').value).toBe(20);
    expect(createEffect('slay', 'spell').value).toBe(2);
    expect(createEffect('conjure', 'spell')).toMatchObject({ value: 20, hits: 1 });
    expect(createAbility('grow')).toEqual({ id: 'grow', value: 20 });
    expect(getKeyword('ward')!.value).toMatchObject({ default: 1, max: 2 });
    expect(getKeyword('inspire')!.value).toMatchObject({ default: 20, max: 60 });
    expect(describeEffect({ ...createEffect('offspring', 'monster'), timing: 'summon' })).toBe('召喚時、このモンスターの攻撃力20・体力20のコピーを出す。');
  });

  it('仕様の例が実際の倍率でも作れる（ポイントは倍率1の20倍）', () => {
    const cards = [
      card({ id: 'a', name: '剣', cost: 1, effects: [{ id: 'equip', value: 2, timing: 'play', target: 'chosen', condition: null }] }),
      card({ id: 'b', name: '討伐', cost: 2, effects: [{ id: 'slay', value: 2, timing: 'play', target: 'chosen', condition: null }] }),
      card({ id: 'c', name: '借用', rarity: 'rare', cost: 1, effects: [{ id: 'borrow', value: 1, timing: 'play', target: 'chosen', condition: null }] }),
      card({ id: 'd', name: '続唱', rarity: 'rare', cost: 2, effects: [{ id: 'cascade', value: 2, timing: 'play', target: 'self', condition: null }] }),
      card({ id: 'e', name: '封殺', rarity: 'rare', cost: 2, effects: [{ id: 'quash', timing: 'play', target: 'enemyPlayer', condition: null }] }),
      card({ id: 'f2', name: '激励', cost: 1, stats: { attack: 1, hp: 3, defense: 0 }, keywords: [{ id: 'inspire', value: 1 }] }),
      card({ id: 'g', name: '反復', rarity: 'rare', cost: 2, effects: [{ id: 'damage', value: 5, timing: 'play', target: 'chosen', condition: null }], abilities: [{ id: 'rebound' }] }),
    ].map(fromBaseScale);
    for (const c of cards) expect(analyzeCard(c).violations, c.name).toEqual([]);
    expect(analyzeCard(cards[0]!).points.lines.find((l) => l.kind === 'effect')!.value).toBe(180);
    expect(analyzeCard(cards[6]!).points.lines.find((l) => l.kind === 'ability')!.value).toBe(210);
  });

  it('能力の値は取り込みで倍率がそろう（成長は量）', () => {
    const old = card({ id: 'o', name: '成長の矢', cost: 1, effects: [{ id: 'damage', value: 2, timing: 'play', target: 'chosen', condition: null }], abilities: [{ id: 'grow', value: 1 }] });
    const r = parseCard(old);
    expect(r.ok && r.value.abilities).toEqual([{ id: 'grow', value: 20 }]);
    expect(listAbilities()).toHaveLength(15);
  });

  it('対戦：成長・恩恵・動員・応召が実際の倍率で動く', () => {
    let g = started();
    g.players[0].energy = 20;
    const arrow = fromBaseScale(card({ id: 'gr', name: '成長の矢', cost: 1, effects: [{ id: 'damage', value: 2, timing: 'play', target: 'chosen', condition: null }], abilities: [{ id: 'grow', value: 1 }] }));
    const uid = give(g, 0, arrow);
    g = act(g, { type: 'playCard', player: 0, cardUid: uid, chosen: { enemy: { kind: 'player', player: 1 } } });
    expect(g.players[1].hp).toBe(BALANCE.battle.playerHp - 40);
    expect(g.players[0].discard.find((c) => c.uid === uid)!.grow).toBe(20);
    const amass = fromBaseScale(card({ id: 'am', name: '動員', cost: 1, effects: [{ id: 'amass', value: 2, timing: 'play', target: 'self', condition: null }] }));
    g = act(g, { type: 'playCard', player: 0, cardUid: give(g, 0, amass) });
    expect(g.players[0].board.find((m) => m.card.cardId === battle.ARMY_CARD_ID)).toMatchObject({ attack: 40, hp: 40 });
    const mob = fromBaseScale(card({ id: 'mb', name: '応召', cost: 1, effects: [{ id: 'token', value: 1, hits: 1, option: 'mobilize', timing: 'play', target: 'self', condition: null }] }));
    g = act(g, { type: 'playCard', player: 0, cardUid: give(g, 0, mob) });
    const tk = g.players[0].board.find((m) => m.card.token?.temp)!;
    g = act(g, { type: 'attack', player: 0, attackerUid: tk.uid, target: { kind: 'player', player: 1 } });
    expect(g.players[1].hp).toBe(BALANCE.battle.playerHp - 60);
    g = act(g, { type: 'endTurn', player: 0 });
    expect(g.players[0].board.some((m) => m.card.token?.temp)).toBe(false);
  });
});
