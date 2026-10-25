/**
 * BGM のファイルの場所：ふつうの版（決定事項 #128）。public/bgm/<BGM_STAMP>/<id>.mp3 を同じサイトから読む（base が './' なので相対）。
 * 1ファイル版（vite build --mode single）では bgmSource.single.ts に差し替わる（曲は埋め込まず、公開サイトから読む）。
 */
import { BGM_STAMP } from './bgmCatalog.ts';

/** 曲を公開サイトから読む版か（設定の画面の説明に使う） */
export const BGM_REMOTE = false;

export function bgmUrl(id: string): string {
  return `bgm/${BGM_STAMP}/${id}.mp3`;
}
