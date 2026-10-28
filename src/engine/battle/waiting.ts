/**
 * 待機ゾーン（MTG 要素 △ バッチC：予顕・計画・待機・ワープ・出来事）。
 * 手札から「待機させた」カードを置く場所。置いたターンより後の自分のターンに、そこから使う（待機は残りが0で自動で無料で使われる）。
 * 1人 battle.maxWaiting 枚まで。予顕のカードは裏向き（相手の viewFor では隠す）。解除・破壊・封殺の対象外、捨て札・山札に数えない
 */
import { BALANCE } from '../balance.ts';
import { getAbility } from '../registry.ts';
import type { AbilityDef } from '../define.ts';
import type { AbilityInstance, CardDef } from '../types.ts';
import { cardName, enqueue, log } from './core.ts';
import { effectiveCost, icedBlock } from './play.ts';
import { NOISE_CARD_ID, type CardInst, type GameState, type PlayerId, type SetAsideKind, type WaitingCard, type WaitingKind } from './types.ts';

/** 待機ゾーンの名前（ログ・画面用） */
export const WAITING_LABEL: Record<WaitingKind, string> = { foretell: '予顕', plot: '計画', suspend: '待機', warp: 'ワープ', adventure: '出来事' };

/** 待機ゾーンのカード（uid） */
export function waitingEntry(g: GameState, p: PlayerId, uid: string): WaitingCard | undefined {
  return (g.players[p].waiting ?? []).find((w) => w.card.uid === uid);
}

/** 待機ゾーンがいっぱいか */
export function waitingFull(g: GameState, p: PlayerId): boolean {
  return (g.players[p].waiting ?? []).length >= BALANCE.battle.maxWaiting;
}

/** カードの、手札から待機させる能力（kind を渡すとその種類だけ） */
export function setAsideOf(def: CardDef | undefined, kind?: SetAsideKind): { a: AbilityInstance; ad: AbilityDef; kind: SetAsideKind } | undefined {
  for (const a of def?.abilities ?? []) {
    const ad = getAbility(a.id);
    const sa = ad?.battle.setAside;
    if (ad && sa && (kind === undefined || sa.kind === kind)) return { a, ad, kind: sa.kind };
  }
  return undefined;
}

/** このカードの、手札から待機させる能力の種類（無ければ空） */
export function setAsideKinds(def: CardDef | undefined): SetAsideKind[] {
  return (def?.abilities ?? []).flatMap((a) => {
    const k = getAbility(a.id)?.battle.setAside?.kind;
    return k ? [k] : [];
  });
}

/** 待機させるときに払うエナジー（予顕は決まった値、待機は K、計画は今の実コスト） */
export function setAsideCost(g: GameState, p: PlayerId, card: CardInst, kind: SetAsideKind): number {
  const x = setAsideOf(g.cards[card.cardId], kind);
  if (!x) return 0;
  const fixed = x.ad.battle.setAside!.setCost?.(x.a);
  return fixed ?? effectiveCost(g, p, card, {});
}

/** 手札のカードを待機させられない理由（できるなら null） */
export function setAsideBlock(g: GameState, p: PlayerId, card: CardInst, kind: SetAsideKind): string | null {
  if (g.phase !== 'main' || g.active !== p || g.pending) return '今は待機させられません';
  if (card.cardId === NOISE_CARD_ID) return 'ノイズは待機させられません';
  const def = g.cards[card.cardId];
  const x = setAsideOf(def, kind);
  if (!def || !x) return `このカードには${WAITING_LABEL[kind]}がありません`;
  const ice = icedBlock(g, card);
  if (ice) return ice;
  if (waitingFull(g, p)) return `待機ゾーンは${BALANCE.battle.maxWaiting}枚までです`;
  const cost = setAsideCost(g, p, card, kind);
  if (g.players[p].energy < cost) return `エナジーが足りません（${x.ad.name}にエナジー${cost}）`;
  return null;
}

export function validateSetAside(g: GameState, p: PlayerId, cardUid: string, kind: SetAsideKind): string | null {
  if (kind !== 'foretell' && kind !== 'plot' && kind !== 'suspend') return '知らない待機のさせ方です';
  const card = g.players[p].hand.find((c) => c.uid === cardUid);
  if (!card) return 'そのカードは手札にありません';
  return setAsideBlock(g, p, card, kind);
}

/** カードを待機ゾーンに置く（いっぱいなら置かずに false）。time・hidden は待機・予顕 */
export function putWaiting(g: GameState, p: PlayerId, card: CardInst, kind: WaitingKind, depth: number, extra: { time?: number; hidden?: boolean } = {}): boolean {
  const ps = g.players[p];
  if (waitingFull(g, p)) return false;
  ps.waiting = [...(ps.waiting ?? []), { card, kind, since: g.turnIndex, ...(extra.time !== undefined ? { time: extra.time } : {}), ...(extra.hidden ? { hidden: true } : {}) }];
  if (kind === 'warp' || kind === 'adventure') {
    log(g, depth, `「${cardName(g, card.cardId)}」は待機ゾーンに置かれた（${WAITING_LABEL[kind]}。後の自分のターンに出せる）`, 'effect', undefined, {
      kind: 'waiting',
      player: p,
      cardId: card.cardId,
      uid: card.uid,
      status: kind,
    });
  }
  return true;
}

/** 手札のカードを待機させる（予顕・計画・待機）。カードを使ったことには数えない */
export function setAside(g: GameState, p: PlayerId, cardUid: string, kind: SetAsideKind): void {
  const ps = g.players[p];
  const i = ps.hand.findIndex((c) => c.uid === cardUid);
  const card = ps.hand[i]!;
  const def = g.cards[card.cardId]!;
  const x = setAsideOf(def, kind)!;
  const cost = setAsideCost(g, p, card, kind);
  const before = ps.energy;
  ps.energy -= cost;
  // 計画は今の実コストを払うので、凍結の+1・軽減効果はここで使う
  if (kind === 'plot') {
    ps.turn.freezeTax = false;
    ps.discount = 0;
  }
  ps.hand.splice(i, 1);
  const hidden = kind === 'foretell';
  const time = kind === 'suspend' ? (x.ad.battle.setAside!.time?.(x.a) ?? 1) : undefined;
  putWaiting(g, p, card, kind, 0, { ...(hidden ? { hidden: true } : {}), ...(time !== undefined ? { time } : {}) });
  const energy = `（エナジー${cost}、エナジー ${before}→${ps.energy}）`;
  if (hidden) {
    // 予顕：相手にはカードの名前を見せない
    log(g, 0, `${ps.name}は手札の1枚を予顕した（裏向きで待機）${energy}`, 'action', undefined, { kind: 'waiting', player: p, status: kind, amount: cost });
    log(g, 0, `予顕したカード：「${def.name}」（後のターンにコスト−${x.ad.battle.setAside!.cut?.(x.a) ?? 0}で使える）`, 'info', p);
    return;
  }
  const note = kind === 'plot' ? '（後のターンに無料で使える）' : `（あと${time}ターンで無料で使われる）`;
  log(g, 0, `${ps.name}は「${def.name}」を${x.ad.name}で待機させた${note}${energy}`, 'action', undefined, { kind: 'waiting', player: p, cardId: card.cardId, uid: card.uid, status: kind, amount: cost });
}

/**
 * 持ち主のターン開始時（予約の後・英雄譚の前）：待機のカードの残りを1減らし、0になったものを無料で使う（Step freePlay。モンスターは疾走）。
 * 無料で使う連鎖の段は0から（続唱とは別）
 */
export function tickSuspend(g: GameState, p: PlayerId): void {
  const ps = g.players[p];
  const list = ps.waiting ?? [];
  if (!list.some((w) => w.kind === 'suspend')) return;
  const keep: WaitingCard[] = [];
  const fire: CardInst[] = [];
  for (const w of list) {
    if (w.kind !== 'suspend') {
      keep.push(w);
      continue;
    }
    const time = (w.time ?? 1) - 1;
    if (time > 0) {
      keep.push({ ...w, time });
      log(g, 1, `待機の「${cardName(g, w.card.cardId)}」：あと${time}ターン`, 'info', undefined, { kind: 'waiting', player: p, cardId: w.card.cardId, uid: w.card.uid, status: 'tick', amount: time });
    } else fire.push(w.card);
  }
  ps.waiting = keep;
  for (const card of fire) {
    log(g, 1, `待機の「${cardName(g, card.cardId)}」の残りが0になった：無料で使われる`, 'effect', undefined, { kind: 'waiting', player: p, cardId: card.cardId, uid: card.uid, status: 'tick', amount: 0 });
    enqueue(g, { t: 'freePlay', player: p, card, depth: 1, freeDepth: 0, suspend: true });
  }
}
