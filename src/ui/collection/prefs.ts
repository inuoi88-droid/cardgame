/**
 * 見る人ごとの表示の設定（表示の密度・並べ替え・絞り込み・見ているグループ・節分け）。localStorage に置く（決定事項 #109）。
 * 読めない・書けない（プライベートウィンドウ・容量不足）ときは既定のまま動く。対戦やカードのデータには関わらない。
 */
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PREFS, parsePrefs, type CollectionPrefs } from './query.ts';

export const PREF_KEYS = {
  cards: 'cardgame.v1.prefs.cards',
  deckPool: 'cardgame.v1.prefs.deckPool',
} as const;

export function readPrefs(key: string): CollectionPrefs {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? DEFAULT_PREFS : parsePrefs(JSON.parse(raw));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePrefs(key: string, prefs: CollectionPrefs): void {
  try {
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    // 保存できなくても表示はそのまま（次に開いたときに既定へ戻るだけ）
  }
}

/** 設定の state。変えるたびに保存する */
export function usePrefs(key: string): [CollectionPrefs, (patch: Partial<CollectionPrefs> | ((p: CollectionPrefs) => Partial<CollectionPrefs>)) => void] {
  const [prefs, setPrefs] = useState<CollectionPrefs>(() => readPrefs(key));
  useEffect(() => {
    writePrefs(key, prefs);
  }, [key, prefs]);
  const update = useCallback((patch: Partial<CollectionPrefs> | ((p: CollectionPrefs) => Partial<CollectionPrefs>)) => {
    setPrefs((p) => ({ ...p, ...(typeof patch === 'function' ? patch(p) : patch) }));
  }, []);
  return [prefs, update];
}
