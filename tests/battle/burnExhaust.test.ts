// やけど・脱力（決定事項 #137）：与えるダメージの半減・1発の上限。モンスターは攻撃・反撃（格闘も）、プレイヤーは自分の効果のダメージ。
// 倍率1（上限は x(5)＝5）
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/engine/index.ts';
import { card } from '../helpers.ts';
import { M, P, act, attack, fx, giveCard, logText, monster, play, putMonster, rich, startGame } from './helpers.ts';

const B = BALANCE.battle;
const legend = (effects: ReturnType<typeof fx>[], extra: Partial<Parameters<typeof card>[0]> = {}) =>
  card({ id: `L${Math.random().toString(36).slice(2, 8)}`, rarity: 'legend', cost: 5, effects, ...extra });
const unit = (attack: number, hp: number, extra: Partial<Parameters<typeof card>[0]> = {}) =>
  card({ id: `U${attack}${hp}${Math.random().toString(36).slice(2, 6)}`, rarity: 'legend', cost: 5, stats: { attack, hp, defense: 0 }, ...extra });

describe('やけど：与えるダメージが半分', () => {
  it('やけどのモンスターの攻撃は半分（守備側の反撃はそのまま）', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(6, 20));
    const d = putMonster(g, 1, unit(2, 30));
    monster(g, a)!.status.burn = 1;
    g = attack(g, a, M(d));
    expect(monster(g, d)!.hp).toBe(27);
    expect(monster(g, a)!.hp).toBe(18);
    expect(logText(g)).toContain('やけどで3');
  });

  it('プレイヤーのやけど：自分のカードのダメージが半分。モンスターの攻撃は半分にならない', () => {
    let g = rich(startGame());
    g.players[0].status.burn = 1;
    const d = putMonster(g, 1, unit(0, 30));
    g = play(g, giveCard(g, 0, legend([fx({ id: 'damage', value: 7 })])), { enemy: M(d) });
    expect(monster(g, d)!.hp).toBe(27); // 7 → 3
    const a = putMonster(g, 0, unit(6, 20));
    g = attack(g, a, M(d));
    expect(monster(g, d)!.hp).toBe(21);
  });

  it('モンスターの召喚時の効果は、持ち主のプレイヤーのやけどで半分（モンスター自身のやけどでは変わらない）', () => {
    let g = rich(startGame());
    g.players[0].status.burn = 1;
    const d = putMonster(g, 1, unit(0, 30));
    g = play(g, giveCard(g, 0, unit(1, 5, { effects: [fx({ id: 'damage', value: 8, timing: 'summon' })] })), { enemy: M(d) });
    expect(monster(g, d)!.hp).toBe(26); // 8 → 4
    // 攻撃するたびの効果：やけどのモンスター自身の効果は、持ち主がやけどでなければ半分にならない
    g.players[0].status.burn = 0;
    const a = putMonster(g, 0, unit(0, 20, { effects: [fx({ id: 'damage', value: 6, timing: 'attack' })] }));
    monster(g, a)!.status.burn = 2;
    const before = monster(g, d)!.hp;
    g = attack(g, a, M(d));
    expect(monster(g, d)!.hp).toBe(before - 6);
  });
});

describe('脱力：与えるダメージが1発上限まで・使うと1つ減る', () => {
  it('脱力を与える：個数を重ねる', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, legend([fx({ id: 'weak', value: 3 })])), { enemy: P(1) });
    expect(g.players[1].status.weak).toBe(3);
    g = play(g, giveCard(g, 0, legend([fx({ id: 'weak', value: 2 })])), { enemy: P(1) });
    expect(g.players[1].status.weak).toBe(5);
  });

  it('脱力のモンスターの攻撃は上限まで。攻撃するたび1つ減り、反撃では減らない', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(9, 30));
    const d = putMonster(g, 1, unit(9, 40));
    monster(g, a)!.status.weak = 2;
    monster(g, d)!.status.weak = 1;
    g = attack(g, a, M(d));
    expect(monster(g, d)!.hp).toBe(40 - B.exhaustCap);
    expect(monster(g, a)!.hp).toBe(30 - B.exhaustCap); // 反撃も上限まで
    expect(monster(g, a)!.status.weak).toBe(1);
    expect(monster(g, d)!.status.weak).toBe(1);
  });

  it('プレイヤーの脱力：連撃は1発ごとに上限まで。ダメージのカードを使うと1つ減り、そのカードの残りの発にも効く', () => {
    let g = rich(startGame());
    g.players[0].status.weak = 1;
    const d = putMonster(g, 1, unit(0, 40));
    g = play(g, giveCard(g, 0, legend([fx({ id: 'multiHit', value: 8, hits: 2 })])), { enemy: M(d) });
    expect(monster(g, d)!.hp).toBe(40 - 2 * B.exhaustCap);
    expect(g.players[0].status.weak).toBe(0);
    // 脱力が無くなったので次は上限なし
    g = play(g, giveCard(g, 0, legend([fx({ id: 'damage', value: 8 })])), { enemy: M(d) });
    expect(monster(g, d)!.hp).toBe(40 - 2 * B.exhaustCap - 8);
  });

  it('ダメージの効果のないカードでは減らない。召喚時のダメージは減る', () => {
    let g = rich(startGame());
    g.players[0].status.weak = 2;
    g = play(g, giveCard(g, 0, legend([fx({ id: 'heal', value: 3, target: 'self' })])));
    expect(g.players[0].status.weak).toBe(2);
    const d = putMonster(g, 1, unit(0, 40));
    g = play(g, giveCard(g, 0, unit(1, 5, { effects: [fx({ id: 'damage', value: 9, timing: 'summon' })] })), { enemy: M(d) });
    expect(monster(g, d)!.hp).toBe(40 - B.exhaustCap);
    expect(g.players[0].status.weak).toBe(1);
  });

  it('ターン終了では減らない（使うまで残る）', () => {
    let g = startGame();
    g.players[1].status.weak = 2;
    g = act(g, { type: 'endTurn', player: g.active });
    g = act(g, { type: 'endTurn', player: g.active });
    expect(g.players[1].status.weak).toBe(2);
  });
});
