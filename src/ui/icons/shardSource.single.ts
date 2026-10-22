/**
 * シャード（アイコンの形）の読み方：1ファイル版（npm run build:single）。file:// では fetch できないので、
 * すべてのシャードを JS に入れる（vite.config.ts の mode 'single' で shardSource.ts の代わりにこれを使う。決定事項 #105）。
 */
import { ICON_SHARD_DIGITS } from './generated/info.ts';

export type Shard = Record<string, string>;

const FILES = import.meta.glob<Shard>('./generated/shards/*.json', { import: 'default' });

export async function fetchShard(i: number): Promise<Shard | undefined> {
  const load = FILES[`./generated/shards/s${String(i).padStart(ICON_SHARD_DIGITS, '0')}.json`];
  return load ? load() : undefined;
}
