/**
 * 効果音と BGM の設定（見る人ごと。決定事項 #127・#128）。
 * - 効果音：localStorage の cardgame.v1.sound = { on, volume }
 * - BGM：cardgame.v1.bgm = { on, volume }（効果音とは別にオン・オフと音量を決める）
 * どちらも既定はオフ（ユーザーの決定：設定で自分でオンにする）。読めない・書けない（プライベートウィンドウ・容量不足）ときはオフのまま動く。
 * 同じ端末のほかのタブで変えたら storage イベントで合わせる。
 */
import { useSyncExternalStore } from 'react';

export const SOUND_PREF_KEY = 'cardgame.v1.sound';
export const MUSIC_PREF_KEY = 'cardgame.v1.bgm';

export interface SoundPref {
  on: boolean;
  /** 音量 0〜1 */
  volume: number;
}

export const DEFAULT_SOUND_PREF: SoundPref = { on: false, volume: 0.7 };
/** BGM の既定の音量：効果音の既定と同じ（曲は -18 LUFS。効果音の強い音がその上に出る） */
export const DEFAULT_MUSIC_PREF: SoundPref = { on: false, volume: 0.7 };

/** 音量のつまみ（0〜1）→ 掛ける値。耳の感じ方に合わせて少し曲げる（0.7 → 約 0.56） */
export function volumeGain(v: number): number {
  if (!(v > 0)) return 0;
  return Math.min(1, v) ** 1.6;
}

/** 音量を 0〜1・小数2桁に（数でなければ既定） */
export function clampVolume(v: unknown, fallback = DEFAULT_SOUND_PREF.volume): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
}

/** 保存した値を読む（壊れていたら既定：オフ）。オンは true のときだけ */
export function parseSoundPref(raw: unknown, def: SoundPref = DEFAULT_SOUND_PREF): SoundPref {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...def };
  const r = raw as { on?: unknown; volume?: unknown };
  return { on: r.on === true, volume: r.volume === undefined ? def.volume : clampVolume(r.volume, def.volume) };
}

/** localStorage の文字列から（null・壊れた JSON も既定） */
export function parseSoundPrefText(text: string | null, def: SoundPref = DEFAULT_SOUND_PREF): SoundPref {
  if (text === null) return { ...def };
  try {
    return parseSoundPref(JSON.parse(text), def);
  } catch {
    return { ...def };
  }
}

/** 1つの設定（キーと既定）の読み書きと、変わったときの知らせ */
function prefStore(key: string, def: SoundPref) {
  let current: SoundPref | null = null;
  const listeners = new Set<() => void>();
  const read = (): SoundPref => {
    try {
      return parseSoundPrefText(localStorage.getItem(key), def);
    } catch {
      return { ...def };
    }
  };
  const get = (): SoundPref => (current ??= typeof window === 'undefined' ? { ...def } : read());
  const notify = () => {
    for (const f of listeners) f();
  };
  return {
    get,
    /** 変える（保存できなくても今の画面ではそのまま使う） */
    set(patch: Partial<SoundPref>): void {
      const prev = get();
      const next: SoundPref = { on: patch.on ?? prev.on, volume: patch.volume === undefined ? prev.volume : clampVolume(patch.volume, def.volume) };
      if (next.on === prev.on && next.volume === prev.volume) return;
      current = next;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // 保存できなくても今の画面ではそのまま
      }
      notify();
    },
    subscribe(f: () => void): () => void {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    /** ほかのタブで変わったら読み直す（sound/index.ts の initSound が1回だけつなぐ） */
    reload(): void {
      const next = read();
      const prev = get();
      if (next.on === prev.on && next.volume === prev.volume) return;
      current = next;
      notify();
    },
  };
}

const sound = prefStore(SOUND_PREF_KEY, DEFAULT_SOUND_PREF);
const music = prefStore(MUSIC_PREF_KEY, DEFAULT_MUSIC_PREF);

export const getSoundPref = sound.get;
export const setSoundPref = sound.set;
export const subscribeSoundPref = sound.subscribe;
export const reloadSoundPref = sound.reload;

export const getMusicPref = music.get;
export const setMusicPref = music.set;
export const subscribeMusicPref = music.subscribe;
export const reloadMusicPref = music.reload;

export function useSoundPref(): SoundPref {
  return useSyncExternalStore(sound.subscribe, sound.get, sound.get);
}

export function useMusicPref(): SoundPref {
  return useSyncExternalStore(music.subscribe, music.get, music.get);
}
