/**
 * 対戦画面のドラッグ＆ドロップ（Pointer Events：マウス・タッチ・ペンを同じ処理で扱う）。
 * - 要素に bind(...) の onPointerDown を付ける。少し動いたら（gestureOf）ドラッグを始め、離したら onDrop に落とし先を渡す
 * - 押して離しただけ（ドラッグにならなかった）ならクリックのまま（詳細を開く）。ドラッグの直後のクリックは consumeClick で捨てる
 * - 落とし先は root の中の [data-drop] 要素の矩形から決める（dragLogic.pickSpot。指より下の要素に頼らない）
 * - Esc・pointercancel で取り消し。onDrop が 'back' を返したら、カードが元の位置へ戻る演出をする
 * 指の位置は頻繁に変わるので React の state にせず、小さな購読（subscribe / getPos）で DragLayer だけを描き直す。
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { gestureOf, pickSpot, planDrag, targetKey, type Box, type DragOrigin, type DragPlan, type DragSource } from './dragLogic.ts';

export interface DragInfo {
  src: DragSource;
  plan: DragPlan;
  /** つかんだ要素の位置（画面座標） */
  origin: Box;
  /** 今の落とし先の鍵（光らせる・吸い付くのに使う） */
  hover: string | null;
  /** 'drag'＝ドラッグ中 / 'back'＝元の位置へ戻る演出中 */
  phase: 'drag' | 'back';
  /** 「ここに離して使う」の矩形（出すときだけ） */
  zone: Box | null;
}

export type DropResult = 'ok' | 'back';

interface Pending {
  pointerId: number;
  pointerType: string;
  x0: number;
  y0: number;
  el: HTMLElement;
  origin: DragOrigin;
  getSrc: () => DragSource | null;
}

const toBox = (r: DOMRect): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });

/** 戻る演出の長さ（ms） */
const BACK_MS = 220;

export function useBattleDrag(opts: {
  rootRef: React.RefObject<HTMLElement | null>;
  onDrop: (src: DragSource, spot: string | null) => DropResult;
  /** 「ここに離して使う」の場所を出す要素のセレクター（その矩形をまとめた範囲に出す） */
  zoneSelector: string;
  reduceMotion: boolean;
  /** ドラッグが始まったとき（捨て札の一覧からつかんだら一覧を閉じる。MTG 要素 ○ バッチC1） */
  onStart?: (src: DragSource) => void;
}) {
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const pending = useRef<Pending | null>(null);
  const pos = useRef({ x: 0, y: 0 });
  const listeners = useRef(new Set<() => void>());
  const clickBlock = useRef(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const cleanup = useRef<(() => void) | null>(null);
  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (d: DragInfo | null) => {
    dragRef.current = d;
    setDrag(d);
  };
  const notify = () => listeners.current.forEach((f) => f());

  const collect = (plan: DragPlan): { boxes: { key: string; box: Box }[]; valid: Set<string> } => {
    const root = optsRef.current.rootRef.current;
    const boxes: { key: string; box: Box }[] = [];
    root?.querySelectorAll<HTMLElement>('[data-drop]').forEach((el) => {
      const key = el.dataset.drop;
      if (key) boxes.push({ key, box: toBox(el.getBoundingClientRect()) });
    });
    const valid = new Set(plan.targets.map(targetKey));
    if (plan.zone) valid.add('zone');
    if (plan.pile) valid.add('pile');
    return { boxes, valid };
  };

  const end = useCallback((spotFromPointer: boolean) => {
    const d = dragRef.current;
    cleanup.current?.();
    cleanup.current = null;
    pending.current = null;
    if (!d || d.phase !== 'drag') return;
    // ドラッグの直後に来るクリック（同じ要素の上で離したとき）を捨てる
    clickBlock.current = Date.now() + 80;
    const result = optsRef.current.onDrop(d.src, spotFromPointer ? d.hover : 'hand');
    if (result === 'ok' || optsRef.current.reduceMotion) {
      set(null);
      return;
    }
    set({ ...d, phase: 'back' });
    backTimer.current = setTimeout(() => {
      backTimer.current = null;
      set(null);
    }, BACK_MS);
  }, []);

  const cancel = useCallback(() => {
    const d = dragRef.current;
    cleanup.current?.();
    cleanup.current = null;
    pending.current = null;
    if (!d || d.phase !== 'drag') return;
    clickBlock.current = Date.now() + 80;
    if (optsRef.current.reduceMotion) {
      set(null);
      return;
    }
    set({ ...d, phase: 'back' });
    backTimer.current = setTimeout(() => {
      backTimer.current = null;
      set(null);
    }, BACK_MS);
  }, []);

  const start = (p: Pending, x: number, y: number): boolean => {
    const src = p.getSrc();
    if (!src) return false;
    if (backTimer.current) clearTimeout(backTimer.current);
    const plan = planDrag(src);
    let zone: Box | null = null;
    if (plan.zone) {
      const els = optsRef.current.rootRef.current?.querySelectorAll<HTMLElement>(optsRef.current.zoneSelector) ?? [];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        zone = zone
          ? { left: Math.min(zone.left, r.left), top: Math.min(zone.top, r.top), right: Math.max(zone.right, r.right), bottom: Math.max(zone.bottom, r.bottom) }
          : toBox(r);
      }
    }
    pos.current = { x, y };
    try {
      p.el.setPointerCapture(p.pointerId);
    } catch {
      /* 取れなくても window で受ける */
    }
    set({ src, plan, origin: toBox(p.el.getBoundingClientRect()), hover: null, phase: 'drag', zone });
    optsRef.current.onStart?.(src);
    return true;
  };

  const onMove = (e: PointerEvent) => {
    const p = pending.current;
    if (!p || e.pointerId !== p.pointerId) return;
    const d = dragRef.current;
    if (!d || d.phase !== 'drag') {
      const g = gestureOf(e.clientX - p.x0, e.clientY - p.y0, p.pointerType, p.origin);
      if (g === 'wait') return;
      if (g === 'scroll' || !start(p, e.clientX, e.clientY)) {
        cleanup.current?.();
        cleanup.current = null;
        pending.current = null;
        return;
      }
    }
    if (e.cancelable) e.preventDefault();
    pos.current = { x: e.clientX, y: e.clientY };
    const cur = dragRef.current!;
    const { boxes, valid } = collect(cur.plan);
    const hover = pickSpot(e.clientX, e.clientY, boxes, valid);
    if (hover !== cur.hover) set({ ...cur, hover });
    notify();
  };

  const begin = (e: ReactPointerEvent<HTMLElement>, origin: DragOrigin, getSrc: () => DragSource | null) => {
    if (e.button !== 0 || !e.isPrimary) return;
    if (dragRef.current?.phase === 'drag') return;
    cleanup.current?.();
    pending.current = { pointerId: e.pointerId, pointerType: e.pointerType, x0: e.clientX, y0: e.clientY, el: e.currentTarget, origin, getSrc };
    const up = (ev: PointerEvent) => {
      if (pending.current && ev.pointerId !== pending.current.pointerId) return;
      if (dragRef.current?.phase === 'drag') {
        // 離した位置で落とし先を決め直す（最後の move から動いていることがある）
        const cur = dragRef.current;
        const { boxes, valid } = collect(cur.plan);
        const hover = pickSpot(ev.clientX, ev.clientY, boxes, valid);
        dragRef.current = { ...cur, hover };
        end(true);
      } else {
        cleanup.current?.();
        cleanup.current = null;
        pending.current = null;
      }
    };
    const cancelEv = (ev: PointerEvent) => {
      if (pending.current && ev.pointerId !== pending.current.pointerId) return;
      cancel();
      cleanup.current?.();
      cleanup.current = null;
      pending.current = null;
    };
    // ドラッグ中はタッチのスクロールを止める（手札の横スクロールに取られないように）
    const touchMove = (ev: TouchEvent) => {
      if (dragRef.current?.phase === 'drag' && ev.cancelable) ev.preventDefault();
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && dragRef.current?.phase === 'drag') {
        ev.preventDefault();
        ev.stopPropagation();
        cancel();
      }
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancelEv);
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('keydown', key, true);
    cleanup.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancelEv);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('keydown', key, true);
    };
  };

  useEffect(
    () => () => {
      cleanup.current?.();
      if (backTimer.current) clearTimeout(backTimer.current);
    },
    [],
  );

  const subscribe = useCallback((f: () => void) => {
    listeners.current.add(f);
    return () => {
      listeners.current.delete(f);
    };
  }, []);
  const getPos = useCallback(() => pos.current, []);

  return {
    drag,
    begin,
    cancel,
    subscribe,
    getPos,
    /** ドラッグの直後のクリックなら true（そのクリックは無視する） */
    consumeClick: () => Date.now() < clickBlock.current,
    /** いまドラッグ中か（長押しの詳細など、古い描画の関数から呼んでも最新を返す） */
    isActive: () => dragRef.current?.phase === 'drag',
  };
}
