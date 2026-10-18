// 対戦の基本の流れ：開始、マリガン、エナジー、ドロー、再シャッフル、30ターン、決定性
import { describe, expect, it } from 'vitest';
import { battle, BALANCE } from '../../src/engine/index.ts';
import { FILLER, act, actError, deckOf, endTurn, startGame } from './helpers.ts';

const B = BALANCE.battle;
/** 1〜3ターン目の基本エナジー */
const E1 = B.energySchedule[0]!.energy;

describe('対戦の開始', () => {
  it('HP120、両者に5枚配ってマリガンから始まる', () => {
    const g = startGame({ mulligan: false });
    expect(g.phase).toBe('mulligan');
    for (const p of g.players) {
      expect(p.hp).toBe(B.playerHp);
      expect(p.hand).toHaveLength(B.drawPerTurn);
      expect(p.deck).toHaveLength(30 - B.drawPerTurn);
    }
  });

  it('ルール違反のデッキでは始められない', () => {
    const r = battle.createGame({
      seed: 1,
      players: [
        { name: 'A', deck: { ...deckOf([FILLER]), entries: [{ cardId: FILLER.id, count: 29 }] }, cards: [FILLER] },
        { name: 'B', deck: deckOf([FILLER]), cards: [FILLER] },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it('先攻・後攻はシードで決まり、同じシードなら同じ結果', () => {
    const firsts = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const make = () =>
        battle.createGame({
          seed,
          players: [
            { name: 'A', deck: deckOf([FILLER]), cards: [FILLER] },
            { name: 'B', deck: deckOf([FILLER]), cards: [FILLER] },
          ],
        });
      const a = make();
      const b = make();
      expect(a.ok && b.ok && JSON.stringify(a.state) === JSON.stringify(b.state)).toBe(true);
      if (a.ok) firsts.add(a.state.first);
    }
    expect(firsts.size).toBe(2);
  });
});

describe('マリガン', () => {
  it('全部引き直しは1回目5枚、2回目4枚、3回目3枚', () => {
    let g = startGame({ mulligan: false });
    g = act(g, { type: 'mulligan', player: 0, mode: 'all' });
    expect(g.players[0].hand).toHaveLength(5);
    g = act(g, { type: 'mulligan', player: 0, mode: 'all' });
    expect(g.players[0].hand).toHaveLength(4);
    g = act(g, { type: 'mulligan', player: 0, mode: 'all' });
    expect(g.players[0].hand).toHaveLength(3);
    expect(g.players[0].deck.length + g.players[0].hand.length).toBe(30);
  });

  it('一部引き直しは1回だけで、マリガンが終わる', () => {
    let g = startGame({ mulligan: false });
    const two = g.players[0].hand.slice(0, 2).map((c) => c.uid);
    g = act(g, { type: 'mulligan', player: 0, mode: 'partial', cardUids: two });
    expect(g.players[0].hand).toHaveLength(5);
    expect(g.players[0].mulligan.done).toBe(true);
    actError(g, { type: 'mulligan', player: 0, mode: 'all' });
  });

  it('両者が決めたら先攻の1ターン目が始まる（先攻はエナジー2、1ターン目は引かない）', () => {
    const g = startGame();
    expect(g.phase).toBe('main');
    expect(g.active).toBe(0);
    expect(g.players[0].energy).toBe(E1 - B.firstPlayerFirstTurnPenalty);
    expect(g.players[0].energy).toBe(2);
    expect(g.players[0].hand).toHaveLength(5);
  });
});

describe('ターンの流れ', () => {
  it('後攻の1ターン目はエナジー3で引かない。2ターン目からは5枚引く', () => {
    let g = startGame();
    g = endTurn(g);
    expect(g.active).toBe(1);
    expect(g.players[1].energy).toBe(E1);
    expect(g.players[1].hand).toHaveLength(5);
    // 先攻のターン終了で手札はすべて捨て札へ
    expect(g.players[0].hand).toHaveLength(0);
    expect(g.players[0].discard).toHaveLength(5);
    g = endTurn(g);
    expect(g.active).toBe(0);
    expect(g.players[0].hand).toHaveLength(5);
    expect(g.players[0].energy).toBe(E1);
  });

  it('エナジーは持ち越さない', () => {
    let g = startGame();
    g.players[0].energy = 9;
    g = endTurn(g);
    g = endTurn(g);
    expect(g.players[0].energy).toBe(E1);
  });

  it('エナジーは成長する：1〜3ターン目 3、4〜6ターン目 4、7ターン目以降 5（自分のターン数で数える：#69）', () => {
    expect(B.energySchedule).toEqual([
      { fromTurn: 1, energy: 3 },
      { fromTurn: 4, energy: 4 },
      { fromTurn: 7, energy: 5 },
    ]);
    let g = startGame();
    const energyAtTurn = (turn: number) => {
      while (g.players[0].turnsTaken < turn) g = endTurn(endTurn(g));
      expect(g.active).toBe(0);
      return g.players[0].energy;
    };
    expect(energyAtTurn(3)).toBe(3);
    expect(energyAtTurn(4)).toBe(4);
    expect(g.log.some((e) => e.text.includes('このターンから基本4'))).toBe(true);
    expect(energyAtTurn(6)).toBe(4);
    expect(energyAtTurn(7)).toBe(5);
    expect(energyAtTurn(12)).toBe(5);
    // 後攻も自分のターン数で数える（4ターン目に4）
    g = endTurn(g);
    expect(g.active).toBe(1);
    expect(g.players[1].turnsTaken).toBe(12);
    expect(g.players[1].energy).toBe(5);
  });

  it('山札が尽きたら捨て札をシャッフルして山札にする', () => {
    let g = startGame();
    for (let i = 0; i < 12; i++) g = endTurn(g);
    const p = g.players[0];
    expect(p.hand.length + p.deck.length + p.discard.length).toBe(30);
    expect(g.log.some((e) => e.text.includes('シャッフルして山札にした'))).toBe(true);
  });

  it('各プレイヤー30ターンで引き分け', () => {
    let g = startGame();
    for (let i = 0; i < 59; i++) g = endTurn(g);
    expect(g.phase).toBe('main');
    expect(g.players[1].turnsTaken).toBe(30);
    g = endTurn(g);
    expect(g.phase).toBe('ended');
    expect(g.result).toEqual({ winner: null, reason: 'turnLimit' });
  });

  it('自分のターンでなければ行動できない', () => {
    const g = startGame();
    expect(actError(g, { type: 'endTurn', player: 1 })).toBe('自分のターンではありません');
  });

  it('降参すると相手の勝ち', () => {
    const g = act(startGame(), { type: 'concede', player: 0 });
    expect(g.result).toEqual({ winner: 1, reason: 'concede' });
  });

  it('applyAction は元の状態を書き換えない', () => {
    const g = startGame();
    const before = JSON.stringify(g);
    endTurn(g);
    expect(JSON.stringify(g)).toBe(before);
  });
});
