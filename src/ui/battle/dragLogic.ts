/**
 * ドラッグ＆ドロップの判断（純粋関数。DOM を使わない。tests/battle/dragLogic.test.ts）。
 * - planDrag：つかんだもの（手札のカード・攻撃するモンスター）から、光らせる対象・使う場所・見た目（ゴースト／矢印）を決める
 * - pickSpot：指の位置と、落とせる場所の矩形から、どこに落としたかを決める（少しずれても対象に吸い付く）
 * - resolveDrop：落とした場所を行動に変える（足りない選択は「続けて選ぶ」にする）
 * - gestureOf：押してから動いた量で、ドラッグを始めるか（手札は横スクロールと区別する）
 * 対象の候補はエンジンの playInfo・activateInfo・handAbilityInfo・attackTargets をそのまま使う（効果の種類はここでは見ない）。
 * つかめるもの（MTG 要素 ○ バッチC1 で追加）：手札のカード・捨て札のカード（捨て札から使う）・起動の ⚡（場のモンスター・パワー）・
 * 攻撃するモンスター。手札のサイクリング・魂力のカードは、自分の捨て札の山（pile）に落とすと使える
 */
import type { battle } from '../../engine/index.ts';

type PlayerId = battle.PlayerId;
type TargetRef = battle.TargetRef;
type Chosen = battle.Chosen;
type HandAbilityKind = battle.HandAbilityKind;

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
      /** どこから使うか（省略は手札。MTG 要素 ○ バッチC1：捨て札から使う） */
      from?: 'hand' | 'discard';
      /** 捨て札の山に落とせば使える、手札から使う能力（サイクリング・魂力。使えるものだけ） */
      handAbilities?: HandAbilityKind[];
    }
  | { kind: 'attacker'; uid: string; blocked: string | null; targets: TargetRef[] }
  /** 起動の ⚡（MTG 要素 ○ バッチC1）。uid は起動するモンスター・パワー */
  | { kind: 'activate'; uid: string; blocked: string | null; enemyTargets: TargetRef[]; allyTargets: string[] };

/** 落とせる場所（pile は自分の捨て札の山） */
export type Spot = { kind: 'monster'; uid: string } | { kind: 'player'; player: PlayerId } | { kind: 'zone' } | { kind: 'hand' } | { kind: 'pile' } | { kind: 'none' };

export const spotKey = (s: Spot): string =>
  s.kind === 'monster' ? `m:${s.uid}` : s.kind === 'player' ? `p:${s.player}` : s.kind;

export const targetKey = (t: TargetRef): string => (t.kind === 'monster' ? `m:${t.uid}` : `p:${t.player}`);

export function parseSpot(key: string | null | undefined): Spot {
  if (!key) return { kind: 'none' };
  if (key.startsWith('m:')) return { kind: 'monster', uid: key.slice(2) };
  if (key === 'p:0' || key === 'p:1') return { kind: 'player', player: Number(key[2]) as PlayerId };
  if (key === 'zone' || key === 'hand' || key === 'pile') return { kind: key };
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
  /** 自分の捨て札の山を光らせる（落とすとサイクリング・魂力。MTG 要素 ○ バッチC1） */
  pile: boolean;
}

/** 対象を選ぶもの（手札・捨て札のカード、起動）。selfUid は召喚するモンスターのカード自身（自分のモンスターの候補に入る） */
type Targeted = { uid: string; blocked: string | null; enemyTargets: TargetRef[]; allyTargets: string[]; selfUid?: string };

const needsEnemy = (s: Targeted) => s.enemyTargets.length > 0;
const needsAlly = (s: Targeted) => s.allyTargets.length > 0;

/** 捨て札の山に落とせる能力の案内 */
const PILE_NAME: Record<HandAbilityKind, string> = { cycling: 'サイクリング', channel: '魂力' };
const pileHint = (kinds: readonly HandAbilityKind[]) => `🗑で離すと${kinds.map((k) => PILE_NAME[k]).join('・')}`;

/** 対象を選ぶもの（カード・起動）の見た目と光らせる対象 */
function planTargeted(src: Targeted, noTargetHint: string): Omit<DragPlan, 'pile'> {
  if (src.blocked) return { mode: needsEnemy(src) || needsAlly(src) ? 'arrow' : 'ghost', targets: [], zone: null, hint: src.blocked };
  const self = src.selfUid;
  const others = src.allyTargets.filter((u) => u !== self).map((uid): TargetRef => ({ kind: 'monster', uid }));
  const selfOk = self !== undefined && src.allyTargets.includes(self);
  if (!needsEnemy(src) && !needsAlly(src)) return { mode: 'ghost', targets: [], zone: 'play', hint: noTargetHint };
  const targets = [...src.enemyTargets, ...others];
  // 自分自身しか選べないモンスターカード：場に落とすだけ
  if (!needsEnemy(src) && others.length === 0 && selfOk) return { mode: 'ghost', targets: [], zone: 'self', hint: noTargetHint };
  return {
    mode: 'arrow',
    targets,
    zone: selfOk ? 'self' : null,
    hint: needsEnemy(src) ? '対象の上で離す' : '自分のモンスターの上で離す',
  };
}

/** カードのドラッグの「対象を選ぶもの」としての形（モンスターのカードは自分自身を選べる） */
const cardTargeted = (src: Extract<DragSource, { kind: 'card' }>): Targeted => ({ ...src, selfUid: src.uid });

export function planDrag(src: DragSource): DragPlan {
  if (src.kind === 'attacker') {
    if (src.blocked) return { mode: 'arrow', targets: [], zone: null, hint: src.blocked, pile: false };
    return { mode: 'arrow', targets: src.targets, zone: null, hint: src.targets.length ? '攻撃する相手の上で離す' : '攻撃できる相手がいません', pile: false };
  }
  if (src.kind === 'activate') {
    // 起動：対象が要らなければ場のどこかで離す
    return { ...planTargeted(src, '場で離すと起動'), pile: false };
  }
  if (src.noise) {
    if (src.blocked && src.blocked !== 'ノイズ') return { mode: 'ghost', targets: [], zone: null, hint: src.blocked, pile: false };
    return { mode: 'ghost', targets: [], zone: 'noise', hint: '場で離すと除外', pile: false };
  }
  const kinds = src.from === 'discard' ? [] : (src.handAbilities ?? []);
  const plan = planTargeted(cardTargeted(src), '場で離すと使う');
  if (kinds.length === 0) return { ...plan, pile: false };
  // サイクリング・魂力のカード：捨て札の山も光る。使えないカードでも、山に落とせばよい
  if (src.blocked) return { mode: 'ghost', targets: [], zone: null, hint: pileHint(kinds), pile: true };
  return { ...plan, hint: `${plan.hint}・${pileHint(kinds)}`, pile: true };
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
  | { t: 'attack'; target: TargetRef }
  /** 捨て札の山に落とした：手札から使う能力（サイクリング・魂力）。複数あれば画面が選ばせる */
  | { t: 'pile'; abilities: HandAbilityKind[] };

/** 残りの選択が1つしかなければ自動で埋める */
function complete(src: Targeted, chosen: Chosen): DropDecision {
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
  if (src.kind === 'activate') return resolveTargeted(src, spot, '場の上で離すと起動します');
  if (src.noise) {
    if (src.blocked && src.blocked !== 'ノイズ') return { t: 'invalid', reason: src.blocked };
    return spot.kind === 'none' ? { t: 'invalid', reason: '場の上で離すと除外します' } : { t: 'noise' };
  }
  // 捨て札の山：サイクリング・魂力（手札のカードだけ）。捨て札から持ってきたカードは何もしない
  const kinds = src.from === 'discard' ? [] : (src.handAbilities ?? []);
  if (spot.kind === 'pile' && kinds.length > 0) return { t: 'pile', abilities: [...kinds] };
  if (spot.kind === 'pile' && src.from === 'discard') return { t: 'cancel' };
  return resolveTargeted(cardTargeted(src), spot, '場の上で離すと使えます');
}

/** 対象を選ぶもの（カード・起動）を落とした場所から、使うか・足りない選択を決める */
function resolveTargeted(src: Targeted, spot: Spot, noTargetReason: string): DropDecision {
  if (src.blocked) return { t: 'invalid', reason: src.blocked };
  if (!needsEnemy(src) && !needsAlly(src)) {
    return spot.kind === 'none' ? { t: 'invalid', reason: noTargetReason } : { t: 'play', chosen: {} };
  }
  const self = src.selfUid;
  const t = spotTarget(spot);
  if (t && needsEnemy(src) && src.enemyTargets.some((x) => sameRef(x, t))) return complete(src, { enemy: t });
  if (t?.kind === 'monster' && needsAlly(src) && src.allyTargets.includes(t.uid)) return complete(src, { ally: t.uid });
  if (self !== undefined && spot.kind === 'zone' && src.allyTargets.includes(self)) return complete(src, { ally: self });
  if (self !== undefined && !needsEnemy(src) && src.allyTargets.length === 1 && src.allyTargets[0] === self && spot.kind !== 'none') return complete(src, { ally: self });
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

/**
 * 当たりの優先順：落とせる捨て札の山（プレイヤーの枠の中にある）＞ 対象（モンスター・プレイヤー）＞ 使う場所 ＞ 手札・落とせない山
 */
const rankOf = (key: string, valid: ReadonlySet<string>) =>
  key === 'pile' ? (valid.has('pile') ? -1 : 2) : key.startsWith('m:') || key.startsWith('p:') ? 0 : key === 'zone' ? 1 : 2;

/**
 * 指の位置にある落とし先の鍵を返す（なければ null）。
 * valid に入っている対象は、矩形の外 SNAP_PX までなら吸い付く（いちばん近いもの）。
 */
export function pickSpot(x: number, y: number, boxes: readonly { key: string; box: Box }[], valid: ReadonlySet<string> = new Set()): string | null {
  const rank = (key: string) => rankOf(key, valid);
  const hits = boxes.filter((b) => inside(x, y, b.box)).sort((a, b) => rank(a.key) - rank(b.key));
  const exact = hits[0];
  // 落とせる捨て札の山は小さいので、プレイヤーの枠（落とせない）の中でも少し外れていれば吸い付く
  const pile = valid.has('pile') ? boxes.find((b) => b.key === 'pile' && inside(x, y, b.box, SNAP_PX)) : undefined;
  if (pile && (!exact || !valid.has(exact.key))) return 'pile';
  if (exact && rank(exact.key) <= 0) return exact.key;
  let best: { key: string; d: number } | null = null;
  for (const b of boxes) {
    if (!valid.has(b.key) || rank(b.key) > 0 || !inside(x, y, b.box, SNAP_PX)) continue;
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

/** つかんだ場所：手札（横に並ぶ）・場・縦の一覧（捨て札の一覧。MTG 要素 ○ バッチC1） */
export type DragOrigin = 'hand' | 'board' | 'list';

/**
 * 押してから dx, dy 動いたとき：drag＝ドラッグを始める / scroll＝スクロールなどに任せて諦める / wait＝まだ決めない。
 * 手札をタッチで触ったときは、上向きでほぼ縦の動きだけをドラッグにする（横は手札のスクロール）。
 * 縦の一覧をタッチで触ったときは、ほぼ横の動きだけをドラッグにする（縦は一覧のスクロール）。
 */
export function gestureOf(dx: number, dy: number, pointerType: string, origin: DragOrigin): 'drag' | 'scroll' | 'wait' {
  const dist = Math.hypot(dx, dy);
  if (origin === 'hand' && pointerType !== 'mouse') {
    if (dist < HAND_TOUCH_START) return 'wait';
    if (dy < 0 && Math.abs(dy) > Math.abs(dx)) return 'drag';
    return 'scroll';
  }
  if (origin === 'list' && pointerType !== 'mouse') {
    if (dist < HAND_TOUCH_START) return 'wait';
    return Math.abs(dx) > Math.abs(dy) ? 'drag' : 'scroll';
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
