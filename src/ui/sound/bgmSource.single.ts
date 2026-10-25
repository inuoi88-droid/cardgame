/**
 * BGM のファイルの場所：1ファイル版（npm run build:single。決定事項 #128）。
 * 曲は合わせて約 11MB あり、埋め込むと1ファイル版が倍以上の重さになるので埋め込まない。公開サイト（Vercel）の
 * public/bgm/<BGM_STAMP>/ から読む（vercel.json がこの場所に Access-Control-Allow-Origin: * を付ける。file:// からも読める）。
 * ネットにつながっていなければ BGM は流れない（効果音は埋め込みなので鳴る）。
 */
import { PUBLIC_APP_URL } from '../online/config.ts';
import { BGM_STAMP } from './bgmCatalog.ts';

export const BGM_REMOTE = true;

export function bgmUrl(id: string): string {
  return `${PUBLIC_APP_URL}bgm/${BGM_STAMP}/${id}.mp3`;
}
