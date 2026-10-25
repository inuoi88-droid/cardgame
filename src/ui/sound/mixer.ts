/**
 * 鳴らすかどうかの決まり（決定事項 #127）。時刻を引数で受け取る純粋な関数とクラス（tests/sound.test.ts）。
 * - 同じ音は SAME_CUE_GAP_MS に1回まで（早送り・全体効果で同じ音が機関銃のように重ならないように）
 * - 同時に鳴らすのは MAX_VOICES まで。超えたら、鳴っている中でいちばん優先度の低い音（同じなら先に鳴り終わる方）より大事なら、それを止めて鳴らす
 * - 着弾（hit.*）は1つの効果・攻撃の組でまとめて1回。対象が3つ以上の全体効果は、1段重い音1回にまとめる。組の無い続き（ターン開始の毒の滝）も1回
 * - そのほかの着弾（強化・弱体・回復など）も、同じ組の同じ音は1回（全体の強化で同じ音が並ばないように）
 */
import type { SoundId } from './catalog.ts';

export const MAX_VOICES = 6;
export const SAME_CUE_GAP_MS = 60;

export interface Voice {
  id: number;
  cue: SoundId;
  prio: number;
  /** 鳴り終わる時刻（ms） */
  until: number;
}

export interface MixState {
  voices: Voice[];
  /** 音ごとの最後に鳴らした（鳴らそうとした）時刻 */
  last: Map<SoundId, number>;
}

export const newMixState = (): MixState => ({ voices: [], last: new Map() });

/** 同じ音を続けて頼んだか（頼んだ時刻を覚える。間引いたら false） */
export function throttle(s: MixState, cue: SoundId, now: number, gap = SAME_CUE_GAP_MS): boolean {
  const t = s.last.get(cue);
  if (t !== undefined && now - t < gap) return false;
  s.last.set(cue, now);
  return true;
}

export type Admit = { play: false } | { play: true; steal: number | null };

/** 声が空いているか。空いていなければ、止めてよい声（steal）を選ぶ。鳴り終わった声は先に片付ける */
export function admit(s: MixState, prio: number, now: number, max = MAX_VOICES): Admit {
  s.voices = s.voices.filter((v) => v.until > now);
  if (s.voices.length < max) return { play: true, steal: null };
  let low: Voice | null = null;
  for (const v of s.voices) if (!low || v.prio < low.prio || (v.prio === low.prio && v.until < low.until)) low = v;
  if (low && low.prio < prio) return { play: true, steal: low.id };
  return { play: false };
}

/** 声を足す（steal があれば先に外す） */
export function addVoice(s: MixState, v: Voice, steal: number | null): void {
  if (steal !== null) s.voices = s.voices.filter((x) => x.id !== steal);
  s.voices.push(v);
}

export function removeVoice(s: MixState, id: number): void {
  s.voices = s.voices.filter((x) => x.id !== id);
}

/** 大きさ（0〜1。ダメージならプレイヤーの最大HPに対する割合）→ 小さな音量の差（0.85〜1.1） */
export function magnitudeGain(m: number | undefined): number {
  if (m === undefined || !Number.isFinite(m)) return 1;
  return 0.85 + 0.25 * Math.min(1, Math.max(0, m) / 0.15);
}

export type HitSize = 'small' | 'medium' | 'heavy';
const UP: Record<HitSize, HitSize> = { small: 'medium', medium: 'heavy', heavy: 'heavy' };

/** 同時（同じ処理の中）とみなす間（あなたが受けた hit.player と、同じダメージの hit.* が並んで来る） */
export const SAME_TICK_MS = 40;
/** 1つの組の着弾をまとめる間（組の着弾は 60ms ずつずれて来る。縮められても組の中に収まる長さ） */
export const GROUP_HOLD_MS = 1500;
/** 全体効果とみなす対象の数 */
export const AOE_TARGETS = 3;
/** 組の無い着弾が続くとき（毒の滝は 110ms おき）、これより短い間の次は鳴らさない */
export const CHAIN_MS = 150;

/**
 * 着弾の音をまとめる。cast（効果を放った）で組の対象の数を覚え、hit（着弾）で鳴らす大きさを返す（null は鳴らさない）
 */
export class HitGate {
  private aoe = new Map<number, number>();
  private played = new Map<number, number>();
  private lastHit = -Infinity;
  private lastLoose = -Infinity;

  private sweep(now: number): void {
    for (const [g, t] of this.played) if (now - t > GROUP_HOLD_MS * 3) this.played.delete(g);
    if (this.aoe.size > 64) this.aoe.clear();
  }

  /** 効果を放った（count は出どころ以外の対象の数） */
  cast(group: number | undefined, count: number): void {
    if (group !== undefined && count >= AOE_TARGETS) this.aoe.set(group, count);
  }

  /** ダメージの着弾。鳴らす大きさ（全体効果なら1段重く）か、まとめて鳴らさないなら null */
  hit(size: HitSize, group: number | undefined, now: number): HitSize | null {
    this.sweep(now);
    if (now - this.lastHit < SAME_TICK_MS) return null;
    if (group !== undefined) {
      const t = this.played.get(group);
      if (t !== undefined && now - t < GROUP_HOLD_MS) return null;
      this.played.set(group, now);
    } else {
      // 組の無い続き：滝の間は鳴らさず、最後の1つから数え直す（長い滝も1回）
      const chained = now - this.lastLoose < CHAIN_MS;
      this.lastLoose = now;
      if (chained) return null;
    }
    this.lastHit = now;
    return group !== undefined && (this.aoe.get(group) ?? 0) >= AOE_TARGETS ? UP[size] : size;
  }

  /** あなたが受けたダメージ（いつも鳴らす。並んで来る同じダメージの hit.* を消す） */
  player(now: number): void {
    this.lastHit = now;
  }

  reset(): void {
    this.aoe.clear();
    this.played.clear();
    this.lastHit = -Infinity;
    this.lastLoose = -Infinity;
  }
}

/** 同じ組の同じ音は1回（強化・弱体・回復など、全体にかかる効果の着弾） */
export class GroupOnce {
  private seen = new Map<string, number>();

  /** 鳴らしてよいか（組が無ければいつも true） */
  pass(sound: SoundId, group: number | undefined, now: number): boolean {
    if (group === undefined) return true;
    if (this.seen.size > 128) for (const [k, t] of this.seen) if (now - t > GROUP_HOLD_MS) this.seen.delete(k);
    const key = `${group}:${sound}`;
    const t = this.seen.get(key);
    if (t !== undefined && now - t < GROUP_HOLD_MS) return false;
    this.seen.set(key, now);
    return true;
  }

  reset(): void {
    this.seen.clear();
  }
}
