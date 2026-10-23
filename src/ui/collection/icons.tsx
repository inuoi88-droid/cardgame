/**
 * カード置き場の操作の小さな絵（線の SVG。文字の記号 ▦▩ は見分けにくかったため。決定事項 #109 のレビュー）。
 * 色は currentColor、大きさは 1em。
 */
import type { ViewMode } from './query.ts';

const base = { width: '1em', height: '1em', viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const, 'aria-hidden': true, focusable: false };

/** カード（縦長の2×2）・コンパクト（小さな3×3）・リスト（3本の線） */
export function ViewIcon({ view }: { view: ViewMode }) {
  if (view === 'card')
    return (
      <svg {...base}>
        <rect x="2.5" y="1.8" width="6.4" height="7.4" rx="1.2" />
        <rect x="11.1" y="1.8" width="6.4" height="7.4" rx="1.2" />
        <rect x="2.5" y="10.8" width="6.4" height="7.4" rx="1.2" />
        <rect x="11.1" y="10.8" width="6.4" height="7.4" rx="1.2" />
      </svg>
    );
  if (view === 'compact')
    return (
      <svg {...base} strokeWidth={1.4}>
        {[2, 8, 14].flatMap((y) => [2, 8, 14].map((x) => <rect key={`${x}:${y}`} x={x} y={y} width="4" height="4" rx="0.8" />))}
      </svg>
    );
  return (
    <svg {...base}>
      <rect x="2" y="3" width="3" height="3" rx="0.6" />
      <rect x="2" y="8.5" width="3" height="3" rx="0.6" />
      <rect x="2" y="14" width="3" height="3" rx="0.6" />
      <path d="M8 4.5h10M8 10h10M8 15.5h10" />
    </svg>
  );
}

/** 絞り込み（じょうご） */
export function FilterIcon() {
  return (
    <svg {...base}>
      <path d="M2.5 3.5h15l-5.8 7v5.2l-3.4 1.8v-7z" />
    </svg>
  );
}

/** 選択（チェックの入った四角） */
export function SelectIcon() {
  return (
    <svg {...base}>
      <rect x="2.5" y="2.5" width="15" height="15" rx="3" />
      <path d="M6.2 10.2l2.6 2.6 5-5.4" />
    </svg>
  );
}
