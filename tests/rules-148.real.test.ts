// ユーザー指示（2026-10-31。決定事項 #148）：最低ダメージを無くす（守備力以下のダメージは攻撃・反撃・効果のどれも0）
import { describe, expect, it } from 'vitest';
import { battle, type CardDef } from '../src/engine/index.ts';
import { act, emptyStatus, giveCard, putMonster, rich, startGame, M } from './battle/helpers.ts';

const base = { v: 1, icon: 'gi:small-fire', scale: 20, drawbacks: [], keywords: [] };
const def = (d: Record<string, unknown>) => ({ ...base, ...d }) as unknown as CardDef;
const mon = (id: string, attack: number, hp: number, defense: number) => def({ id, name: id, rarity: 'common', cost: 1, stats: { attack, hp, defense }, effects: [] });
const hpOf = (g: battle.GameState, uid: string) => [...g.players[0].board, ...g.players[1].board].find((m) => m.uid === uid)!.hp;

describe('最低ダメージは無い：守備力以下のダメージは0', () => {
  it('攻撃力が守備力より低い攻撃は0。反撃も守備力以下なら0', () => {
    let g = startGame();
    const a = putMonster(g, 0, mon('a', 20, 60, 40));
    const d = putMonster(g, 1, mon('d', 20, 60, 40));
    g = act(g, { type: 'attack', player: 0, attackerUid: a, target: M(d) });
    expect(hpOf(g, d)).toBe(60);
    expect(hpOf(g, a)).toBe(60);
  });
  it('攻撃力と守備力が同じでも0、上回ったぶんだけ通る', () => {
    let g = startGame();
    const a = putMonster(g, 0, mon('a', 60, 100, 0));
    const d = putMonster(g, 1, mon('d', 0, 100, 60));
    const b = putMonster(g, 0, mon('b', 80, 100, 0));
    g = act(g, { type: 'attack', player: 0, attackerUid: a, target: M(d) });
    expect(hpOf(g, d)).toBe(100);
    g = act(g, { type: 'attack', player: 0, attackerUid: b, target: M(d) });
    expect(hpOf(g, d)).toBe(80);
  });
  it('カードの効果のダメージも守備力以下なら0', () => {
    let g = startGame();
    rich(g, 0);
    const d = putMonster(g, 1, mon('d', 0, 100, 40));
    const bolt = def({ id: 'bolt', name: 'いかずち', rarity: 'common', cost: 1, stats: null, effects: [{ id: 'damage', value: 40, target: 'chosen', timing: 'play', condition: null }] });
    g = act(g, { type: 'playCard', player: 0, cardUid: giveCard(g, 0, bolt), chosen: { enemy: M(d) } });
    expect(hpOf(g, d)).toBe(100);
    expect(g.log.some((e) => e.text.includes('最低'))).toBe(false);
  });
  it('守備力で0になった攻撃には出血が乗らない', () => {
    let g = startGame();
    const a = putMonster(g, 0, mon('a', 20, 60, 0));
    const d = putMonster(g, 1, mon('d', 0, 100, 40), { status: { ...emptyStatus(), bleed: 20 } });
    g = act(g, { type: 'attack', player: 0, attackerUid: a, target: M(d) });
    expect(hpOf(g, d)).toBe(100);
  });
});
