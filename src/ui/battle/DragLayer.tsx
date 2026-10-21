/**
 * ドラッグ中の重ね絵：指についてくるカード（ゴースト）、カードから指への矢印、「ここに離して使う」の場所、短い案内。
 * 指の位置は useBattleDrag の購読から読む（盤面全体を描き直さない）。どれも pointer-events: none。
 */
import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { cx } from '../util.ts';
import { arrowPath, targetKey, type ZoneRole } from './dragLogic.ts';
import type { DragInfo } from './useDrag.ts';

const ZONE_LABEL: Record<ZoneRole, string> = {
  play: 'ここに離して使う',
  self: 'ここに離して使う（このモンスター自身に）',
  noise: 'ここに離してノイズを除外',
};

/** 案内の中心を画面の端から離す（横にはみ出さないように） */
const clampX = (x: number) => Math.max(112, Math.min(window.innerWidth - 112, x));

export function DragLayer({
  drag,
  subscribe,
  getPos,
  ghost,
  rootRef,
}: {
  drag: DragInfo;
  subscribe: (f: () => void) => () => void;
  getPos: () => { x: number; y: number };
  ghost: ReactNode;
  rootRef: React.RefObject<HTMLElement | null>;
}) {
  const pos = useSyncExternalStore(subscribe, getPos, getPos);
  const { plan, origin, hover, phase, zone } = drag;
  const validKeys = new Set(plan.targets.map(targetKey));
  const hoverValid = hover !== null && (validKeys.has(hover) || (hover === 'zone' && plan.zone !== null) || (hover === 'pile' && plan.pile) || (hover === 'waiting' && plan.waiting === true));
  const ow = origin.right - origin.left;
  const oh = origin.bottom - origin.top;

  // 矢印：つかんだ要素の上（手札）／中心（モンスター）から、指（吸い付いた対象があればその中心）へ
  let arrow: { d: string; angle: number; to: { x: number; y: number } } | null = null;
  if (plan.mode === 'arrow' && phase === 'drag') {
    // 手札のカードは上の辺から、モンスター・起動の ⚡ ボタンは中心から
    const from = drag.src.kind === 'card' ? { x: origin.left + ow / 2, y: origin.top + 8 } : { x: origin.left + ow / 2, y: origin.top + oh / 2 };
    let to = pos;
    if (hoverValid && hover !== 'zone' && hover !== 'pile' && hover !== 'waiting') {
      const el = rootRef.current?.querySelector<HTMLElement>(`[data-drop="${CSS.escape(hover!)}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        to = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    arrow = { ...arrowPath(from, to), to };
  }

  const ghostStyle: CSSProperties =
    phase === 'back'
      ? { left: origin.left, top: origin.top, width: ow, transform: 'none' }
      : { left: pos.x - ow / 2, top: pos.y - oh * 0.7, width: ow };

  return (
    <div className={cx('drag-layer', `drag-layer--${plan.mode}`, phase === 'back' && 'is-back')} aria-hidden="true">
      {zone && plan.zone && phase === 'drag' && (
        <div
          className={cx('play-zone', hover === 'zone' && 'is-hover')}
          data-drop="zone"
          style={{ left: zone.left, top: zone.top, width: zone.right - zone.left, height: zone.bottom - zone.top }}
        >
          <span className="play-zone__label">{drag.src.kind === 'activate' ? 'ここに離して起動' : ZONE_LABEL[plan.zone]}</span>
        </div>
      )}
      {plan.mode === 'ghost' && (
        <div className={cx('drag-ghost', hoverValid && 'is-ok')} style={ghostStyle}>
          {ghost}
        </div>
      )}
      {arrow && (
        <svg className={cx('drag-arrow', hoverValid && 'is-ok', plan.targets.length === 0 && 'is-none')} width="100%" height="100%">
          <path className="drag-arrow__shadow" d={arrow.d} />
          <path className="drag-arrow__line" d={arrow.d} />
          <g transform={`translate(${arrow.to.x} ${arrow.to.y}) rotate(${arrow.angle})`}>
            <path className="drag-arrow__head" d="M 6 0 L -14 -11 L -9 0 L -14 11 Z" />
          </g>
          {hoverValid && <circle className="drag-arrow__reticle" cx={arrow.to.x} cy={arrow.to.y} r="22" />}
        </svg>
      )}
      {/* 「ここに離して使う」の場所が出ているときは、同じ意味の案内を指の横に重ねない */}
      {phase === 'drag' && !(plan.mode === 'ghost' && zone && plan.zone) && (
        <div
          className={cx('drag-hint', hoverValid && 'is-ok', drag.src.kind === 'attacker' && 'drag-hint--below', plan.hint.length > 14 && 'is-long')}
          style={
            // ゴーストはカードの上、手札からの矢印はそのカードの上、攻撃はモンスターの下（対象の名前を隠さない）
            (plan.mode === 'ghost'
              ? { left: clampX(pos.x), top: pos.y, '--lift': `${Math.round(oh * 0.7) + 10}px` }
              : drag.src.kind === 'attacker'
                ? { left: clampX(origin.left + ow / 2), top: origin.bottom }
                : { left: clampX(origin.left + ow / 2), top: origin.top, '--lift': '26px' }) as CSSProperties
          }
        >
          {plan.hint}
        </div>
      )}
    </div>
  );
}
