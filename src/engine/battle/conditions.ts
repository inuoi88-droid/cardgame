/** 効果の条件の判定（条件の「相手」は相手プレイヤー：決定事項 #40） */
import { BALANCE } from '../balance.ts';
import type { ConditionId } from '../types.ts';
import { other } from './core.ts';
import type { GameState, PlayerId } from './types.ts';

const C = BALANCE.conditionParams;

export function checkCondition(g: GameState, me: PlayerId, condition: ConditionId): boolean {
  const mine = g.players[me];
  const theirs = g.players[other(me)];
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
  }
}
