/** 効果の条件の判定（条件の「相手」は相手プレイヤー：決定事項 #40） */
import { BALANCE } from '../balance.ts';
import type { ConditionId } from '../types.ts';
import { effectiveAttack, log, other } from './core.ts';
import { randInt } from './rng.ts';
import type { GameState, PlayerId } from './types.ts';

const C = BALANCE.conditionParams;

export interface ConditionOpts {
  /**
   * コイン投げを実際に投げる（効果を解決するとき）。省略すると投げずに「満たす」とみなす
   * （使う前の注意の表示などで乱数を進めないため）
   */
  roll?: { depth: number };
}

export function checkCondition(g: GameState, me: PlayerId, condition: ConditionId, opts: ConditionOpts = {}): boolean {
  const mine = g.players[me];
  const theirs = g.players[other(me)];
  /** 「このターン」の記録は自分のターン中だけ数える */
  const myTurn = g.active === me && g.phase === 'main';
  switch (condition) {
    case 'hasMonster':
      return mine.board.length > 0;
    case 'enemyHpHigher':
      return theirs.hp > mine.hp;
    case 'enemyPoisoned':
      return theirs.status.poison > 0;
    case 'lowHp':
      return mine.hp <= Math.floor(mine.maxHp / 2);
    case 'smallHand':
      return mine.hand.length <= C.smallHandMax;
    case 'enemyPoisonBurn':
      return theirs.status.poison > 0 && theirs.status.burn > 0;
    case 'nthCard':
      return mine.turn.cardsPlayed >= C.nthCardOrLater;
    case 'manyMonsters':
      return mine.board.length >= C.manyMonstersMin;
    case 'enemyDamagedThisTurn':
      return myTurn && mine.turn.enemyDamaged === true;
    case 'monsterDestroyedThisTurn':
      // どちらのターンでも、いま手番のプレイヤーのターンの記録を見る
      return g.phase === 'main' && (g.players[g.active].turn.monstersDestroyed ?? 0) >= 1;
    case 'allyAttackedThisTurn':
      return myTurn && (mine.turn.allyAttacks ?? 0) >= 1;
    case 'loneMonster':
      return mine.board.length === 1;
    case 'twoPowers':
      return mine.powers.length >= C.powersMin;
    case 'coinFlip': {
      if (!opts.roll) return true;
      const heads = randInt(g, 2) === 0;
      log(g, opts.roll.depth, `コイン投げ：${heads ? '表' : '裏'}`, 'info', undefined, {
        kind: 'status',
        player: me,
        status: 'coin',
        amount: heads ? 1 : 0,
      });
      return heads;
    }
    case 'secondPlayer':
      return g.first !== me;
    case 'emptyHand':
      return mine.hand.length === 0;
    case 'bigMonster':
      return mine.board.some((m) => effectiveAttack(m) >= C.bigMonsterAttack);
    case 'bigDiscard':
      return mine.discard.length >= C.discardMin;
    case 'monsterInHand':
      return mine.hand.some((c) => g.cards[c.cardId]?.stats);
    case 'twoSummonsThisTurn':
      return myTurn && (mine.turn.summoned ?? 0) >= C.summonsMin;
  }
}
