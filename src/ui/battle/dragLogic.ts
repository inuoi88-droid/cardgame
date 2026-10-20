/**
 * ドラッグ＆ドロップの判断（純粋関数。DOM を使わない。tests/battle/dragLogic.test.ts）。
 * - planDrag：つかんだもの（手札のカード・攻撃するモンスター）から、光らせる対象・使う場所・見た目（ゴースト／矢印）を決める
 * - pickSpot：指の位置と、落とせる場所の矩形から、どこに落としたかを決める（少しずれても対象に吸い付く）
 * - resolveDrop：落とした場所を行動に変える（足りない選択は「続けて選ぶ」にする）
 * - gestureOf：押してから動いた量で、ドラッグを始めるか（手札は横スクロールと区別する）
 * 対象の候補はエンジンの playInfo・attackTargets をそのまま使う（効果の種類はここでは見ない）。
 */
import type { battle } from '../../engine/index.ts';

type PlayerId = battle.PlayerId;
type TargetRef = battle.TargetRef;
type Chosen = battle.Chosen;

/** つかんだもの */
export type DragSource =
  | {
      kind: 'card';
      uid: string;
      /** ノイズ（場に落とすと除外） */
      noise: boolean;
      /** 使えない理由（エナジー不足・相手の番など。使えるなら null） */
      blocked: string | null;
      enemyTargets: TargetRef[];
      /** 自分のモンスターの候補（モンスターカードならこのカード自身の uid も入る） */
      allyTargets: string[];
    }
  | { kind: 'attacker'; uid: string; blocked: string | null; targets: TargetRef[] };

/** 落とせる場所 */
export type Spot = { kind: 'monster'; uid: string } | { kind: 'player'; player: PlayerId } | { kind: 'zone' } | { kind: 'hand' } | { kind: 'none' };

export const spotKey = (s: Spot): string =>
  s.kind === 'monster' ? `m:${s.uid}` : s.kind === 'player' ? `p:${s.player}` : s.kind;

export const targetKey = (t: TargetRef): string => (t.kind === 'monster' ? `m:${t.uid}` : `p:${t.player}`);

export function parseSpot(key: string | null | undefined): Spot {
  if (!key) return { kind: 'none' };
  if (key.startsWith('m:')) return { kind: 'monster', uid: key.slice(2) };
  if (key === 'p:0' || key === 'p:1') return { kind: 'player', player: Number(key[2]) as PlayerId };
  if (key === 'zone' || key === 'hand') return { kind: key };
  return { kind: 'none' };
}

const spotTarget = (s: Spot): TargetRef | null =>
  s.kind === 'monster' ? { kind: 'monster', uid: s.uid } : s.kind === 'player' ? { kind: 'player', player: s.player } : null;

const sameRef = (a: TargetRef, b: TargetRef) =>
  a.kind === 'player' ? b.kind === 'player' && a.player === b.player : b.kind === 'monster' && a.uid === b.uid;

/** 「ここに離して使う」の場所の役目。play＝使う / self＝このモンスター自身を選んで使う / noise＝ノイズを除外 */
export type ZoneRole = 'play' | 'self' | 'noise';

export interface DragPlan {
  /** ghost＝カードが指についてくる（対象なし）/ arrow＝カードから指へ矢印（対象を選ぶ） */
  mode: 'ghost' | 'arrow';
  /** 光らせる対象（落とすと決まるもの） */
  targets: TargetRef[];
  /** 「ここに離して使う」の場所（出さないなら null） */
  zone: ZoneRole | null;
  /** ドラッグ中に指の近くに出す短い案内 */
  hint: string;
}

const needsEnemy = (s: Extract<DragSource, { kind: 'card' }>) => s.enemyTargets.length > 0;
const needsAlly = (s: Extract<DragSource, { kind: 'card' }>) => s.allyTargets.length > 0;

export function planDrag(src: DragSource): DragPlan {
  if (src.kind === 'attacker') {
    if (src.blocked) return { mode: 'arrow', targets: [], zone: null, hint: src.blocked };
    return { mode: 'arrow', targets: src.targets, zone: null, hint: src.targets.length ? '攻撃する相手の上で離す' : '攻撃できる相手がいません' };
  }
  if (src.noise) {
    if (src.blocked && src.blocked !== 'ノイズ') return { mode: 'ghost', targets: [], zone: null, hint: src.blocked };
    return { mode: 'ghost', targets: [], zone: 'noise', hint: '場で離すと除外' };
  }
  if (src.blocked) return { mode: needsEnemy(src) || needsAlly(src) ? 'arrow' : 'ghost', targets: [], zone: null, hint: src.blocked };
  const others = src.allyTargets.filter((u) => u !== src.uid).map((uid): TargetRef => ({ kind: 'monster', uid }));
  const selfOk = src.allyTargets.includes(src.uid);
  if (!needsEnemy(src) && !needsAlly(src)) return { mode: 'ghost', targets: [], zone: 'play', hint: '場で離すと使う' };
  const targets = [...src.enemyTargets, ...others];
  // 自分自身しか選べないモンスターカード：場に落とすだけ
  if (!needsEnemy(src) && others.length === 0) return { mode: 'ghost', targets: [], zone: 'self', hint: '場で離すと使う' };
  return {
    mode: 'arrow',
    targets,
    zone: selfOk ? 'self' : null,
    hint: needsEnemy(src) ? '対象の上で離す' : '自分のモンスターの上で離す',
  };
}

export type DropDecision =
  /** 何もしないで戻す（手札に戻した・Esc） */
  | { t: 'cancel' }
  /** 戻して理由を出す。attempt があれば、画面はエンジンの検証の理由を優先して出す */
  | { t: 'invalid'; reason: string; attempt?: { enemy?: TargetRef; target?: TargetRef } }
  | { t: 'play'; chosen: Chosen }
  /** 一部を決めた。残り（need）は候補ボタンで選ぶ */
  | { t: 'need'; chosen: Chosen; need: 'enemy' | 'ally' }
  | { t: 'noise' }
  | { t: 'attack'; target: TargetRef };

/** 残りの選択が1つしかなければ自動で埋める */
function complete(src: Extract<DragSource, { kind: 'card' }>, chosen: Chosen): DropDecision {
  const c: Chosen = { ...chosen };
  if (needsEnemy(src) && !c.enemy) {
    if (src.enemyTargets.length === 1) c.enemy = src.enemyTargets[0]!;
    else return { t: 'need', chosen: c, need: 'enemy' };
  }
  if (needsAlly(src) && !c.ally) {
    if (src.allyTargets.length === 1) c.ally = src.allyTargets[0]!;
    else return { t: 'need', chosen: c, need: 'ally' };
  }
  return { t: 'play', chosen: c };
}

export function resolveDrop(src: DragSource, spot: Spot): DropDecision {
  if (spot.kind === 'hand') return { t: 'cancel' };
  if (src.kind === 'attacker') {
    if (src.blocked) return { t: 'invalid', reason: src.blocked };
    const t = spotTarget(spot);
    if (t && src.targets.some((x) => sameRef(x, t))) return { t: 'attack', target: t };
    if (t) return { t: 'invalid', reason: 'そこは攻撃できません', attempt: { target: t } };
    return { t: 'invalid', reason: '攻撃する相手の上で離してください' };
  }
  if (src.noise) {
    if (src.blocked && src.blocked !== 'ノイズ') return { t: 'invalid', reason: src.blocked };
    return spot.kind === 'none' ? { t: 'invalid', reason: '場の上で離すと除外します' } : { t: 'noise' };
  }
  if (src.blocked) return { t: 'invalid', reason: src.blocked };
  if (!needsEnemy(src) && !needsAlly(src)) {
    return spot.kind === 'none' ? { t: 'invalid', reason: '場の上で離すと使えます' } : { t: 'play', chosen: {} };
  }
  const t = spotTarget(spot);
  if (t && needsEnemy(src) && src.enemyTargets.some((x) => sameRef(x, t))) return complete(src, { enemy: t });
  if (t?.kind === 'monster' && needsAlly(src) && src.allyTargets.includes(t.uid)) return complete(src, { ally: t.uid });
  if (spot.kind === 'zone' && src.allyTargets.includes(src.uid)) return complete(src, { ally: src.uid });
  if (!needsEnemy(src) && src.allyTargets.length === 1 && src.allyTargets[0] === src.uid && spot.kind !== 'none') return complete(src, { ally: src.uid });
  if (t && needsEnemy(src)) return { t: 'invalid', reason: 'その対象は選べません', attempt: { enemy: t } };
  if (t) return { t: 'invalid', reason: '自分のモンスターの上で離してください' };
  return { t: 'invalid', reason: needsEnemy(src) ? '対象の上で離してください' : '自分のモンスターの上で離してください' };
}

// ---------------------------------------------------------------- 当たり判定

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const inside = (x: number, y: number, r: Box, pad = 0) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;

/** 対象から少し外れていても吸い付く距離（px） */
export const SNAP_PX = 18;

/** 当たりの優先順：対象（モンスター・プレイヤー）＞ 使う場所 ＞ 手札 */
const rank = (key: string) => (key.startsWith('m:') || key.startsWith('p:') ? 0 : key === 'zone' ? 1 : 2);

/**
 * 指の位置にある落とし先の鍵を返す（なければ null）。
 * valid に入っている対象は、矩形の外 SNAP_PX までなら吸い付く（いちばん近いもの）。
 */
export function pickSpot(x: number, y: number, boxes: readonly { key: string; box: Box }[], valid: ReadonlySet<string> = new Set()): string | null {
  const hits = boxes.filter((b) => inside(x, y, b.box)).sort((a, b) => rank(a.key) - rank(b.key));
  const exact = hits[0];
  if (exact && rank(exact.key) === 0) return exact.key;
  let best: { key: string; d: number } | null = null;
  for (const b of boxes) {
    if (!valid.has(b.key) || rank(b.key) !== 0 || !inside(x, y, b.box, SNAP_PX)) continue;
    const cx = Math.max(b.box.left, Math.min(x, b.box.right));
    const cy = Math.max(b.box.top, Math.min(y, b.box.bottom));
    const d = Math.hypot(x - cx, y - cy);
    if (!best || d < best.d) best = { key: b.key, d };
  }
  if (best) return best.key;
  return exact?.key ?? null;
}

// ---------------------------------------------------------------- 押し始めの判定

/** 手札（タッチ）でドラッグを始める縦の移動量 */
export const HAND_TOUCH_START = 8;
/** それ以外でドラッグを始める移動量 */
export const DRAG_START = 6;

/**
 * 押してから dx, dy 動いたとき：drag＝ドラッグを始める / scroll＝スクロールなどに任せて諦める / wait＝まだ決めない。
 * 手札をタッチで触ったときは、上向きでほぼ縦の動きだけをドラッグにする（横は手札のスクロール）。
 */
export function gestureOf(dx: number, dy: number, pointerType: string, origin: 'hand' | 'board'): 'drag' | 'scroll' | 'wait' {
  const dist = Math.hypot(dx, dy);
  if (origin === 'hand' && pointerType !== 'mouse') {
    if (dist < HAND_TOUCH_START) return 'wait';
    if (dy < 0 && Math.abs(dy) > Math.abs(dx)) return 'drag';
    return 'scroll';
  }
  return dist > DRAG_START ? 'drag' : 'wait';
}

// ---------------------------------------------------------------- 矢印

/** 矢印の曲線（2次ベジェ）と先端の向き（度）。from から to へ、少し上にふくらむ */
export function arrowPath(from: { x: number; y: number }, to: { x: number; y: number }): { d: string; angle: number } {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const bend = Math.min(80, len * 0.25);
  // 進む向きに対して左（画面では上寄り）へふくらませる
  const nx = len ? -(to.y - from.y) / len : 0;
  const ny = len ? (to.x - from.x) / len : 0;
  const sign = ny > 0 ? -1 : 1;
  const c = { x: mx + nx * bend * sign, y: my + ny * bend * sign };
  const angle = (Math.atan2(to.y - c.y, to.x - c.x) * 180) / Math.PI;
  const r = (n: number) => Math.round(n * 10) / 10;
  return { d: `M ${r(from.x)} ${r(from.y)} Q ${r(c.x)} ${r(c.y)} ${r(to.x)} ${r(to.y)}`, angle: r(angle) };
}
