// ダメージ計算と状態異常（決定事項 #29〜#37、#69・#70。HP は 120）
import { describe, expect, it } from 'vitest';
import { BALANCE, battle } from '../../src/engine/index.ts';
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
    expect(g.players[1].hp).toBe(118);
    expect(g.players[1].status.burn).toBe(3);
    // やけど：付与された側のターン終了時に2ダメージ、残りターン−1
    g = endTurn(g);
    g = endTurn(g);
    expect(g.players[1].hp).toBe(118 - B.burnDamage);
    expect(g.players[1].status.burn).toBe(2);
  });

  it('シールドが先に肩代わりし、次の自分のターン開始時に消える', () => {
    let g = rich(startGame());
    g.players[1].shield = 3;
    g = play(g, giveCard(g, 0, dmg(5)), { enemy: P(1) });
    expect(g.players[1].shield).toBe(0);
    expect(g.players[1].hp).toBe(118);
    g.players[1].shield = 4;
    g = endTurn(g);
    expect(g.players[1].shield).toBe(0);
  });

  it('計算順：筋力 → やけど → 脱力 → 脆弱 → 守備力 → 最低1 → 出血（#138）', () => {
    let g = rich(startGame());
    const m = putMonster(g, 1, unit(1, 30, 3));
    g.players[0].status.strength = 2; // アタックなので筋力が乗る
    g.players[0].status.burn = 1;
    g.players[0].status.weak = 1;
    monster(g, m)!.status.vulnerable = 1;
    monster(g, m)!.status.bleed = 2;
    g = play(g, giveCard(g, 0, dmg(14)), { enemy: M(m) });
    // (14+2)=16 → やけどで3分の2（切り捨て）10 → 脱力で1発5まで → 脆弱 7 → 守備力3で 4 → 出血+2 で 6
    expect(monster(g, m)!.hp).toBe(24);
    expect(logText(g)).toContain('基本14 → 筋力・気合+2で16 → やけどで10 → 脱力で5 → 脆弱で7 → 守備力−3で4 → 出血+2で6');
    // ダメージのカードを使ったので脱力は1つ減った
    expect(g.players[0].status.weak).toBe(0);
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
    expect(g.players[1].hp).toBe(116);
    expect(g.players[1].shield).toBe(10);
  });

  it('吸収は実際に減らしたHPの半分を回復（シールド分は数えない）', () => {
    let g = rich(startGame());
    g.players[0].hp = 40;
    g.players[1].shield = 2;
    g = play(g, giveCard(g, 0, legend([fx({ id: 'damage', value: 7, mods: ['drain'] })])), { enemy: P(1) });
    expect(g.players[1].hp).toBe(115);
    expect(g.players[0].hp).toBe(42);
  });

  it('連撃は1回ごとに守備力で減る。筋力は最初の1発にだけ乗る（#70 R3）', () => {
    let g = rich(startGame());
    const m = putMonster(g, 1, unit(1, 30, 1));
    g.players[0].status.strength = 1;
    g = play(g, giveCard(g, 0, legend([fx({ id: 'multiHit', value: 2, hits: 3 })])), { enemy: M(m) });
    // (2+1−1)=2、そのあと (2−1)=1 を2回
    expect(monster(g, m)!.hp).toBe(26);
  });
});

describe('筋力・気合が乗る範囲（#29・#70 R3）', () => {
  it('モンスターの攻撃には乗らない', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(3, 5));
    g.players[0].status.strength = 5;
    g = attack(g, a, P(1));
    expect(g.players[1].hp).toBe(117);
  });

  it('パワーの継続ダメージには乗らない', () => {
    let g = rich(startGame());
    g.players[0].status.strength = 5;
    const pw = legend([fx({ id: 'damage', value: 2, timing: 'turnStart', target: 'enemyPlayer' })]);
    g = play(g, giveCard(g, 0, pw));
    g = endTurn(g);
    g = endTurn(g);
    expect(g.players[1].hp).toBe(118);
  });

  it('気合はそのターンだけ', () => {
    let g = rich(startGame());
    g.players[0].status.focus = 3;
    g = play(g, giveCard(g, 0, dmg(1)), { enemy: P(1) });
    expect(g.players[1].hp).toBe(116);
    g = endTurn(g);
    expect(g.players[0].status.focus).toBe(0);
  });

  it('1枚のカードにつき1回：連撃 1×3 に筋力2なら 3+2（3+6 ではない）。2つ目のダメージ効果にも乗らない', () => {
    let g = rich(startGame());
    g.players[0].status.strength = 2;
    g = play(g, giveCard(g, 0, legend([fx({ id: 'multiHit', value: 1, hits: 3 })])), { enemy: P(1) });
    expect(g.players[1].hp).toBe(115);
    g = play(g, giveCard(g, 0, legend([fx({ id: 'damage', value: 1 }), fx({ id: 'damage', value: 1 })])), { enemy: P(1) });
    expect(g.players[1].hp).toBe(115 - (1 + 2) - 1);
  });

  it('そのカード自身が付けた筋力・気合は乗らない（使った時点の値を使う）', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, legend([fx({ id: 'strength', value: 2, target: 'self' }), fx({ id: 'damage', value: 3 })])), { enemy: P(1) });
    expect(g.players[0].status.strength).toBe(2);
    expect(g.players[1].hp).toBe(117);
    // 次のカードからは乗る
    g = play(g, giveCard(g, 0, legend([fx({ id: 'focus', value: 1, target: 'self' }), fx({ id: 'damage', value: 3 })])), { enemy: P(1) });
    expect(g.players[1].hp).toBe(117 - 5);
  });

  it('筋力の合計は10まで（#70 R9）', () => {
    let g = rich(startGame());
    g = play(g, giveCard(g, 0, legend([fx({ id: 'strength', value: 8, target: 'self' })])));
    g = play(g, giveCard(g, 0, legend([fx({ id: 'strength', value: 5, target: 'self' })])));
    expect(g.players[0].status.strength).toBe(B.strengthCap);
    expect(g.players[0].status.strength).toBe(10);
    expect(g.log.some((e) => e.text.includes('筋力2（上限10）：合計10'))).toBe(true);
  });
});

describe('毒・やけど・自傷と無効化（#33・#37・#69）', () => {
  it('毒はターン開始時に毒の数だけダメージ、その後半分（切り捨て）。シールドと無効化を貫通', () => {
    let g = startGame();
    g.players[1].status.poison = 3;
    g.players[1].shield = 5;
    g.players[1].status.nullify = 1;
    g = endTurn(g);
    expect(g.players[1].hp).toBe(117);
    expect(g.players[1].status.poison).toBe(1);
    expect(g.players[1].status.nullify).toBe(1);
  });

  it('毒10 は 10 → 5 → 2 → 1 → 0 と減る（半減式）', () => {
    let g = startGame();
    g.players[1].status.poison = 10;
    const ticks: number[] = [];
    let hp = 120;
    for (let i = 0; i < 5; i++) {
      g = endTurn(g); // P1 のターン開始
      ticks.push(hp - g.players[1].hp);
      hp = g.players[1].hp;
      g = endTurn(g);
    }
    expect(ticks).toEqual([10, 5, 2, 1, 0]);
    expect(g.players[1].status.poison).toBe(0);
  });

  it('再生も同じく半分（切り捨て）になる', () => {
    let g = startGame();
    g.players[1].hp = 100;
    g.players[1].status.regen = 5;
    g = endTurn(g);
    expect(g.players[1].hp).toBe(105);
    expect(g.players[1].status.regen).toBe(2);
    g = endTurn(endTurn(g));
    expect(g.players[1].hp).toBe(107);
    expect(g.players[1].status.regen).toBe(1);
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
    expect(g.players[1].hp).toBe(115);
    expect(g.players[1].status.nullify).toBe(0);
  });

  it('自傷は無効化で防げる', () => {
    let g = rich(startGame());
    g.players[0].status.nullify = 1;
    const c = legend([fx({ id: 'draw', value: 1, target: 'self' })], { drawbacks: [{ id: 'selfDamage', value: 4, timing: 'play' }] });
    g = play(g, giveCard(g, 0, c));
    expect(g.players[0].hp).toBe(120);
    expect(g.players[0].status.nullify).toBe(0);
  });

  it('自傷と無効化が同じカードなら、自傷してから無効化が付く（#34）', () => {
    let g = rich(startGame());
    const c = legend([fx({ id: 'nullify', target: 'self' })], { drawbacks: [{ id: 'selfDamage', value: 4, timing: 'play' }] });
    g = play(g, giveCard(g, 0, c));
    expect(g.players[0].hp).toBe(116);
    expect(g.players[0].status.nullify).toBe(1);
  });

  it('やけど中でも回復量はそのまま（回復半分の決まりはやめた：#138）', () => {
    let g = rich(startGame());
    g.players[0].hp = 40;
    g.players[0].status.burn = 2;
    g = play(g, giveCard(g, 0, legend([fx({ id: 'heal', value: 5, target: 'self' })])));
    expect(g.players[0].hp).toBe(45);
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
    expect(g.players[0].hp).toBe(118);
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

  it('「ダメージを受けたとき」は毒・やけどでは発動しない（#70 R5）', () => {
    let g = startGame();
    const d = putMonster(g, 1, unit(1, 20, 0, { effects: [fx({ id: 'damage', value: 4, timing: 'damaged', target: 'enemyPlayer' })] }));
    monster(g, d)!.status.poison = 2;
    monster(g, d)!.status.burn = 1;
    g = endTurn(g); // 毒
    g = endTurn(g); // やけど（P1 のターン終了時）
    expect(monster(g, d)!.hp).toBe(20 - 2 - B.burnDamage);
    expect(g.players[0].hp).toBe(120);
    // 攻撃では発動する
    const a = putMonster(g, 0, unit(1, 20));
    g = attack(g, a, M(d));
    expect(g.players[0].hp).toBe(116);
  });
});

describe('出血・反撃（#31・#32・#70 R4）', () => {
  it('出血は1枚のカードにつき1回だけ追加ダメージ（連撃でも1回）、ターン終了時に半分', () => {
    let g = rich(startGame());
    g.players[1].status.bleed = 3;
    g = play(g, giveCard(g, 0, legend([fx({ id: 'multiHit', value: 1, hits: 2 })])), { enemy: P(1) });
    expect(g.players[1].hp).toBe(120 - (1 + 3) - 1);
    // 別のカードならまた働く
    g = play(g, giveCard(g, 0, dmg(1)), { enemy: P(1) });
    expect(g.players[1].hp).toBe(120 - 5 - 4);
    g = endTurn(g);
    g = endTurn(g);
    expect(g.players[1].status.bleed).toBe(1);
  });

  it('毒には出血が乗らない', () => {
    let g = startGame();
    g.players[1].status.poison = 2;
    g.players[1].status.bleed = 5;
    g = endTurn(g);
    expect(g.players[1].hp).toBe(118);
  });

  it('反撃：攻撃してきたモンスターに返す（守備力で減る）。1回の攻撃につき1回', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(2, 10, 1, { keywords: [{ id: 'doubleAttack' }] }));
    g.players[1].status.counter = 4;
    g = attack(g, a, P(1));
    g = attack(g, a, P(1));
    expect(g.players[1].hp).toBe(116);
    expect(monster(g, a)!.hp).toBe(10 - 2 * 3);
  });

  it('反撃：1枚のカードにつき1回（連撃でも1回）。モンスターの「攻撃するたび」のダメージは攻撃と合わせて1回', () => {
    let g = rich(startGame());
    g.players[1].status.counter = 4;
    g = play(g, giveCard(g, 0, legend([fx({ id: 'multiHit', value: 1, hits: 3 })])), { enemy: P(1) });
    expect(g.players[1].hp).toBe(117);
    expect(g.players[0].hp).toBe(116);
    const a = putMonster(g, 0, unit(2, 10, 0, { effects: [fx({ id: 'damage', value: 1, timing: 'attack' })] }));
    g = attack(g, a, P(1));
    expect(g.players[1].hp).toBe(117 - 2 - 1);
    expect(monster(g, a)!.hp).toBe(6);
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
    expect(g.players[0].hp).toBe(120);
  });
});

describe('構造化ログ（#71）', () => {
  it('ダメージ・回復・状態・使用・召喚・破壊・ドロー・ターンに ev が付き、相手の非公開ログは除かれる', () => {
    let g = rich(startGame());
    const d = putMonster(g, 1, unit(1, 1));
    g = play(g, giveCard(g, 0, legend([fx({ id: 'damage', value: 5 }), fx({ id: 'heal', value: 1, target: 'self' }), fx({ id: 'poison', value: 2, target: 'enemyPlayer' })])), { enemy: M(d) });
    g = play(g, giveCard(g, 0, unit(1, 1)));
    g = endTurn(g);
    const kinds = new Set(g.log.map((e) => e.ev?.kind));
    const expected: battle.LogEvent['kind'][] = ['turnStart', 'energy', 'draw', 'play', 'damage', 'destroy', 'heal', 'status', 'summon', 'turnEnd', 'discard'];
    for (const k of expected) expect(kinds.has(k), k).toBe(true);
    const dmgEv = g.log.find((e) => e.ev?.kind === 'damage')!.ev!;
    expect(dmgEv).toMatchObject({ target: M(d), amount: 5, damageKind: 'hit' });
    const v = battle.viewFor(g, 1);
    expect(v.log.some((e) => e.ev?.kind === 'damage')).toBe(true);
    expect(v.log.some((e) => e.private === 0)).toBe(false);
  });
});
