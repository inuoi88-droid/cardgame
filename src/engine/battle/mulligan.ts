/** マリガン（決定事項 #47）：全部引き直しは1回目5枚、以降1枚ずつ減る。一部引き直しは1回だけで終了 */
import { BALANCE } from '../balance.ts';
import { isEnded, log } from './core.ts';
import { shuffle } from './rng.ts';
import { startTurn } from './turn.ts';
import { drawCards } from './zones.ts';
import { ruleHooks } from './rules.ts';
import type { GameState, MulliganMode, PlayerId } from './types.ts';

const B = BALANCE.battle;

/** 次に全部引き直したときの枚数（魔術師のリーダーは最初の手札の上乗せも配り直す：MTG 要素 △ バッチD） */
export function nextFullMulliganSize(g: GameState, p: PlayerId): number {
  const n = g.players[p].mulligan.fullCount;
  return B.drawPerTurn + ruleHooks(g, p).firstHand - Math.max(0, n);
}

export function validateMulligan(g: GameState, p: PlayerId, mode: MulliganMode, cardUids: string[] | undefined): string | null {
  if (g.phase !== 'mulligan') return '今はマリガンできません';
  const ps = g.players[p];
  if (ps.mulligan.done) return 'マリガンは終わっています';
  if (mode === 'all' && nextFullMulliganSize(g, p) < B.mulliganMinHand) return 'これ以上引き直せません';
  if (mode === 'partial') {
    const uids = new Set(cardUids ?? []);
    if (uids.size === 0) return '戻すカードを選んでください';
    if (uids.size >= ps.hand.length) return '全部戻すときは「全部引き直す」を選んでください';
    if ([...uids].some((u) => !ps.hand.some((c) => c.uid === u))) return '手札にないカードが含まれています';
  }
  return null;
}

function returnAndDraw(g: GameState, p: PlayerId, uids: Set<string>, drawCount: number): void {
  const ps = g.players[p];
  const back = ps.hand.filter((c) => uids.has(c.uid));
  ps.hand = ps.hand.filter((c) => !uids.has(c.uid));
  ps.deck.push(...back);
  shuffle(g, ps.deck);
  drawCards(g, p, drawCount, 1);
}

export function mulligan(g: GameState, p: PlayerId, mode: MulliganMode, cardUids: string[] | undefined): void {
  const ps = g.players[p];
  if (mode === 'keep') {
    ps.mulligan.done = true;
    log(g, 0, `${ps.name}は手札を決めた（${ps.hand.length}枚）`, 'action');
  } else if (mode === 'all') {
    const size = nextFullMulliganSize(g, p);
    log(g, 0, `${ps.name}は手札をすべて引き直した（${size}枚）`, 'action');
    returnAndDraw(g, p, new Set(ps.hand.map((c) => c.uid)), size);
    ps.mulligan.fullCount += 1;
  } else {
    const uids = new Set(cardUids ?? []);
    log(g, 0, `${ps.name}は手札を${uids.size}枚引き直した`, 'action');
    returnAndDraw(g, p, uids, uids.size);
    ps.mulligan.done = true;
  }
  if (isEnded(g)) return;
  if (g.players.every((x) => x.mulligan.done)) {
    g.phase = 'main';
    startTurn(g, g.first);
  }
}
