/**
 * マリガンの判断（決定事項 #72 A9）：コストの分布で決める。
 * 1〜2ターン目のエナジーで使えるカードが2枚以上あれば手札を決める（重すぎるカードがあれば、それだけ一部引き直す）。
 * 足りなければ、1回目は全部引き直し、2回目以降は重いカードだけ一部引き直す。
 */
import { BALANCE } from '../balance.ts';
import { nextFullMulliganSize } from '../battle/mulligan.ts';
import { energyForTurn } from '../battle/turn.ts';
import { NOISE_CARD_ID, type Action, type CardInst, type GameState, type PlayerId } from '../battle/types.ts';

/** 手札を決めるのに要る、早いターンに使えるカードの枚数 */
const KEEP_MIN_PLAYABLE = 2;
/** このターン目までに使えないカードは「重い」 */
const HEAVY_FROM_TURN = 4;

function costOf(g: GameState, c: CardInst): number {
  if (c.cardId === NOISE_CARD_ID) return Infinity;
  return g.cards[c.cardId]?.cost ?? Infinity;
}

export function decideMulligan(view: GameState, me: PlayerId): Action {
  const ps = view.players[me];
  const B = BALANCE.battle;
  const firstPenalty = me === view.first ? B.firstPlayerFirstTurnPenalty : 0;
  const early = Math.max(energyForTurn(1) - firstPenalty, energyForTurn(2));
  const heavy = energyForTurn(HEAVY_FROM_TURN);
  const costs = ps.hand.map((c) => costOf(view, c));
  const playable = costs.filter((c) => c <= early).length;
  const heavyUids = ps.hand.filter((_, i) => costs[i]! > heavy);
  const keep: Action = { type: 'mulligan', player: me, mode: 'keep' };
  const partial = (cards: CardInst[]): Action | null =>
    cards.length > 0 && cards.length < ps.hand.length ? { type: 'mulligan', player: me, mode: 'partial', cardUids: cards.map((c) => c.uid) } : null;

  if (playable >= KEEP_MIN_PLAYABLE) return partial(heavyUids) ?? keep;
  if (ps.mulligan.fullCount === 0 && nextFullMulliganSize(view, me) >= B.mulliganMinHand) {
    return { type: 'mulligan', player: me, mode: 'all' };
  }
  const notEarly = ps.hand.filter((_, i) => costs[i]! > early);
  return partial(notEarly) ?? keep;
}
