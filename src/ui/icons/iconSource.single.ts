/**
 * アイコンの形と索引の読み方：1ファイル版（npm run build:single。決定事項 #105・#106）。
 * file:// では fetch できないので、scripts/build-single.mjs がシャード（名前順に約 24KB）と索引を
 * HTML に `<script type="application/json" id="gi-sNNN">` として埋め込む。JS としては解析されないので起動は重くならず、
 * 要るシャードだけをそのとき JSON.parse する（vite.config.ts の mode 'single' で iconSource.ts の代わりにこれを使う）。
 * JS はデータより前に async で動き出すので、文書を読み終わる（DOMContentLoaded）まで待ってから読む。
 */
import { ICON_SHARD_DIGITS, ICON_SHARD_STARTS } from './generated/info.ts';
import { pathFromShard, shardIndexOf } from './ref.ts';

export interface IconIndexData {
  names: string[];
  ja: Record<string, string>;
}

const shards = new Map<number, Record<string, unknown> | undefined>();

const parsed: Promise<void> =
  typeof document === 'undefined' || document.readyState !== 'loading'
    ? Promise.resolve()
    : new Promise((resolve) => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));

function readJson(id: string): unknown {
  const text = document.getElementById(id)?.textContent;
  return text ? (JSON.parse(text) as unknown) : undefined;
}

function shard(i: number): Record<string, unknown> | undefined {
  if (!shards.has(i)) {
    const data = readJson(`gi-s${String(i).padStart(ICON_SHARD_DIGITS, '0')}`);
    shards.set(i, data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : undefined);
  }
  return shards.get(i);
}

export async function fetchIconPath(name: string): Promise<string | null> {
  await parsed;
  const i = shardIndexOf(name, ICON_SHARD_STARTS);
  return i < 0 ? null : pathFromShard(shard(i), name);
}

export async function fetchIconIndex(): Promise<IconIndexData> {
  await parsed;
  const data = readJson('gi-index') as IconIndexData | undefined;
  if (!data || !Array.isArray(data.names)) throw new Error('icon index missing');
  return { names: data.names, ja: data.ja ?? {} };
}
