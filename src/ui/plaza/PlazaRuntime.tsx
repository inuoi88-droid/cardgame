/**
 * 起動時の広場まわりの読み込み（決定事項 #141。App に1つ）：公式カードの上書きを取り直し、プレイヤーがいれば運営かを確かめ直す。
 * 描くものは無い
 */
import { useEffect } from 'react';
import { refreshOfficial, refreshStaff } from './plazaStore.ts';

export function PlazaRuntime() {
  useEffect(() => {
    void refreshOfficial();
    void refreshStaff();
  }, []);
  return null;
}
