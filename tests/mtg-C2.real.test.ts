// MTG 要素 ○ バッチC2 を実際の倍率（20）で確かめる
import { describe, expect, it } from 'vitest';
import { BALANCE, analyzeCard, battle, fromBaseScale, type CardDef, type EffectInstance } from '../src/engine/index.ts';
import { TEMPLATES } from '../src/ui/editor/templates.ts';
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

function give(g: battle.GameState, def: CardDef): string {
  g.cards[`p0:${def.id}`] = def;
  const uid = `g${def.id}`;
  g.players[0].hand.push({ uid, cardId: `p0:${def.id}`, owner: 0 });
  return uid;
}

describe('○ バッチC2（実際の倍率）', () => {
  it('ポイント・量には倍率を掛け、速度・引く枚数・モードの数・必要数には掛けない', () => {
    expect(BALANCE.effects.startEngine).toEqual({ flat: 40 });
    expect(BALANCE.effects.crown).toEqual({ flat: 200 });
    expect(BALANCE.speed).toEqual({ start: 1, max: 4 });
    expect(BALANCE.crown).toEqual({ extraDraw: 1 });
    expect(BALANCE.modal).toEqual({ otherRate: 0.3, maxModes: 3 });
    expect(BALANCE.abilities.charge).toMatchObject({ min: 2, max: 5 });
    expect(BALANCE.abilities.entwine).toEqual({ rate: 0.4, maxExtra: 2 });
  });

  it('価格の例（倍率20）：次のうち1つ（5ダメージ／2枚引く）は 300＋160−112＝348', () => {
    const c = fromBaseScale(card({ id: 'm', name: '火か知恵か', rarity: 'rare', cost: 1, effects: [fx({ id: 'damage', value: 5, mode: 1 }), fx({ id: 'draw', value: 2, target: 'self', mode: 2 })] }));
    const a = analyzeCard(c);
    expect(a.violations).toEqual([]);
    expect(a.points.lines.find((l) => l.label === 'モード選択の割引')!.value).toBe(-112);
    expect(a.points.total + BALANCE.card.costPoints[1]!).toBe(348);
  });

  it('製造・暴動のテンプレートは倍率20でも作れる', () => {
    for (const t of TEMPLATES.filter((x) => x.id === 'fabricate' || x.id === 'riot')) expect(analyzeCard(t.build(`r-${t.id}`)).valid, t.id).toBe(true);
  });

  it('モード・種族・王冠が倍率20の数値で動く', () => {
    let g = started();
    g.players[0].energy = 10;
    const modal = fromBaseScale(card({ id: 'm', name: '火か知恵か', rarity: 'rare', cost: 1, effects: [fx({ id: 'damage', value: 5, mode: 1 }), fx({ id: 'draw', value: 2, target: 'self', mode: 2 })] }));
    const hp = g.players[1].hp;
    g = act(g, { type: 'playCard', player: 0, cardUid: give(g, modal), chosen: { enemy: { kind: 'player', player: 1 } }, mode: 1 });
    expect(g.players[1].hp).toBe(hp - 100);
    const beast = fromBaseScale(card({ id: 'b', name: '狼', cost: 1, tribe: 'beast', stats: { attack: 1, hp: 2, defense: 0 } }));
    g = act(g, { type: 'playCard', player: 0, cardUid: give(g, beast), chosen: {} });
    const lord = fromBaseScale(card({ id: 'l', name: '遠吠え', cost: 1, tribe: 'beast', effects: [fx({ id: 'train', value: 1, target: 'tribeAllies' })] }));
    g = act(g, { type: 'playCard', player: 0, cardUid: give(g, lord), chosen: {} });
    expect(g.players[0].board[0]).toMatchObject({ attack: 40, hp: 60 });
    const crown = fromBaseScale(card({ id: 'c', name: '戴冠', cost: 1, effects: [fx({ id: 'crown', target: 'self' })] }));
    g = act(g, { type: 'playCard', player: 0, cardUid: give(g, crown), chosen: {} });
    expect(g.crown).toBe(0);
  });
});
