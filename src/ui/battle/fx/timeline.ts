/**
 * 演出の時間割（決定事項 #126）。buildEvents の出来事に「次までの間（ms）」を付け直す純粋関数。
 *
 * - 効果（cast）と攻撃は組（group）：弾が飛ぶ間だけ待ち、着弾（ダメージ・回復・状態）は同じ組なら少しずつずらして重ねる。
 * - 組でない続きの浮かぶ数字（ターン開始の毒など）は滝のように少しずつずらす。
 * - 控えめ（calm：アプリの設定・動きを減らす）は飛ぶ・粒を出さないので、その分短い。
 * - 1回の行動で長くなりすぎたら（オンラインでまとめて届いたときなど）全体を縮める。
 * 1つの演出の見えている時間（director.ts）は、この間とは別（次の出来事と重なってよい）。
 */
import type { BattleEvent } from '../events.ts';

export type FxLevel = 'full' | 'calm';

/** 弾が飛ぶ時間（標準） */
export const TRAVEL_MS = 260;
/** 1回の行動の演出の上限の目安（これを超えたら縮める） */
const BUDGET_MS = 7000;
const MIN_FACTOR = 0.45;

/** 着弾になる出来事（同じ組の中で重ねる） */
const isImpact = (e: BattleEvent | undefined): boolean => !!e && (e.show.t === 'float' || e.show.t === 'zone' || e.show.t === 'energy' || e.show.t === 'summon' || e.show.t === 'destroy');

/** 弾を飛ばす型（相手に向けるもの）。回復・守り・強化は飛ばさず、対象でその場の光だけ */
const TRAVEL_ARCHS: ReadonlySet<string> = new Set(['bolt', 'debuff', 'bind', 'shatter', 'move']);

/** cast が弾を飛ばすか（出どころと別の対象がある・型が飛ぶもの） */
export function travels(e: BattleEvent): boolean {
  const s = e.show;
  if (s.t !== 'cast' || !TRAVEL_ARCHS.has(s.arch)) return false;
  return s.src !== null && s.targets.some((t) => t !== s.src);
}

/** 次が新しい行動の始まり（ターン・カード・攻撃）か、もう無い：そこまでの着弾は少し長めに見せる */
const breakAfter = (next: BattleEvent | undefined): boolean =>
  next === undefined || next.show.t === 'turn' || next.show.t === 'reveal' || next.show.t === 'played' || next.show.t === 'attack' || next.show.t === 'notice';

function baseGap(e: BattleEvent, next: BattleEvent | undefined, level: FxLevel): number {
  const calm = level === 'calm';
  const sameGroup = next !== undefined && e.group !== undefined && next.group === e.group;
  /** 組の最後の着弾のあと */
  const settle = breakAfter(next) ? (calm ? 300 : 380) : calm ? 220 : 260;
  const s = e.show;
  switch (s.t) {
    case 'turn':
      return calm ? 650 : 760;
    case 'reveal':
      // 飛んで来る 200・読む 590・対象へ 210（控えめは出て消えるだけ）
      return calm ? 760 : 1000;
    case 'played':
      return calm ? 160 : 240;
    case 'cast': {
      if (!sameGroup) return settle + 60;
      if (travels(e)) return calm ? 140 : TRAVEL_MS + 20;
      return calm ? 100 : 120;
    }
    case 'attack':
      // 踏み込みの頂点で当たる
      return calm ? 140 : 230;
    case 'float': {
      if (sameGroup && isImpact(next)) return 60;
      // 組でない続き（ターン開始の毒・再生など）は滝
      if (!sameGroup && next?.show.t === 'float' && next.group === undefined && e.group === undefined) return 110;
      return settle;
    }
    case 'summon':
      if (sameGroup && next?.show.t === 'summon') return 140;
      if (sameGroup && isImpact(next)) return 220;
      return Math.max(settle, calm ? 300 : 360);
    case 'destroy':
      if (next?.show.t === 'destroy') return 120;
      if (sameGroup && isImpact(next)) return 160;
      return settle;
    case 'zone':
      if (next?.show.t === 'zone') return 120;
      return Math.min(settle, calm ? 220 : 280);
    case 'energy':
      if (s.n === 0) return 40;
      if (sameGroup && isImpact(next)) return 80;
      return Math.min(settle, calm ? 220 : 280);
    case 'tint':
      return 140;
    case 'notice':
      return calm ? 560 : 650;
    case 'activate':
      return calm ? 420 : 520;
    case 'tick':
      return e.ms;
  }
}

/** 出来事の「次までの間」を付け直した写しを返す */
export function planTimeline(events: BattleEvent[], level: FxLevel): BattleEvent[] {
  const out = events.map((e, i) => ({ ...e, ms: baseGap(e, events[i + 1], level) }));
  const total = out.reduce((n, e) => n + e.ms, 0);
  if (total > BUDGET_MS) {
    const f = Math.max(MIN_FACTOR, BUDGET_MS / total);
    for (const e of out) e.ms = Math.max(40, Math.round(e.ms * f));
  }
  return out;
}

/** 演出全体の長さ（ミリ秒。測定・テスト用） */
export function timelineMs(events: BattleEvent[], opts: { level: FxLevel }): number {
  return planTimeline(events, opts.level).reduce((n, e) => n + e.ms, 0);
}
