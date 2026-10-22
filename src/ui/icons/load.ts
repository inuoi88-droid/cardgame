/**
 * game-icons の形（path の d）と選択パネルの索引を、必要になったときだけ読む（決定事項 #105）。
 *
 * - 本体に入るのは generated/info.ts（各シャードの最初の名前など数 KB）だけ。
 * - 形は名前順で約 24KB ずつのシャード（public/icons/<stamp>/sNNN.json）。1枚の絵を出すときは、その名前のシャード1つだけを fetch する
 *   （読み方は shardSource.ts。本体には URL の作り方しか入らない）。
 * - 索引（名前の一覧と日本語の辞書）は選択パネルを開いたときに読む。
 * - 1ファイル版（npm run build:single）ではすべてが1つの JS に入る（読み込みは即座に終わる）。
 */
import { useEffect, useState } from 'react';
import { ICON_SHARD_STARTS } from './generated/info.ts';
import { pathFromShard, shardIndexOf } from './ref.ts';
import { fetchShard, type Shard } from './shardSource.ts';

const shards = new Map<number, Shard>();
const pending = new Map<number, Promise<Shard | undefined>>();
const listeners = new Set<() => void>();

function loadShard(i: number): Promise<Shard | undefined> {
  const have = shards.get(i);
  if (have) return Promise.resolve(have);
  const wait = pending.get(i);
  if (wait) return wait;
  if (i < 0 || i >= ICON_SHARD_STARTS.length) return Promise.resolve(undefined);
  const p = fetchShard(i)
    .then((s) => {
      pending.delete(i);
      if (!s) return undefined;
      shards.set(i, s);
      for (const f of listeners) f();
      return s;
    })
    .catch(() => {
      // 読めなかった（オフラインなど）。次に必要になったらもう一度読む
      pending.delete(i);
      return undefined;
    });
  pending.set(i, p);
  return p;
}

/** いま手元にある形。'loading' はまだ読んでいない、null はそんな名前のアイコンは無い */
export function peekIconPath(name: string): string | null | 'loading' {
  const i = shardIndexOf(name, ICON_SHARD_STARTS);
  if (i < 0) return null;
  const s = shards.get(i);
  return s ? pathFromShard(s, name) : 'loading';
}

/** 形を読む（無い名前は null） */
export async function loadIconPath(name: string): Promise<string | null> {
  const i = shardIndexOf(name, ICON_SHARD_STARTS);
  if (i < 0) return null;
  return pathFromShard(await loadShard(i), name);
}

/** まとめて先に読む（選択パネルで見えている範囲など） */
export function prefetchIcons(names: readonly string[]): void {
  const want = new Set<number>();
  for (const n of names) {
    const i = shardIndexOf(n, ICON_SHARD_STARTS);
    if (i >= 0 && !shards.has(i)) want.add(i);
  }
  for (const i of want) void loadShard(i);
}

/** アイコンの形。読み込み中は 'loading'（読み終わると描き直す） */
export function useIconPath(name: string | null): string | null | 'loading' {
  const [, bump] = useState(0);
  const now = name ? peekIconPath(name) : null;
  useEffect(() => {
    if (!name || now !== 'loading') return;
    let live = true;
    void loadIconPath(name).then(() => {
      if (live) bump((x) => x + 1);
    });
    return () => {
      live = false;
    };
  }, [name, now]);
  return now;
}

/** シャードが読み終わるたびに描き直す（選択パネルのグリッド用） */
export function useShardVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const f = () => setV((x) => x + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return v;
}

// ---------------------------------------------------------------- 索引（選択パネル用）

export interface IconIndex {
  /** すべてのアイコン名（名前順） */
  names: readonly string[];
  /** 英単語 → 日本語（空白区切り）。辞書が無ければ空 */
  ja: Readonly<Record<string, string>>;
}

let indexPromise: Promise<IconIndex> | null = null;

export function loadIconIndex(): Promise<IconIndex> {
  if (!indexPromise) {
    indexPromise = import('./generated/index.json')
      .then((m) => {
        const data = (m as { default: { names: string[]; ja: Record<string, string> } }).default;
        return { names: data.names, ja: data.ja };
      })
      .catch((e: unknown) => {
        indexPromise = null;
        throw e;
      });
  }
  return indexPromise;
}

export function useIconIndex(): IconIndex | null | 'error' {
  const [index, setIndex] = useState<IconIndex | null | 'error'>(null);
  useEffect(() => {
    let live = true;
    loadIconIndex().then(
      (x) => live && setIndex(x),
      () => live && setIndex('error'),
    );
    return () => {
      live = false;
    };
  }, []);
  return index;
}
