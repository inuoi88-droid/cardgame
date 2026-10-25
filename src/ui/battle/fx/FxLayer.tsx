/**
 * 演出の層（決定事項 #126）。対戦画面（.battle）の上に1枚だけ重ね、FxDirector を作って渡す。
 * 中身は director.ts が直接作って消す（React は描かない）。押しても下へ通す（pointer-events: none）。
 * 層は影の DOM（shadow root）の中に置く：短命の要素を足し引きしても、ページ側のスタイルの選び直し（body:has() など）が起きない。
 */
import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { FxDirector, type FxEnv } from './director.ts';
import type { FxLevel } from './timeline.ts';
import layerCss from './layer.css?inline';
import './fx.css';

export function FxLayer({
  rootRef,
  env,
  level,
  directorRef,
}: {
  rootRef: RefObject<HTMLElement | null>;
  env: MutableRefObject<FxEnv>;
  level: FxLevel;
  directorRef: MutableRefObject<FxDirector | null>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    const host = hostRef.current;
    if (!root || !host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    shadow.replaceChildren();
    const style = document.createElement('style');
    style.textContent = layerCss;
    const layer = document.createElement('div');
    layer.className = 'fx-layer';
    shadow.append(style, layer);
    const d = new FxDirector(root, layer, () => env.current);
    directorRef.current = d;
    return () => {
      d.clear();
      if (directorRef.current === d) directorRef.current = null;
    };
  }, [rootRef, env, directorRef]);
  useEffect(() => {
    if (directorRef.current) directorRef.current.level = level;
  }, [level, directorRef]);
  return <div ref={hostRef} className={`fx-host fx-host--${level}`} aria-hidden="true" />;
}
