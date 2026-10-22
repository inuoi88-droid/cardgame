/**
 * シャード（アイコンの形）の読み方：ふつうの版。public/icons/<stamp>/sNNN.json を必要なときに fetch する（決定事項 #105）。
 * 本体には URL の作り方しか入らない。1ファイル版（vite build --mode single）では shardSource.single.ts に差し替わる（vite.config.ts）。
 */
import { ICON_SHARD_DIGITS, ICON_STAMP } from './generated/info.ts';

export type Shard = Record<string, string>;

export async function fetchShard(i: number): Promise<Shard | undefined> {
  const url = new URL(`./icons/${ICON_STAMP}/s${String(i).padStart(ICON_SHARD_DIGITS, '0')}.json`, document.baseURI);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`icon shard ${i}: ${res.status}`);
  const data = (await res.json()) as unknown;
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as Shard) : undefined;
}
