// モンスターの戦闘とキーワード・状態異常・デメリット
import { describe, expect, it } from 'vitest';
import { battle } from '../../src/engine/index.ts';
import { card } from '../helpers.ts';
import { M, P, act, actError, attack, endTurn, fx, giveCard, monster, play, putMonster, rich, startGame } from './helpers.ts';

let n = 0;
const unit = (attack: number, hp: number, defense = 0, extra: Partial<Parameters<typeof card>[0]> = {}) =>
  card({ id: `U${++n}`, name: `モンスター${n}`, rarity: 'legend', cost: 5, stats: { attack, hp, defense }, ...extra });
const kw = (...ids: string[]) => ({ keywords: ids.map((id) => ({ id })) });

describe('攻撃の基本', () => {
  it('召喚したターンは攻撃できず、次の自分のターンから攻撃できる', () => {
    let g = rich(startGame());
    const uid = giveCard(g, 0, unit(2, 2));
    g = play(g, uid);
    expect(actError(g, { type: 'attack', player: 0, attackerUid: uid, target: P(1) })).toBe('場に出たターンは攻撃できません');
    g = endTurn(endTurn(g));
    g = attack(g, uid, P(1));
    expect(g.players[1].hp).toBe(58);
  });

  it('速攻は召喚したターンから攻撃できる', () => {
    let g = rich(startGame());
    const uid = giveCard(g, 0, unit(2, 2, 0, kw('haste')));
    g = play(g, uid);
    g = attack(g, uid, P(1));
    expect(g.players[1].hp).toBe(58);
  });

  it('毎ターン1回、二回攻撃なら2回', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(1, 2));
    const b = putMonster(g, 0, unit(1, 2, 0, kw('doubleAttack')));
    g = attack(g, a, P(1));
    actError(g, { type: 'attack', player: 0, attackerUid: a, target: P(1) });
    g = attack(attack(g, b, P(1)), b, P(1));
    expect(g.players[1].hp).toBe(57);
  });

  it('攻撃力 − 守備力、最低1。攻撃されたモンスターは反撃しない', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(2, 5));
    const d = putMonster(g, 1, unit(5, 10, 3));
    g = attack(g, a, M(d));
    expect(monster(g, d)!.hp).toBe(9);
    expect(monster(g, a)!.hp).toBe(5);
  });

  it('倒したモンスターは元の持ち主の捨て札へ', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(5, 5));
    const d = putMonster(g, 1, unit(1, 3));
    g = attack(g, a, M(d));
    expect(monster(g, d)).toBeUndefined();
    expect(g.players[1].discard.some((c) => c.uid === d)).toBe(true);
  });

  it('場のモンスターの数に上限はない', () => {
    let g = rich(startGame(), 0, 99);
    for (let i = 0; i < 8; i++) g = play(g, giveCard(g, 0, unit(1, 1)));
    expect(g.players[0].board).toHaveLength(8);
  });
});

describe('キーワード', () => {
  it('挑発がいると、挑発しか攻撃できない。飛行は無視できる', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(1, 5));
    const f = putMonster(g, 0, unit(1, 5, 0, kw('flying')));
    const t = putMonster(g, 1, unit(1, 5, 0, kw('taunt')));
    putMonster(g, 1, unit(1, 5));
    expect(battle.attackTargets(g, monster(g, a)!)).toEqual([M(t)]);
    expect(battle.attackTargets(g, monster(g, f)!)).toHaveLength(3);
    g = attack(g, f, P(1));
    expect(g.players[1].hp).toBe(59);
  });

  it('隠密は相手の次のターン終了まで攻撃対象にならず、カードの「選んだ1体」でも選べない', () => {
    let g = rich(startGame());
    const s = giveCard(g, 0, unit(1, 5, 0, kw('stealth')));
    g = play(g, s);
    expect(monster(g, s)!.stealth).toBe(true);
    g = endTurn(g);
    // 相手（P1）のターン：攻撃もカードの対象もできない
    const a = putMonster(g, 1, unit(1, 5));
    expect(battle.attackTargets(g, monster(g, a)!)).toEqual([P(0)]);
    rich(g, 1);
    const hit = giveCard(g, 1, card({ id: 'hit', rarity: 'legend', cost: 1, effects: [fx({ id: 'damage', value: 1 })] }));
    expect(actError(g, { type: 'playCard', player: 1, cardUid: hit, chosen: { enemy: M(s) } })).toBe('その対象は選べません');
    // 全体の効果には当たる
    const all = giveCard(g, 1, card({ id: 'all', rarity: 'legend', cost: 1, effects: [fx({ id: 'damage', value: 1, target: 'enemyMonsters' })] }));
    g = play(g, all);
    expect(monster(g, s)!.hp).toBe(4);
    g = endTurn(g);
    expect(monster(g, s)!.stealth).toBe(false);
  });

  it('貫通：倒して余ったダメージが相手プレイヤーに通る', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(7, 5, 0, kw('trample')));
    const d = putMonster(g, 1, unit(1, 3, 1));
    g = attack(g, a, M(d));
    // 7−1=6、体力3を倒して余り3
    expect(g.players[1].hp).toBe(57);
  });

  it('不屈：一度だけ体力1で踏みとどまる。破壊には効かない', () => {
    let g = rich(startGame());
    const a = putMonster(g, 0, unit(9, 5, 0, kw('doubleAttack')));
    const d = putMonster(g, 1, unit(1, 3, 0, kw('undying')));
    g = attack(g, a, M(d));
    expect(monster(g, d)!.hp).toBe(1);
    g = attack(g, a, M(d));
    expect(monster(g, d)).toBeUndefined();
    const d2 = putMonster(g, 1, unit(1, 3, 0, kw('undying')));
    g = play(g, giveCard(g, 0, card({ id: 'exe', rarity: 'legend', cost: 1, effects: [fx({ id: 'execute', value: 3 })] })), { enemy: M(d2) });
    expect(monster(g, d2)).toBeUndefined();
  });

  it('自己修復：自分のターン開始時に体力を回復', () => {
    let g = startGame();
    const r = putMonster(g, 1, unit(1, 6, 0, { keywords: [{ id: 'selfRepair', value: 2 }] }));
    monster(g, r)!.hp = 2;
    g = endTurn(g);
    expect(monster(g, r)!.hp).toBe(4);
  });
});

describe('凍結・混乱・封印', () => {
  it('凍結：付与された側の次のターン、モンスターは攻撃できない', () => {
    let g = rich(startGame());
    const enemy = putMonster(g, 1, unit(3, 5));
    g = play(g, giveCard(g, 0, card({ id: 'frz', rarity: 'legend', cost: 1, effects: [fx({ id: 'freeze' })] })), { enemy: M(enemy) });
    g = endTurn(g);
    expect(actError(g, { type: 'attack', player: 1, attackerUid: enemy, target: P(0) })).toBe('凍結していて攻撃できません');
    g = endTurn(endTurn(g));
    g = attack(g, enemy, P(0));
    expect(g.players[0].hp).toBe(57);
  });

  it('凍結：プレイヤーは最初に使うカードのコスト+1', () => {
    let g = startGame();
    g.players[1].status.freezePending = true;
    g = endTurn(g);
    const c = giveCard(g, 1, card({ id: 'c1', cost: 1, effects: [fx({ id: 'damage', value: 2 })] }));
    const info = battle.playInfo(g, 1, g.players[1].hand.find((x) => x.uid === c)!);
    expect(info.cost).toBe(2);
    g = play(g, c, { enemy: P(0) });
    expect(g.players[1].energy).toBe(1);
    const c2 = giveCard(g, 1, card({ id: 'c2', cost: 1, effects: [fx({ id: 'damage', value: 2 })] }));
    expect(battle.playInfo(g, 1, g.players[1].hand.find((x) => x.uid === c2)!).cost).toBe(1);
  });

  it('混乱：次の持ち主のターン開始時に自動で攻撃し、対象は自分以外の全員からランダム', () => {
    let g = rich(startGame());
    const enemy = putMonster(g, 1, unit(4, 5));
    g = play(g, giveCard(g, 0, card({ id: 'cnf', rarity: 'legend', cost: 1, effects: [fx({ id: 'confuse' })] })), { enemy: M(enemy) });
    g = endTurn(g);
    expect(g.log.some((e) => e.text.includes('混乱で対象はランダム'))).toBe(true);
    expect(actError(g, { type: 'attack', player: 1, attackerUid: enemy, target: P(0) })).toContain('混乱');
  });

  it('封印：効果とキーワードを失うが、デメリットは残る', () => {
    let g = rich(startGame());
    const def = unit(2, 5, 0, { ...kw('taunt'), drawbacks: [{ id: 'upkeep', timing: null }], effects: [fx({ id: 'damage', value: 3, timing: 'attack' })] });
    const enemy = putMonster(g, 1, def);
    g = play(g, giveCard(g, 0, card({ id: 'seal', rarity: 'legend', cost: 1, effects: [fx({ id: 'seal' })] })), { enemy: M(enemy) });
    expect(monster(g, enemy)!.sealed).toBe(true);
    expect(battle.keywordFlags(g, monster(g, enemy)!).taunt).toBeUndefined();
    g = endTurn(g);
    expect(g.players[1].hp).toBe(59); // 維持費は残る
    g = attack(g, enemy, P(0));
    expect(g.players[0].hp).toBe(58); // 攻撃するたびのダメージは出ない
  });
});

describe('デメリット', () => {
  it('維持費：場にいる間、持ち主のターン開始時に1ダメージ', () => {
    let g = startGame();
    putMonster(g, 1, unit(1, 3, 0, { drawbacks: [{ id: 'upkeep', timing: null }] }));
    g = endTurn(g);
    expect(g.players[1].hp).toBe(59);
  });

  it('寄生：手札にある間、ターン終了時に2ダメージ', () => {
    let g = startGame();
    giveCard(g, 0, card({ id: 'para', cost: 0, effects: [fx({ id: 'damage', value: 1 })], drawbacks: [{ id: 'parasite', timing: null }] }));
    g = endTurn(g);
    expect(g.players[0].hp).toBe(58);
  });

  it('裏切り：持ち主のターンを3回迎えたら、ターン開始時に持ち主を攻撃する', () => {
    let g = rich(startGame());
    const b = giveCard(g, 0, unit(3, 9, 0, { drawbacks: [{ id: 'betrayal', timing: null }] }));
    g = play(g, b);
    for (let i = 0; i < 2; i++) g = endTurn(endTurn(g));
    expect(monster(g, b)!.betraying).toBe(false);
    expect(g.players[0].hp).toBe(60);
    g = endTurn(endTurn(g));
    expect(monster(g, b)!.betraying).toBe(true);
    expect(g.players[0].hp).toBe(57);
    expect(actError(g, { type: 'attack', player: 0, attackerUid: b, target: P(1) })).toContain('裏切った');
  });

  it('反動・施し：次のターンのエナジー−1、相手が1枚多く引く', () => {
    let g = rich(startGame());
    const c = card({ id: 'rc', rarity: 'legend', cost: 1, effects: [fx({ id: 'draw', value: 1, target: 'self' })], drawbacks: [{ id: 'recoil', timing: 'play' }, { id: 'gift', timing: 'play' }] });
    g = play(g, giveCard(g, 0, c));
    g = endTurn(g);
    expect(g.players[1].hand).toHaveLength(6); // 後攻の1ターン目は配られた5枚＋施しの1枚
    g = endTurn(g);
    expect(g.players[0].energy).toBe(2);
  });

  it('汚染・ノイズ：ノイズはエナジー1で除外でき、カードを使ったことに数えない', () => {
    let g = rich(startGame());
    g.players[0].hand.push({ uid: 'nz', cardId: battle.NOISE_CARD_ID, owner: 0 });
    g = act(g, { type: 'removeNoise', player: 0, cardUid: 'nz' });
    expect(g.players[0].exile.some((c) => c.uid === 'nz')).toBe(true);
    expect(g.players[0].turn.cardsPlayed).toBe(0);
  });
});
