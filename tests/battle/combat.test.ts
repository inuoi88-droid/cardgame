// モンスターの戦闘とキーワード・状態異常・デメリット（HP は 120：決定事項 #69）
import { describe, expect, it } from 'vitest';
import { BALANCE, battle } from '../../src/engine/index.ts';
import { card } from '../helpers.ts';
import { FILLER, M, P, act, actError, attack, deckOf, endTurn, fx, giveCard, logText, monster, play, putMonster, rich, startGame } from './helpers.ts';

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
    expect(g.players[1].hp).toBe(118);
  });

  it('速攻は召喚したターンから攻撃できる', () => {
    let g = rich(startGame());
    const uid = giveCard(g, 0, unit(2, 2, 0, kw('haste')));
    g = play(g, uid);
    g = attack(g, uid, P(1));
    expect(g.players[1].hp).toBe(118);
  });

  it('毎ターン1回、二回攻撃なら2回', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(1, 2));
    const b = putMonster(g, 0, unit(1, 2, 0, kw('doubleAttack')));
    g = attack(g, a, P(1));
    actError(g, { type: 'attack', player: 0, attackerUid: a, target: P(1) });
    g = attack(attack(g, b, P(1)), b, P(1));
    expect(g.players[1].hp).toBe(117);
  });

  it('攻撃力 − 守備力、最低1', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(2, 5, 9));
    const d = putMonster(g, 1, unit(1, 10, 3));
    g = attack(g, a, M(d));
    expect(monster(g, d)!.hp).toBe(9);
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

describe('モンスターの反撃（#69）', () => {
  it('モンスターを攻撃すると、守備側の攻撃力ぶんが攻撃したモンスターに返る（守備力で減る・最低1）', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(2, 10, 2));
    const d = putMonster(g, 1, unit(5, 10, 3));
    g = attack(g, a, M(d));
    expect(monster(g, d)!.hp).toBe(9);
    expect(monster(g, a)!.hp).toBe(7); // 5 − 守備力2
    expect(logText(g)).toContain('P1の「モンスター');
    expect(g.log.some((e) => e.text.includes('の反撃：') && e.ev?.kind === 'retaliate' && e.ev.amount === 3)).toBe(true);
    // 攻撃力が守備力以下でも最低1
    const b = putMonster(g, 0, unit(1, 10, 9));
    g = attack(g, b, M(d));
    expect(monster(g, b)!.hp).toBe(9);
  });

  it('プレイヤーを攻撃しても反撃はない', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(2, 5));
    putMonster(g, 1, unit(9, 9));
    g = attack(g, a, P(1));
    expect(g.players[1].hp).toBe(118);
    expect(monster(g, a)!.hp).toBe(5);
    expect(g.log.some((e) => e.ev?.kind === 'retaliate')).toBe(false);
  });

  it('封印・凍結されていても反撃する。守備側の「攻撃するたび」は発動しない', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(1, 10));
    const d = putMonster(g, 1, unit(3, 10, 0, { effects: [fx({ id: 'damage', value: 5, timing: 'attack', target: 'enemyPlayer' })] }), { sealed: true });
    monster(g, d)!.status.freezeActive = true;
    g = attack(g, a, M(d));
    expect(monster(g, a)!.hp).toBe(7);
    expect(g.players[0].hp).toBe(120);
  });

  it('同時に解決する：倒された守備側も反撃し、相打ちになる', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(3, 3));
    const d = putMonster(g, 1, unit(3, 3));
    g = attack(g, a, M(d));
    expect(monster(g, a)).toBeUndefined();
    expect(monster(g, d)).toBeUndefined();
    expect(g.players[0].discard.some((c) => c.uid === a)).toBe(true);
    expect(g.players[1].discard.some((c) => c.uid === d)).toBe(true);
  });

  it('反撃には攻撃側の脆弱・出血と、守備側のやけどが働く', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(1, 20));
    const d = putMonster(g, 1, unit(4, 20));
    monster(g, a)!.status.vulnerable = 1;
    monster(g, a)!.status.bleed = 2;
    g = attack(g, a, M(d));
    expect(monster(g, a)!.hp).toBe(20 - (6 + 2)); // 4 → 脆弱で6 → 出血+2
    monster(g, d)!.status.burn = 1;
    const b = putMonster(g, 0, unit(1, 20));
    g = attack(g, b, M(d));
    expect(monster(g, b)!.hp).toBe(18); // 4 → やけどで2
  });

  it('攻撃力0のモンスターは反撃しない。balance で切れる', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(1, 5));
    const d = putMonster(g, 1, unit(0, 5));
    g = attack(g, a, M(d));
    expect(monster(g, a)!.hp).toBe(5);
    const flag = BALANCE.battle.retaliation as { enabled: boolean };
    flag.enabled = false;
    try {
      const e = putMonster(g, 1, unit(4, 5));
      g = endTurn(endTurn(g));
      g = attack(g, a, M(e));
      expect(monster(g, a)!.hp).toBe(5);
    } finally {
      flag.enabled = true;
    }
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
    expect(g.players[1].hp).toBe(119);
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

  it('貫通：倒して余ったダメージが相手プレイヤーに通る（反撃は別に受ける）', () => {
    let g = startGame();
    const a = putMonster(g, 0, unit(7, 5, 0, kw('trample')));
    const d = putMonster(g, 1, unit(1, 3, 1));
    g = attack(g, a, M(d));
    // 7−1=6、体力3を倒して余り3
    expect(g.players[1].hp).toBe(117);
    expect(monster(g, a)!.hp).toBe(4);
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
    expect(g.players[0].hp).toBe(117);
  });

  it('凍結：プレイヤーは最初に使うカードのコスト+1', () => {
    let g = startGame();
    g.players[1].status.freezePending = true;
    g = endTurn(g);
    const c = giveCard(g, 1, card({ id: 'c1', cost: 1, effects: [fx({ id: 'damage', value: 2 })] }));
    const info = battle.playInfo(g, 1, g.players[1].hand.find((x) => x.uid === c)!);
    expect(info.cost).toBe(2);
    const before = g.players[1].energy;
    g = play(g, c, { enemy: P(0) });
    expect(g.players[1].energy).toBe(before - 2);
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
    expect(g.players[1].hp).toBe(119); // 維持費は残る
    g = attack(g, enemy, P(0));
    expect(g.players[0].hp).toBe(118); // 攻撃するたびのダメージは出ない
  });
});

describe('デメリット', () => {
  const parasite = () => card({ id: 'para', cost: 0, effects: [fx({ id: 'damage', value: 1 })], drawbacks: [{ id: 'parasite', timing: null }] });

  it('維持費：場にいる間、持ち主のターン開始時に1ダメージ', () => {
    let g = startGame();
    putMonster(g, 1, unit(1, 3, 0, { drawbacks: [{ id: 'upkeep', timing: null }] }));
    g = endTurn(g);
    expect(g.players[1].hp).toBe(119);
  });

  it('寄生：このカードを引いたとき自分に2ダメージ（手札にあるだけでは何も起きない：#70 R7）', () => {
    let g = startGame();
    const def = parasite();
    g.cards['p0:para'] = def;
    giveCard(g, 0, def);
    g = endTurn(g);
    expect(g.players[0].hp).toBe(120);
    // 次の自分のターンに山札の一番上から引く
    g.players[0].deck.unshift({ uid: 'para-top', cardId: 'p0:para', owner: 0 });
    g = endTurn(g);
    expect(g.players[0].hp).toBe(118);
    expect(g.log.some((e) => e.text.includes('引いたカードのデメリット：寄生') && e.private === undefined)).toBe(true);
  });

  it('寄生：対戦開始時の手札とマリガンの引き直しでも働く', () => {
    const def = parasite();
    const r = battle.createGame({
      seed: 1,
      first: 0,
      players: [
        { name: 'P0', deck: { ...deckOf([FILLER]), entries: [{ cardId: FILLER.id, count: 25 }, { cardId: def.id, count: 5 }] }, cards: [FILLER, def] },
        { name: 'P1', deck: deckOf([FILLER]), cards: [FILLER] },
      ],
    });
    if (!r.ok) throw new Error(r.error);
    let g = r.state;
    const inHand = g.players[0].hand.filter((c) => c.cardId === 'p0:para').length;
    expect(g.players[0].hp).toBe(120 - 2 * inHand);
    g = act(g, { type: 'mulligan', player: 0, mode: 'all' });
    const after = g.players[0].hand.filter((c) => c.cardId === 'p0:para').length;
    expect(g.players[0].hp).toBe(120 - 2 * (inHand + after));
  });

  it('手札喪失：手札がなければ、代わりに次のターンに引く枚数−1', () => {
    let g = rich(startGame());
    g.players[0].hand = [];
    g = play(g, giveCard(g, 0, card({ id: 'dr', rarity: 'legend', cost: 1, effects: [fx({ id: 'shield', value: 1, target: 'self' })], drawbacks: [{ id: 'discardRandom', timing: 'play' }] })));
    expect(g.players[0].next.draw).toBe(-1);
    expect(g.log.some((e) => e.text.includes('次のターンに引く枚数−1'))).toBe(true);
    g = endTurn(endTurn(g));
    expect(g.players[0].hand).toHaveLength(4);
  });

  it('裏切り：持ち主のターンを3回迎えたら、ターン開始時に持ち主を攻撃する', () => {
    let g = rich(startGame());
    const b = giveCard(g, 0, unit(3, 9, 0, { drawbacks: [{ id: 'betrayal', timing: null }] }));
    g = play(g, b);
    for (let i = 0; i < 2; i++) g = endTurn(endTurn(g));
    expect(monster(g, b)!.betraying).toBe(false);
    expect(g.players[0].hp).toBe(120);
    g = endTurn(endTurn(g));
    expect(monster(g, b)!.betraying).toBe(true);
    expect(g.players[0].hp).toBe(117);
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
