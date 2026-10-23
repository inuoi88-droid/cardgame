/**
 * 窓の中に見えている行だけを描く一覧（数百〜千枚のカードでもスマホで軽く動かすため。決定事項 #109）。
 * ページ全体のスクロール（window）に合わせて、見えている範囲＋前後 overscan px の行だけを描く。
 * 行の高さは種類（kind）ごとに同じとみなし、最初は estimate、描いたあとに実際の高さを測って直す
 * （カードの行は幅で高さが変わるので、measureKey（幅など）が変わったら測り直す）。
 * 速くはじいてスクロールしている間に新しく入ってくる行は、軽い仮の行（renderLight）で描き、止まったら本物に替える。
 *
 *   <VirtualRows rows={rows} estimate={{ head: 48, items: 320 }} render={(row) => …} renderLight={(row) => …} api={apiRef} />
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';

export interface VRow {
  key: string;
  kind: string;
}

export interface VirtualApi {
  /** その行が見えるところまでページをスクロールする */
  scrollToRow(index: number, align?: 'nearest' | 'start'): void;
  /** 行の上端（一覧の上端から） */
  rowTop(index: number): number;
  /** 一覧の上端から offset px のところにある行 */
  rowAt(offset: number): number;
  /** 上に固定しているバーの下で、上の端まで見えているいちばん上の行 */
  firstVisibleRow(): number;
}

interface Props<R extends VRow> {
  rows: readonly R[];
  estimate: Readonly<Record<string, number>>;
  render: (row: R, index: number) => ReactNode;
  /** 速いスクロールの間に出す軽い行（無ければいつも render） */
  renderLight?: (row: R, index: number) => ReactNode;
  className?: string;
  /** 見えている範囲の前後に余分に描く高さ（px） */
  overscan?: number;
  api?: RefObject<VirtualApi | null>;
  /** 描いた行が変わるたび（キーボードの移動でフォーカスを当てるのに使う） */
  onRendered?: () => void;
  /** これが変わったら行の高さを測り直す（一覧の幅・密度など） */
  measureKey?: string | number;
  /** 見える範囲の外でも描いておく行（キーボードのフォーカスを持っている行。消すとフォーカスが失われる） */
  keep?: number;
}

/** これより速いスクロール（px/ms）の間は、新しく入る行を仮の行で描く */
const FAST_SCROLL = 1.8;
/** スクロールが落ち着いたとみなすまで（ms） */
const SETTLE_MS = 140;

/** 上に固定しているバー（.topbar と、カード置き場の操作の列 .ctools--sticky）の高さ。行をスクロールで出すときはその下へ */
function stickyTop(): number {
  let h = document.querySelector<HTMLElement>('.topbar')?.offsetHeight ?? 0;
  const bar = document.querySelector<HTMLElement>('.ctools--sticky:not(.is-tucked)');
  if (bar) h += bar.offsetHeight;
  return h;
}

function upperBound(xs: readonly number[], v: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function VirtualRows<R extends VRow>({ rows, estimate, render, renderLight, className, overscan = 700, api, onRendered, measureKey, keep }: Props<R>) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<Record<string, number>>({});
  /** 測った時点の measureKey（種類ごと） */
  const measuredFor = useRef(new Map<string, string | number | undefined>());

  const offsets = useMemo(() => {
    const out = new Array<number>(rows.length + 1);
    out[0] = 0;
    for (let i = 0; i < rows.length; i++) out[i + 1] = out[i]! + (measured[rows[i]!.kind] ?? estimate[rows[i]!.kind] ?? 60);
    return out;
  }, [rows, measured, estimate]);
  const total = offsets[rows.length]!;

  const [range, setRange] = useState<[number, number]>([0, Math.min(rows.length, 12)]);
  const [fast, setFast] = useState(false);
  const offsetsRef = useRef(offsets);
  offsetsRef.current = offsets;
  /** 本物で描いたことのある行（速いスクロールの間も、本物のまま残す） */
  const full = useRef(new Set<string>());
  const fullFor = useRef(rows);
  if (fullFor.current !== rows) {
    fullFor.current = rows;
    full.current = new Set();
  }

  /** 速いスクロールが落ち着いたら仮の行をやめるタイマー。行が変わって下の効果が作り直されても消さない（消すと仮の行のまま残る） */
  const settle = useRef(0);
  useEffect(() => () => window.clearTimeout(settle.current), []);

  useLayoutEffect(() => {
    let lastY = window.scrollY;
    let lastT = performance.now();
    const compute = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const offs = offsetsRef.current;
      const n = offs.length - 1;
      const from = -top - overscan;
      const to = -top + window.innerHeight + overscan;
      const start = Math.max(0, upperBound(offs, from) - 1);
      const end = Math.min(n, Math.max(start, upperBound(offs, to)));
      setRange((r) => (r[0] === start && r[1] === end ? r : [start, end]));
    };
    compute();
    let raf = 0;
    const on = () => {
      const now = performance.now();
      const v = Math.abs(window.scrollY - lastY) / Math.max(1, now - lastT);
      lastY = window.scrollY;
      lastT = now;
      if (renderLight && v > FAST_SCROLL) {
        setFast(true);
        window.clearTimeout(settle.current);
        settle.current = window.setTimeout(() => setFast(false), SETTLE_MS);
      }
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        compute();
      });
    };
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
    };
  }, [offsets, overscan, renderLight]);

  // 描いた行の実際の高さを種類ごとに測る（まだ測っていない種類と、measureKey が変わったときだけ。仮の行は測らない）
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let next: Record<string, number> | null = null;
    for (const child of el.children) {
      const c = child as HTMLElement;
      const kind = c.dataset.vkind;
      if (!kind || c.dataset.light || (measuredFor.current.has(kind) && measuredFor.current.get(kind) === measureKey)) continue;
      const h = c.offsetHeight;
      if (h <= 0) continue;
      measuredFor.current.set(kind, measureKey);
      if (Math.abs(h - (measured[kind] ?? estimate[kind] ?? 60)) > 0.5) {
        next ??= { ...measured };
        next[kind] = h;
      }
    }
    if (next) setMeasured(next);
    onRendered?.();
  });

  useEffect(() => {
    if (!api) return;
    api.current = {
      rowTop: (i) => offsetsRef.current[Math.max(0, Math.min(i, offsetsRef.current.length - 1))]!,
      rowAt: (offset) => Math.max(0, Math.min(offsetsRef.current.length - 2, upperBound(offsetsRef.current, offset) - 1)),
      firstVisibleRow() {
        const el = ref.current;
        if (!el) return 0;
        const offs = offsetsRef.current;
        const y = stickyTop() - el.getBoundingClientRect().top;
        const r = this.rowAt(y);
        // 上が固定バーの下に潜っている行は飛ばす（その行にフォーカスすると、ページが動いてしまう）
        return offs[r]! < y - 1 && r + 1 < offs.length - 1 ? r + 1 : r;
      },
      scrollToRow(i, align = 'nearest') {
        const el = ref.current;
        if (!el) return;
        const offs = offsetsRef.current;
        const docTop = el.getBoundingClientRect().top + window.scrollY;
        const top = docTop + offs[i]!;
        const bottom = docTop + offs[i + 1]!;
        const sticky = stickyTop();
        const viewTop = window.scrollY + sticky;
        const viewBottom = window.scrollY + window.innerHeight - 90;
        if (align === 'start' || top < viewTop) window.scrollTo({ top: top - sticky - 8 });
        else if (bottom > viewBottom) window.scrollTo({ top: bottom - window.innerHeight + 90 });
      },
    };
  });

  const [start, end] = range;
  const shown: ReactNode[] = [];
  const indices: number[] = [];
  if (keep !== undefined && keep >= 0 && keep < rows.length && (keep < start || keep >= end)) indices.push(keep);
  for (let i = start; i < Math.min(end, rows.length); i++) indices.push(i);
  for (const i of indices) {
    const row = rows[i]!;
    const light = fast && !!renderLight && i !== keep && !full.current.has(row.key);
    if (!light) full.current.add(row.key);
    shown.push(
      <Row key={row.key} row={row} index={i} top={offsets[i]!} light={light} render={(light ? renderLight! : render) as (row: VRow, index: number) => ReactNode} />,
    );
  }
  return (
    <div ref={ref} className={className} style={{ position: 'relative', height: total }}>
      {shown}
    </div>
  );
}

/**
 * 1行。スクロールで見える範囲だけが変わったときは、もう描いてある行を描き直さない
 * （行・位置・描き方の関数が同じなら同じ）。呼び出し側が描き直したいときは render を作り直す
 */
const Row = memo(function Row({ row, index, top, light, render }: { row: VRow; index: number; top: number; light: boolean; render: (row: VRow, index: number) => ReactNode }) {
  return (
    <div className="vrow" data-vkind={row.kind} data-vrow={index} data-light={light || undefined} style={{ transform: `translateY(${top}px)` }}>
      {render(row, index)}
    </div>
  );
});
