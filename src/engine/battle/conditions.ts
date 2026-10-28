/** 効果の条件の判定（条件の「相手」は相手プレイヤー：決定事項 #40） */
import { BALANCE } from '../balance.ts';
import { classifyCard, isCurseCard } from '../classify.ts';
import type { ConditionId } from '../types.ts';
import { cardName, effectiveAttack, findMonster, log, other } from './core.ts';
import { randInt } from './rng.ts';
import { ARMY_CARD_ID, NOISE_CARD_ID, type CardInst, type GameState, type Monster, type PlayerId, type SourceRef } from './types.ts';

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
  /**
   * コストの計算（MTG 要素 ○ バッチC1 の条件付き軽減）：これから使う1枚を「使ったカード」に数え、
   * 手札の条件ではその1枚（selfUid）を数えない
   */
  forCost?: boolean;
  selfUid?: string;
  /** 条件を持つカード（MTG 要素 ○ バッチC2：種族の条件。src があれば src のカード） */
  cardId?: string;
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

/** 条件で数える場のモンスター：トークン（小鬼・複写・卵など）は数えない。軍団は数える（ユーザー指示。決定事項 #146） */
export function conditionBoard(board: readonly Monster[]): Monster[] {
  return board.filter((m) => !m.card.token || m.card.cardId === ARMY_CARD_ID);
}

export function checkCondition(g: GameState, me: PlayerId, condition: ConditionId, opts: ConditionOpts = {}): boolean {
  const mine = g.players[me];
  const theirs = g.players[other(me)];
  /** 手札（コストの計算なら、これから使う1枚を除く） */
  const hand = opts.selfUid ? mine.hand.filter((c) => c.uid !== opts.selfUid) : mine.hand;
  /** このターン使ったカードの数（コストの計算なら、これから使う1枚を足す） */
  const played = mine.turn.cardsPlayed + (opts.forCost ? 1 : 0);
  /** 「このターン」の記録は自分のターン中だけ数える */
  const myTurn = g.active === me && g.phase === 'main';
  switch (condition) {
    case 'hasMonster':
      return conditionBoard(mine.board).length > 0;
    case 'enemyHpHigher':
      return theirs.hp > mine.hp;
    case 'enemyPoisoned':
      return theirs.status.poison > 0;
    case 'lowHp':
      return mine.hp <= Math.floor(mine.maxHp / 2);
    case 'smallHand':
      return hand.length <= C.smallHandMax;
    case 'enemyPoisonBurn':
      return theirs.status.poison > 0 && theirs.status.burn > 0;
    case 'nthCard':
      return played >= C.nthCardOrLater;
    case 'manyMonsters':
      return conditionBoard(mine.board).length >= C.manyMonstersMin;
    case 'enemyDamagedThisTurn':
      return myTurn && mine.turn.enemyDamaged === true;
    case 'monsterDestroyedThisTurn':
      // どちらのターンでも、いま手番のプレイヤーのターンの記録を見る
      return g.phase === 'main' && (g.players[g.active].turn.monstersDestroyed ?? 0) >= 1;
    case 'allyAttackedThisTurn':
      return myTurn && (mine.turn.allyAttacks ?? 0) >= 1;
    case 'loneMonster':
      return conditionBoard(mine.board).length === 1;
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
      return hand.length === 0;
    case 'bigMonster':
      return conditionBoard(mine.board).some((m) => effectiveAttack(g, m) >= C.bigMonsterAttack);
    case 'bigDiscard':
      return mine.discard.length >= C.discardMin;
    case 'monsterInHand':
      return hand.some((c) => g.cards[c.cardId]?.stats);
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
      return conditionBoard(g.players[m.controller].board).some((o) => o.uid !== m.uid && effectiveAttack(g, o) > atk);
    }
    case 'totalAttack':
      return conditionBoard(mine.board).reduce((s, m) => s + effectiveAttack(g, m), 0) >= C.totalAttackMin;
    case 'twoAllyAttacks':
      return myTurn && (mine.turn.allyAttacks ?? 0) >= C.allyAttacksMin;
    case 'coven':
      return new Set(conditionBoard(mine.board).map((m) => effectiveAttack(g, m))).size >= C.covenMin;
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
      return played >= C.notFirstCardFrom;
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
    // ---- MTG 要素 ○ バッチC1
    case 'kicked':
      return opts.protectKey !== undefined && g.protect[opts.protectKey]?.kicked === true;
    // ---- MTG 要素 ○ バッチC2
    case 'tribeAlly': {
      const cardId = opts.src?.cardId ?? opts.cardId;
      if (cardId === undefined) return true;
      const tribe = g.cards[cardId]?.tribe;
      if (!tribe) return false;
      const self = opts.src?.kind === 'monster' ? opts.src.uid : undefined;
      return conditionBoard(mine.board).some((m) => m.uid !== self && g.cards[m.card.cardId]?.tribe === tribe);
    }
    case 'maxSpeed':
      return (mine.speed ?? 0) >= BALANCE.speed.max;
    case 'hasCrown':
      return g.crown === me;
    // ---- MTG 要素 △ バッチA
    case 'converge': {
      // このターンに使ったカードの種類（コストの計算なら、これから使う1枚の種類も）
      if (!myTurn) return false;
      const kinds = new Set(mine.turn.typesPlayed ?? []);
      if (opts.forCost && opts.selfUid) {
        const card = [...mine.hand, ...mine.discard].find((c) => c.uid === opts.selfUid);
        const def = card ? g.cards[card.cardId] : undefined;
        if (def) {
          const t = classifyCard(def);
          kinds.add(t === 'powerAttack' ? 'power' : t);
        }
      }
      return kinds.size >= C.convergeMin;
    }
    case 'descend':
      return (
        mine.discard.filter((c) => {
          const def = c.cardId === NOISE_CARD_ID ? undefined : g.cards[c.cardId];
          if (!def) return false;
          const t = classifyCard(def);
          return t === 'monster' || t === 'power' || t === 'powerAttack';
        }).length >= C.descendMin
      );
    case 'rested': {
      if (!opts.src) return true;
      const m = sourceMonster(g, opts.src);
      return m !== undefined && m.counters.attackedTurn !== g.turnIndex;
    }
    // ---- MTG 要素 △ バッチB
    case 'bargained':
      return opts.protectKey !== undefined && g.protect[opts.protectKey]?.bargained === true;
    // ---- MTG 要素 △ バッチC：出どころのモンスター・パワー（紋章を含む）の達成・Lv。出どころが無ければ満たすとみなす
    case 'achieved': {
      if (!opts.src) return true;
      return sourceState(g, me, opts.src)?.achieved === true;
    }
    case 'level2':
    case 'level3': {
      if (!opts.src) return true;
      const s = sourceState(g, me, opts.src);
      if (!s) return false;
      return s.level >= (condition === 'level2' ? 2 : BALANCE.battle.maxLevel);
    }
    // ---- MTG 要素 △ バッチD：昼と夜（まだ始まっていなければどちらも偽）
    case 'isDay':
      return g.dayNight === 'day';
    case 'isNight':
      return g.dayNight === 'night';
  }
}

/** 出どころのモンスター・パワーの達成と Lv（MTG 要素 △ バッチC）。場に無ければ undefined */
function sourceState(g: GameState, me: PlayerId, src: SourceRef): { achieved: boolean; level: number } | undefined {
  if (src.kind === 'monster') {
    const m = findMonster(g, src.uid);
    return m ? { achieved: m.achieved === true, level: m.counters.level ?? 1 } : undefined;
  }
  if (src.kind === 'power') {
    const ps = g.players[me];
    const pw = [...ps.powers, ...(ps.emblems ?? [])].find((x) => x.uid === src.uid);
    return pw ? { achieved: pw.achieved === true, level: pw.level ?? 1 } : undefined;
  }
  return undefined;
}
