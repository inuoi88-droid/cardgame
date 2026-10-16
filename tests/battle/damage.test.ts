// ダメージ計算と状態異常（決定事項 #29〜#37）
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/engine/index.ts';
import { card } from '../helpers.ts';
import { M, P, attack, endTurn, fx, giveCard, logText, monster, play, putMonster, rich, startGame } from './helpers.ts';

const B = BALANCE.battle;
const legend = (effects: ReturnType<typeof fx>[], extra: Partial<Parameters<typeof card>[0]> = {}) =>
  card({ id: `L${Math.random().toString(36).slice(2, 8)}`, rarity: 'legend', cost: 5, effects, ...extra });
const dmg = (n: number, extra: Partial<ReturnType<typeof fx>> = {}) => legend([fx({ id: 'damage', value: n, ...extra })]);
const unit = (attack: number, hp: number, defense = 0, extra: Partial<Parameters<typeof card>[0]> = {}) =>
  card({ id: `U${attack}${hp}${defense}${Math.random().toString(36).slice(2, 6)}`, rarity: 'legend', cost: 5, stats: { attack, hp, defense }, ...extra });

describe('ダメージの基本', () => {
  it('作成例1 火の粉：相手に2ダメージとやけど3ターン', () => {
    let g = rich(startGame());
    const uid = giveCard(g, 0, card({ id: 'hinoko', effects: [fx({ id: 'damage', value: 2 }), fx({ id: 'burn', value: 0 })] }));
    g = play(g, uid, { enemy: P(1) });
    expect(g.players[1].hp).toBe(58);
    expect(g.players[1].status.burn).toBe(3);
    // やけど：付与された側のターン終了時に2ダメージ、残りターン−1
    g = endTurn(g);
    g = endTurn(g);
    expect(g.players[1].hp).toBe(58 - B.burnDamage);
    expect(g.players[1].status.burn).toBe(2);
  });

  it('シールドが先に肩代わりし、次の自分のターン開始時に消える', () => {
    let g = rich(startGame());
    g.players[1].shield = 3;
    g = play(g, giveCard(g, 0, dmg(5)), { enemy: P(1) });
    expect(g.players[1].shield).toBe(0);
    expect(g.players[1].hp).toBe(58);
    g.players[1].shield = 4;
    g = endTurn(g);
    expect(g.players[1].shield).toBe(0);
  });

  it('計算順：筋力 → 弱体 → 脆弱 → 守備力 → 最低1 → 出血', () => {
    let g = rich(startGame());
    const m = putMonster(g, 1, unit(1, 30, 3));
    g.players[0].status.strength = 2; // アタックなので筋力が乗る
    g.players[0].status.weak = 1;
    monster(g, m)!.status.vulnerable = 1;
    monster(g, m)!.status.bleed = 2;
    g = play(g, giveCard(g, 0, dmg(4)), { enemy: M(m) });
    // (4+2)=6 → 弱体 4 → 脆弱 6 → 守備力3で 3 → 出血+2 で 5
    expect(monster(g, m)!.hp).toBe(25);
    expect(logText(g)).toContain('基本4 → 筋力・気合+2で6 → 弱体で4 → 脆弱で6 → 守備力−3で3 → 出血+2で5');
  });

  it('守備力で減っても最低1', () => {
    let g = rich(startGame());
    const m = putMonster(g, 1, unit(1, 10, 3));
    g = play(g, giveCard(g, 0, dmg(1)), { enemy: M(m) });
    expect(monster(g, m)!.hp).toBe(9);
  });

  it('防御無視は守備力とシールドを無視する', () => {
    let g = rich(startGame());
    const m = putMonster(g, 1, unit(1, 10, 3));
    g.players[1].shield = 10;
    g = play(g, giveCard(g, 0, legend([fx({ id: 'damage', value: 4, target: 'enemyAll', mods: ['pierce'] })])));
    expect(monster(g, m)!.hp).toBe(6);
    expect(g.players[1].hp).toBe(56);
    expect(g.players[1].shield).toBe(10);
  });

  it('吸収は実際に減らしたHPの半分を回復（シールド分は数えない）', () => {
    let g = rich(startGame());
    g.players[0].hp = 40;
    g.players[1].shield = 2;
    g = play(g, giveCard(g, 0, legend([fx({ id: 'damage', value: 7, mods: ['drain'] })])), { enemy: P(1) });
    expect(g.players[1].hp).toBe(55);
    expect(g.players[0].hp).toBe(42);
  });

  it('連撃は1回ごとに守備力で減り、筋力も1回ごとに乗る', () => {
    let g = rich(startGame());
    const m = putMonster(g, 1, unit(1, 30, 1));
    g.players[0].status.strength = 1;
    g = play(g, giveCard(g, 0, legend([fx({ id: 'multiHit', value: 2, hits: 3 })])), { enemy: M(m) });
    // (2+1−1)=2 を3回
    expect(monster(g, m)!.hp).toBe(24);
  });
});

describe('筋力・気合が乗る範囲（#29）', () => {
  it('モンスターの攻撃には乗らない', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(3, 5));
    g.players[0].status.strength = 5;
    g = attack(g, a, P(1));
    expect(g.players[1].hp).toBe(57);
  });

  it('パワーの継続ダメージには乗らない', () => {
    let g = rich(startGame());
    g.players[0].status.strength = 5;
    const pw = legend([fx({ id: 'damage', value: 2, timing: 'turnStart', target: 'enemyPlayer' })]);
    g = play(g, giveCard(g, 0, pw));
    g = endTurn(g);
    g = endTurn(g);
    expect(g.players[1].hp).toBe(58);
  });

  it('気合はそのターンだけ', () => {
    let g = rich(startGame());
    g.players[0].status.focus = 3;
    g = play(g, giveCard(g, 0, dmg(1)), { enemy: P(1) });
    expect(g.players[1].hp).toBe(56);
    g = endTurn(g);
    expect(g.players[0].status.focus).toBe(0);
  });
});

describe('毒・やけど・自傷と無効化（#33・#37）', () => {
  it('毒はターン開始時に毒の数だけダメージ、その後1減る。シールドと無効化を貫通', () => {
    let g = startGame();
    g.players[1].status.poison = 3;
    g.players[1].shield = 5;
    g.players[1].status.nullify = 1;
    g = endTurn(g);
    expect(g.players[1].hp).toBe(57);
    expect(g.players[1].status.poison).toBe(2);
    expect(g.players[1].status.nullify).toBe(1);
  });

  it('毒はモンスターの守備力も無視する', () => {
    let g = startGame();
    const m = putMonster(g, 1, unit(1, 5, 3));
    monster(g, m)!.status.poison = 2;
    g = endTurn(g);
    expect(monster(g, m)!.hp).toBe(3);
  });

  it('無効化は次のダメージ1回を0にし、重ねると回数が増える', () => {
    let g = rich(startGame());
    g.players[1].status.nullify = 2;
    g = play(g, giveCard(g, 0, dmg(5)), { enemy: P(1) });
    g = play(g, giveCard(g, 0, dmg(5)), { enemy: P(1) });
    g = play(g, giveCard(g, 0, dmg(5)), { enemy: P(1) });
    expect(g.players[1].hp).toBe(55);
    expect(g.players[1].status.nullify).toBe(0);
  });

  it('自傷は無効化で防げる', () => {
    let g = rich(startGame());
    g.players[0].status.nullify = 1;
    const c = legend([fx({ id: 'draw', value: 1, target: 'self' })], { drawbacks: [{ id: 'selfDamage', value: 4, timing: 'play' }] });
    g = play(g, giveCard(g, 0, c));
    expect(g.players[0].hp).toBe(60);
    expect(g.players[0].status.nullify).toBe(0);
  });

  it('自傷と無効化が同じカードなら、自傷してから無効化が付く（#34）', () => {
    let g = rich(startGame());
    const c = legend([fx({ id: 'nullify', target: 'self' })], { drawbacks: [{ id: 'selfDamage', value: 4, timing: 'play' }] });
    g = play(g, giveCard(g, 0, c));
    expect(g.players[0].hp).toBe(56);
    expect(g.players[0].status.nullify).toBe(1);
  });

  it('やけど中は回復量が半分（切り捨て）', () => {
    let g = rich(startGame());
    g.players[0].hp = 40;
    g.players[0].status.burn = 2;
    g = play(g, giveCard(g, 0, legend([fx({ id: 'heal', value: 5, target: 'self' })])));
    expect(g.players[0].hp).toBe(42);
  });

  it('やけどを重ねると、新しいやけどのターン数をまるごと足す（#36）', () => {
    let g = rich(startGame());
    g.players[1].status.burn = 2;
    g = play(g, giveCard(g, 0, legend([fx({ id: 'burn', value: 1 })])), { enemy: P(1) });
    expect(g.players[1].status.burn).toBe(2 + 3 + 1);
  });

  it('やけどはシールドを無視する', () => {
    let g = startGame();
    g.players[0].status.burn = 1;
    g.players[0].shield = 5;
    g = endTurn(g);
    expect(g.players[0].hp).toBe(58);
  });

  it('浄化はそのカード自身のデメリットで付いた毒を消さない（#34）', () => {
    let g = rich(startGame());
    g.players[0].status.poison = 5;
    g.players[0].status.weak = 2;
    const c = legend([fx({ id: 'cleanse', target: 'self' })], { drawbacks: [{ id: 'selfPoison', value: 3, timing: 'play' }] });
    g = play(g, giveCard(g, 0, c));
    expect(g.players[0].status.poison).toBe(3);
    expect(g.players[0].status.weak).toBe(0);
  });
});

describe('出血・反撃（#31・#32）', () => {
  it('出血は攻撃を受けるたびに追加ダメージ、ターン終了時に半分', () => {
    let g = rich(startGame());
    g.players[1].status.bleed = 3;
    g = play(g, giveCard(g, 0, legend([fx({ id: 'multiHit', value: 1, hits: 2 })])), { enemy: P(1) });
    expect(g.players[1].hp).toBe(60 - 2 * (1 + 3));
    g = endTurn(g);
    g = endTurn(g);
    expect(g.players[1].status.bleed).toBe(1);
  });

  it('毒には出血が乗らない', () => {
    let g = startGame();
    g.players[1].status.poison = 2;
    g.players[1].status.bleed = 5;
    g = endTurn(g);
    expect(g.players[1].hp).toBe(58);
  });

  it('反撃：攻撃してきたモンスターに返す（守備力で減る）、何度でも', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(2, 10, 1, { keywords: [{ id: 'doubleAttack' }] }));
    g.players[1].status.counter = 4;
    g = attack(g, a, P(1));
    g = attack(g, a, P(1));
    expect(g.players[1].hp).toBe(56);
    expect(monster(g, a)!.hp).toBe(10 - 2 * 3);
  });

  it('反撃は次の自分のターン開始時に消える', () => {
    let g = startGame();
    g.players[1].status.counter = 4;
    g = endTurn(g);
    expect(g.players[1].status.counter).toBe(0);
  });
});

describe('同時にHP0', () => {
  it('両者が同時にHP0なら引き分け', () => {
    let g = rich(startGame());
    g.players[0].hp = 3;
    g.players[1].hp = 3;
    g = play(g, giveCard(g, 0, legend([fx({ id: 'damage', value: 5, target: 'everyone' })])));
    expect(g.result).toEqual({ winner: null, reason: 'hp' });
  });

  it('相手のHPを0にしたら勝ち、そこで処理が止まる', () => {
    let g = rich(startGame());
    g.players[1].hp = 2;
    g = play(g, giveCard(g, 0, legend([fx({ id: 'damage', value: 5 }), fx({ id: 'heal', value: 9, target: 'self' })])), { enemy: P(1) });
    expect(g.result).toEqual({ winner: 0, reason: 'hp' });
    expect(g.players[0].hp).toBe(60);
  });
});
