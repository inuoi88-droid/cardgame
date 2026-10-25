/**
 * 演出の設定（見る人ごと。localStorage の cardgame.v1.fx。決定事項 #126）：標準／控えめ。
 * 端末の「動きを減らす」（prefers-reduced-motion）のときは、設定にかかわらず控えめ（飛ぶもの・粒・揺れなし、その場で光って消えるだけ）。
 * 読めない・書けない（プライベートウィンドウ・容量不足）ときは標準のまま動く。
 */
import { useCallback, useEffect, useState } from 'react';
import { useMediaQuery } from '../../components/dialogUtil.ts';
import type { FxLevel } from './timeline.ts';

export const FX_PREF_KEY = 'cardgame.v1.fx';

export const FX_LEVEL_LABEL: Record<FxLevel, string> = { full: '標準', calm: '控えめ' };

/** 保存した値を読む（壊れていたら標準） */
export function parseFxPref(raw: unknown): FxLevel {
  return typeof raw === 'object' && raw !== null && (raw as { level?: unknown }).level === 'calm' ? 'calm' : 'full';
}

export function readFxPref(): FxLevel {
  try {
    const raw = localStorage.getItem(FX_PREF_KEY);
    return raw === null ? 'full' : parseFxPref(JSON.parse(raw));
  } catch {
    return 'full';
  }
}

function writeFxPref(level: FxLevel): void {
  try {
    localStorage.setItem(FX_PREF_KEY, JSON.stringify({ level }));
  } catch {
    // 保存できなくても今の画面ではそのまま使う
  }
}

/** 演出の設定。level は「動きを減らす」も込みの実際の値、chosen は選んだ値 */
export function useFxLevel(): { level: FxLevel; chosen: FxLevel; reduce: boolean; setLevel: (l: FxLevel) => void } {
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [chosen, setChosen] = useState<FxLevel>(() => readFxPref());
  useEffect(() => {
    const on = (e: StorageEvent) => e.key === FX_PREF_KEY && setChosen(readFxPref());
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);
  const setLevel = useCallback((l: FxLevel) => {
    setChosen(l);
    writeFxPref(l);
  }, []);
  return { level: reduce ? 'calm' : chosen, chosen, reduce, setLevel };
}
