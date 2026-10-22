/**
 * game-icons の形（path の d）と選択パネルの索引を、必要になったときだけ読む（決定事項 #105・#106）。
 *
 * - 本体に入るのは generated/info.ts（数十バイトの定数）と読み方（iconSource.ts）だけ。
 * - 形はアイコン1つずつ（public/icons/<stamp>/<名前>.txt）。同時に読むのは MAX_ACTIVE 本まで。
 *   読む順は「いま画面にある絵（新しく出たものから）」→「選択パネルの少し先」→「対戦の始めに先読みしたもの」。
 *   画面から消えて誰も待っていない名前は、読む前なら列から外す（パネルを速く流しても、通り過ぎた分は読まない）。
 * - 読めなかったもの（オフライン・電波の弱い所）は 'error'（CardArt は種類の絵文字を出す）にして、
 *   2秒・4秒・8秒…（最大30秒）おきと、ブラウザがオンラインに戻ったときに読み直す。読めたら描き直す。
 * - 索引（名前の一覧と日本語の辞書）は選択パネルを開いたときに読む。
 * - 1ファイル版（npm run build:single）は HTML に埋め込んだ JSON から読む（iconSource.single.ts）。
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { fetchIconIndex, fetchIconPath } from './iconSource.ts';
import { parseIconRef } from './ref.ts';

/** 同時に読む本数 */
const MAX_ACTIVE = 8;
/** 読み直しの間隔（ミリ秒。失敗のたびに倍、上限あり） */
const RETRY_BASE = 2000;
const RETRY_MAX = 30_000;

export type IconPathState = string | null | 'loading' | 'error';

const paths = new Map<string, string | null>();
const failed = new Map<string, number>();
const active = new Set<string>();
/** 読む列（後ろほど新しい） */
let queue: string[] = [];
/** いま画面にある絵の数（名前ごと） */
const mounted = new Map<string, number>();
/** 選択パネルの「少し先」（最新の1組だけ） */
let wish = new Set<string>();
/** 先読み（読めるまで残す） */
const keep = new Set<string>();
const listeners = new Set<() => void>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let notifyQueued = false;

function notify(): void {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    for (const f of listeners) f();
  });
}

function wanted(name: string): boolean {
  return (mounted.get(name) ?? 0) > 0 || wish.has(name) || keep.has(name);
}

/** 次に読む名前（画面にあるもの → パネルの先 → 先読み。それぞれ新しいものから）。誰も待っていない名前は列から外す */
function nextName(): string | undefined {
  queue = queue.filter((n) => wanted(n) && !paths.has(n) && !active.has(n));
  for (const test of [(n: string) => (mounted.get(n) ?? 0) > 0, (n: string) => wish.has(n), () => true]) {
    for (let i = queue.length - 1; i >= 0; i--) {
      const n = queue[i]!;
      if (test(n)) {
        queue.splice(i, 1);
        return n;
      }
    }
  }
  return undefined;
}

function pump(): void {
  while (active.size < MAX_ACTIVE) {
    const name = nextName();
    if (!name) return;
    active.add(name);
    fetchIconPath(name).then(
      (d) => {
        active.delete(name);
        paths.set(name, d);
        failed.delete(name);
        keep.delete(name);
        notify();
        pump();
      },
      () => {
        active.delete(name);
        failed.set(name, (failed.get(name) ?? 0) + 1);
        notify();
        scheduleRetry();
        pump();
      },
    );
  }
}

function request(name: string): void {
  if (paths.has(name) || active.has(name)) return;
  // 失敗したものは読み直しの時（タイマー・オンライン）まで待つ
  if (failed.has(name) && retryTimer !== null) return;
  queue = queue.filter((n) => n !== name);
  queue.push(name);
  pump();
}

function retryFailed(): void {
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = null;
  for (const name of failed.keys()) if (wanted(name)) request(name);
}

function scheduleRetry(): void {
  if (retryTimer !== null) return;
  const tries = Math.max(1, ...failed.values());
  retryTimer = setTimeout(retryFailed, Math.min(RETRY_MAX, RETRY_BASE * 2 ** (tries - 1)));
}

if (typeof window !== 'undefined') window.addEventListener('online', retryFailed);

/** いま手元にある形。'loading' はまだ読んでいない、'error' は読めなかった（読み直し待ち）、null はそんな名前のアイコンは無い */
export function peekIconPath(name: string): IconPathState {
  if (paths.has(name)) return paths.get(name)!;
  return failed.has(name) ? 'error' : 'loading';
}

/** 選択パネルの「少し先」。前の組と入れ替わる（通り過ぎた分は読まない） */
export function prefetchIcons(names: readonly string[]): void {
  wish = new Set(names);
  for (const n of names) request(n);
}

/** 対戦の始めなどに、これから出るカードの絵をまとめて先読みする（CardDef.icon の文字列。絵文字は無視） */
export function preloadIcons(icons: Iterable<string | undefined>): void {
  for (const icon of icons) {
    const r = parseIconRef(icon);
    if (r.kind !== 'gi' || paths.has(r.name)) continue;
    keep.add(r.name);
    request(r.name);
  }
}

function subscribe(f: () => void): () => void {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

/** アイコンの形。読み込み中は 'loading'、読めなかったら 'error'（読めたら描き直す） */
export function useIconPath(name: string | null): IconPathState | null {
  const state = useSyncExternalStore(
    subscribe,
    () => (name ? peekIconPath(name) : null),
    () => (name ? peekIconPath(name) : null),
  );
  useEffect(() => {
    if (!name) return;
    mounted.set(name, (mounted.get(name) ?? 0) + 1);
    request(name);
    return () => {
      const n = (mounted.get(name) ?? 1) - 1;
      if (n > 0) mounted.set(name, n);
      else mounted.delete(name);
    };
  }, [name]);
  return state;
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
    indexPromise = fetchIconIndex().catch((e: unknown) => {
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
