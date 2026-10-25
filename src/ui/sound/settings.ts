/**
 * 効果音の設定（見る人ごと。localStorage の cardgame.v1.sound = { on, volume }。決定事項 #127）。
 * 既定はオフ（ユーザーの決定：設定で自分でオンにする）。読めない・書けない（プライベートウィンドウ・容量不足）ときはオフのまま動く。
 * 同じ端末のほかのタブで変えたら storage イベントで合わせる。
 */
import { useSyncExternalStore } from 'react';

export const SOUND_PREF_KEY = 'cardgame.v1.sound';

export interface SoundPref {
  on: boolean;
  /** 音量 0〜1 */
  volume: number;
}

export const DEFAULT_SOUND_PREF: SoundPref = { on: false, volume: 0.7 };

/** 音量のつまみ（0〜1）→ 掛ける値。耳の感じ方に合わせて少し曲げる（0.7 → 約 0.56） */
export function volumeGain(v: number): number {
  if (!(v > 0)) return 0;
  return Math.min(1, v) ** 1.6;
}

/** 音量を 0〜1・小数2桁に（数でなければ既定） */
export function clampVolume(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_SOUND_PREF.volume;
  return Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
}

/** 保存した値を読む（壊れていたら既定：オフ・0.7）。オンは true のときだけ */
export function parseSoundPref(raw: unknown): SoundPref {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...DEFAULT_SOUND_PREF };
  const r = raw as { on?: unknown; volume?: unknown };
  return { on: r.on === true, volume: r.volume === undefined ? DEFAULT_SOUND_PREF.volume : clampVolume(r.volume) };
}

/** localStorage の文字列から（null・壊れた JSON も既定） */
export function parseSoundPrefText(text: string | null): SoundPref {
  if (text === null) return { ...DEFAULT_SOUND_PREF };
  try {
    return parseSoundPref(JSON.parse(text));
  } catch {
    return { ...DEFAULT_SOUND_PREF };
  }
}

function read(): SoundPref {
  try {
    return parseSoundPrefText(localStorage.getItem(SOUND_PREF_KEY));
  } catch {
    return { ...DEFAULT_SOUND_PREF };
  }
}

let current: SoundPref | null = null;
const listeners = new Set<() => void>();

export function getSoundPref(): SoundPref {
  return (current ??= typeof window === 'undefined' ? { ...DEFAULT_SOUND_PREF } : read());
}

/** 変える（保存できなくても今の画面ではそのまま使う） */
export function setSoundPref(patch: Partial<SoundPref>): void {
  const prev = getSoundPref();
  const next: SoundPref = { on: patch.on ?? prev.on, volume: patch.volume === undefined ? prev.volume : clampVolume(patch.volume) };
  if (next.on === prev.on && next.volume === prev.volume) return;
  current = next;
  try {
    localStorage.setItem(SOUND_PREF_KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても今の画面ではそのまま
  }
  for (const f of listeners) f();
}

export function subscribeSoundPref(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** ほかのタブで変わったら読み直す（sound/index.ts の initSound が1回だけつなぐ） */
export function reloadSoundPref(): void {
  const next = read();
  const prev = getSoundPref();
  if (next.on === prev.on && next.volume === prev.volume) return;
  current = next;
  for (const f of listeners) f();
}

export function useSoundPref(): SoundPref {
  return useSyncExternalStore(subscribeSoundPref, getSoundPref, getSoundPref);
}
