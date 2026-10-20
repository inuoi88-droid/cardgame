/** 効果の条件の判定（条件の「相手」は相手プレイヤー：決定事項 #40） */
import { BALANCE } from '../balance.ts';
import { classifyCard, isCurseCard } from '../classify.ts';
import type { ConditionId } from '../types.ts';
import { cardName, effectiveAttack, findMonster, log, other } from './core.ts';
import { randInt } from './rng.ts';
import { NOISE_CARD_ID, type CardInst, type GameState, type PlayerId, type SourceRef } from './types.ts';

const C = BALANCE.conditionParams;

export interface ConditionOpts {
  /**
   * コイン投げを実際に投げる（効果を解決するとき）。省略すると投げずに「満たす」とみなす
   * （使う前の注意の表示などで乱数を進めないため）
   */
  roll?: { depth: number };
  /** 効果の出どころ（「このモンスター」の条件が見る。MTG 要素 ○ バッチA）。省略すると「このモンスター」の条件は満たすとみなす */
  src?: SourceRef;
  /** カード1回の使用の記録のキー（濫用の記録） */
  protectKey?: string;
  /** コストの計算（これから使う1枚を「使ったカード」に数える。バッチC1の条件付き軽減） */
  forCost?: boolean;
}

/** 捨て札のカードの種類の数（昂揚）：モンスター・アタック・スキル・パワー（パワーアタックを含む）と、呪い。ノイズは数えない */
export function discardTypeCount(g: GameState, discard: readonly CardInst[]): number {
  const kinds = new Set<string>();
  for (const c of discard) {
    if (c.cardId === NOISE_CARD_ID) continue;
    const def = g.cards[c.cardId];
    if (!def) continue;
    const t = classifyCard(def);
    kinds.add(t === 'powerAttack' ? 'power' : t);
    if (isCurseCard(def)) kinds.add('curse');
  }
  return kinds.size;
}

/** 山札の一番上のカードのコスト（激突。山札が0枚なら −1） */
function topCost(g: GameState, p: PlayerId): { cost: number; name: string } {
  const top = g.players[p].deck[0];
  if (!top) return { cost: -1, name: '（山札なし）' };
  return { cost: top.cardId === NOISE_CARD_ID ? 0 : (g.cards[top.cardId]?.cost ?? 0), name: `『${cardName(g, top.cardId)}』` };
}

/** 出どころのモンスター（場にいて、出どころがモンスターのときだけ） */
function sourceMonster(g: GameState, src: SourceRef) {
  if (src.kind !== 'monster') return undefined;
  return findMonster(g, src.uid);
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
      return mine.board.some((m) => effectiveAttack(g, m) >= C.bigMonsterAttack);
    case 'bigDiscard':
      return mine.discard.length >= C.discardMin;
    case 'monsterInHand':
      return mine.hand.some((c) => g.cards[c.cardId]?.stats);
    case 'twoSummonsThisTurn':
      return myTurn && (mine.turn.summoned ?? 0) >= C.summonsMin;
    // ---- MTG 要素 ○ バッチA
    case 'enemyPlayedMany':
      // 相手が最後に終えたターンの記録（相手のターン中でも、今のターンではなく前のターン）
      return (theirs.lastTurn?.cardsPlayed ?? 0) >= C.enemyCardsMin;
    case 'veteran': {
      if (!opts.src) return true;
      const m = sourceMonster(g, opts.src);
      return m !== undefined && (m.counters.attacksTotal ?? 0) >= C.veteranAttacks;
    }
    case 'strongerAlly': {
      if (!opts.src) return true;
      const m = sourceMonster(g, opts.src);
      if (!m) return false;
      const atk = effectiveAttack(g, m);
      return g.players[m.controller].board.some((o) => o.uid !== m.uid && effectiveAttack(g, o) > atk);
    }
    case 'totalAttack':
      return mine.board.reduce((s, m) => s + effectiveAttack(g, m), 0) >= C.totalAttackMin;
    case 'twoAllyAttacks':
      return myTurn && (mine.turn.allyAttacks ?? 0) >= C.allyAttacksMin;
    case 'coven':
      return new Set(mine.board.map((m) => effectiveAttack(g, m))).size >= C.covenMin;
    case 'delirium':
      return discardTypeCount(g, mine.discard) >= C.deliriumMin;
    case 'criticalHp':
      return mine.hp <= Math.floor(mine.maxHp * C.criticalHpRate);
    case 'bigDamageThisTurn':
      return myTurn && (mine.turn.enemyDamageTotal ?? 0) >= C.bigDamageMin;
    case 'skillsInDiscard':
      return mine.discard.filter((c) => c.cardId !== NOISE_CARD_ID && g.cards[c.cardId] && classifyCard(g.cards[c.cardId]!) === 'skill').length >= C.skillsInDiscardMin;
    case 'healedThisTurn':
      return myTurn && mine.turn.healed === true;
    case 'enemyPoisonHigh':
      return theirs.status.poison >= C.enemyPoisonMin;
    case 'notFirstCard':
      return mine.turn.cardsPlayed + (opts.forCost ? 1 : 0) >= C.notFirstCardFrom;
    case 'clash': {
      if (!opts.roll) return true;
      const a = topCost(g, me);
      const b = topCost(g, other(me));
      const win = a.cost > b.cost;
      const show = (x: { cost: number; name: string }) => (x.cost < 0 ? x.name : `${x.name}（コスト${x.cost}）`);
      log(g, opts.roll.depth, `激突：${mine.name} ${show(a)} ／ ${theirs.name} ${show(b)} → ${win ? '勝ち' : '負け'}`, 'info', undefined, {
        kind: 'status',
        player: me,
        status: 'clash',
        amount: win ? 1 : 0,
      });
      return win;
    }
    case 'exploit':
      return opts.protectKey !== undefined && g.protect[opts.protectKey]?.exploited === true;
  }
}
