/**
 * いま流す BGM の場面（決定事項 #128）。本体の JS に入る小さな部品で、鳴らす本体（music.ts）は BGM をオンにしてから読む。
 *
 * - 土台は画面（ルート）から決まる：App が setBaseBgmScene(sceneForPage(route.page)) を呼ぶ
 * - 画面の中の部品が上書きする：対戦の盤面は 'battle'（決着したら null＝止める）、ドラフトの盤面は 'draft'（useBgmScene）。
 *   オンライン対戦の画面は、待っている間はロビー・ドラフト中はドラフト・対戦中は対戦の曲になる
 * - 上書きは後から登録したものが勝つ。場面が変わったら subscribeBgmScene の相手（sound/index.ts）に知らせる
 */
import { useEffect, useRef } from 'react';
import type { BgmScene } from './bgmCatalog.ts';

/** 画面（router.ts の Route['page']）→ 土台の場面 */
export function sceneForPage(page: string): BgmScene | null {
  switch (page) {
    case 'cards':
    case 'cardEdit':
    case 'decks':
    case 'deckEdit':
    case 'official':
    case 'officialEdit':
    case 'plaza':
      return 'deck';
    case 'draft':
      return 'draft';
    default:
      // 対戦の準備・CPU 戦とオンラインの対戦の画面（対戦の曲は盤面が上書きする。対戦が無いときはロビー）・
      // オンラインのロビーと部屋・招待リンク・ルール・クレジット・UIキット
      return 'lobby';
  }
}

/** 土台と上書きの並びから、いまの場面（後から登録した上書きが勝つ） */
export function effectiveScene(base: BgmScene | null, overrides: readonly { scene: BgmScene | null }[]): BgmScene | null {
  return overrides.length > 0 ? overrides[overrides.length - 1]!.scene : base;
}

let base: BgmScene | null = null;
const overrides: { key: number; scene: BgmScene | null }[] = [];
const listeners = new Set<() => void>();
let seq = 0;
let last: BgmScene | null = null;
let pending = false;

/**
 * 知らせは1回の描画の後にまとめる（マイクロタスク）。画面が替わるとき、React は子（対戦の盤面）の後片付けを
 * 親（App）の新しい土台より先に動かすので、すぐ知らせると「前の画面の土台」に一瞬戻って曲を読み始めてしまう
 */
function changed(): void {
  if (pending) return;
  pending = true;
  queueMicrotask(() => {
    pending = false;
    const s = getBgmScene();
    if (s === last) return;
    last = s;
    for (const f of listeners) f();
  });
}

export function getBgmScene(): BgmScene | null {
  return effectiveScene(base, overrides);
}

export function setBaseBgmScene(scene: BgmScene | null): void {
  base = scene;
  changed();
}

export function subscribeBgmScene(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** 部品が表示されている間、場面を上書きする（null は「流さない」） */
export function useBgmScene(scene: BgmScene | null): void {
  const key = useRef(0);
  useEffect(() => {
    const k = ++seq;
    key.current = k;
    overrides.push({ key: k, scene });
    changed();
    return () => {
      const i = overrides.findIndex((o) => o.key === k);
      if (i >= 0) overrides.splice(i, 1);
      changed();
    };
    // 登録は表示している間に1回。場面が変わったら下の effect で書き換える（並びの位置は変えない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const o = overrides.find((x) => x.key === key.current);
    if (!o || o.scene === scene) return;
    o.scene = scene;
    changed();
  }, [scene]);
}
