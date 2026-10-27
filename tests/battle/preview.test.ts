// ダメージの見込み（決定事項 #137）：previewAction は実際に解決したときと同じ数字を、見え方の状態（viewFor）から出す
import { describe, expect, it } from 'vitest';
import { BALANCE, battle } from '../../src/engine/index.ts';
import { card } from '../helpers.ts';
import { M, P, fx, giveCard, monster, putMonster, rich, startGame } from './helpers.ts';

const B = BALANCE.battle;
const legend = (effects: ReturnType<typeof fx>[], extra: Partial<Parameters<typeof card>[0]> = {}) =>
  card({ id: `L${Math.random().toString(36).slice(2, 8)}`, rarity: 'legend', cost: 5, effects, ...extra });
const unit = (attack: number, hp: number, defense = 0, extra: Partial<Parameters<typeof card>[0]> = {}) =>
  card({ id: `U${attack}${hp}${defense}${Math.random().toString(36).slice(2, 6)}`, rarity: 'legend', cost: 5, stats: { attack, hp, defense }, ...extra });

const hitOn = (p: battle.ActionPreview | null, t: battle.TargetRef) =>
  p?.hits.find((h) => (t.kind === 'player' ? h.target.kind === 'player' && h.target.player === t.player : h.target.kind === 'monster' && h.target.uid === t.uid));

describe('ダメージの見込み', () => {
  it('守備力を引いた数字と、倒せるか', () => {
    const g = rich(startGame());
    const d = putMonster(g, 1, unit(1, 6, 2));
    const uid = giveCard(g, 0, legend([fx({ id: 'damage', value: 9 })]));
    const view = battle.viewFor(g, 0);
    const p = battle.previewAction(view, { type: 'playCard', player: 0, cardUid: uid, chosen: { enemy: M(d) } });
    const h = hitOn(p, M(d))!;
    expect(h.dealt).toBe(7);
    expect(h.hpLost).toBe(6);
    expect(h.destroyed).toBe(true);
    expect(h.steps.join()).toContain('守備力−2');
    expect(h.random).toBe(false);
    // 元の状態はそのまま
    expect(monster(g, d)!.hp).toBe(6);
  });

  it('聖盾は0、シールドは肩代わり、プレイヤーの HP の減り', () => {
    const g = rich(startGame());
    const d = putMonster(g, 1, unit(1, 6, 0, { keywords: [{ id: 'divineShield' }] }));
    g.players[1].shield = 3;
    const all = giveCard(g, 0, legend([fx({ id: 'damage', value: 5, target: 'enemyAll' })]));
    const p = battle.previewAction(battle.viewFor(g, 0), { type: 'playCard', player: 0, cardUid: all, chosen: {} });
    const m = hitOn(p, M(d))!;
    expect(m.blocked).toContain('divineShield');
    expect(m.hpLost).toBe(0);
    const pl = hitOn(p, P(1))!;
    expect(pl.shieldUsed).toBe(3);
    expect(pl.hpLost).toBe(2);
    expect(pl.hpAfter).toBe(g.players[1].hp - 2);
  });

  it('攻撃：相手へのダメージと、受ける反撃。やけどの半減も入る', () => {
    const g = startGame();
    const a = putMonster(g, 0, unit(8, 10));
    const d = putMonster(g, 1, unit(6, 20, 1));
    monster(g, a)!.status.burn = 1;
    const p = battle.previewAction(battle.viewFor(g, 0), { type: 'attack', player: 0, attackerUid: a, target: M(d) });
    expect(hitOn(p, M(d))!.dealt).toBe(3); // 8 → やけどで4 → 守備力1で3
    expect(hitOn(p, M(a))!.hpLost).toBe(6); // 反撃
  });

  it('決着する行動は ends、ランダムな対象は random', () => {
    const g = rich(startGame());
    g.players[1].hp = 4;
    const kill = giveCard(g, 0, legend([fx({ id: 'damage', value: 5 })]));
    const p = battle.previewAction(battle.viewFor(g, 0), { type: 'playCard', player: 0, cardUid: kill, chosen: { enemy: P(1) } });
    expect(p!.ends).toEqual({ winner: 0 });
    const g2 = rich(startGame());
    for (let i = 0; i < 4; i++) putMonster(g2, 1, unit(1, 30));
    const rnd = giveCard(g2, 0, legend([fx({ id: 'damage', value: 3, target: 'random' })]));
    const q = battle.previewAction(battle.viewFor(g2, 0), { type: 'playCard', player: 0, cardUid: rnd, chosen: {} });
    expect(q!.random).toBe(true);
  });

  it('できない行動は null', () => {
    const g = startGame();
    const a = putMonster(g, 0, unit(1, 5));
    expect(battle.previewAction(battle.viewFor(g, 0), { type: 'attack', player: 1, attackerUid: a, target: P(0) })).toBeNull();
    expect(B.exhaustCap).toBeGreaterThan(0);
  });
});
