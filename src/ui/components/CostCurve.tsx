/** コスト分布の棒グラフ（MTG 要素 △ バッチD：#629 マナカーブ）。モンスター／それ以外の積み上げ。スマホでも横に収まる（SVG は幅100%） */
import { useMemo } from 'react';
import type { CardDef, Deck } from '../../engine/index.ts';
import { cx } from '../util.ts';
import { costCurve } from './costCurve.ts';

const W = 300;
const H = 120;
const PAD_B = 18;
const PAD_T = 14;
const GAP = 2;

export function CostCurve({ deck, cards, compact = false }: { deck: Pick<Deck, 'entries'>; cards: readonly CardDef[]; compact?: boolean }) {
  const data = useMemo(() => costCurve(deck, cards), [deck, cards]);
  const max = Math.max(1, ...data.bars.map((b) => b.monster + b.other));
  const slot = W / data.bars.length;
  const barW = Math.min(34, slot * 0.6);
  const scale = (n: number) => (n / max) * (H - PAD_B - PAD_T);
  const label = data.bars.map((b) => `コスト${b.cost}：${b.monster + b.other}枚（モンスター${b.monster}・それ以外${b.other}）`).join('、');
  return (
    <figure className={cx('curve', compact && 'curve--compact')}>
      <figcaption className="curve__head">
        <b>コスト分布</b>
        <span>平均 {data.average.toFixed(1)}</span>
        <span className="curve__legend">
          <i className="curve__swatch curve__swatch--monster" aria-hidden="true" />
          モンスター
          <i className="curve__swatch curve__swatch--other" aria-hidden="true" />
          それ以外
        </span>
      </figcaption>
      <svg className="curve__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`コスト分布：${label}`} preserveAspectRatio="xMidYMid meet">
        <line x1={0} x2={W} y1={H - PAD_B} y2={H - PAD_B} className="curve__axis" />
        {data.bars.map((b, i) => {
          const x = i * slot + (slot - barW) / 2;
          const base = H - PAD_B;
          const hm = scale(b.monster);
          const ho = scale(b.other);
          const n = b.monster + b.other;
          return (
            <g key={b.cost}>
              <title>{`コスト${b.cost}：${n}枚（モンスター${b.monster}・それ以外${b.other}）`}</title>
              {/* 当たり判定は棒より広く */}
              <rect x={i * slot} y={PAD_T} width={slot} height={base - PAD_T} fill="transparent" />
              {hm > 0 && <rect x={x} y={base - hm} width={barW} height={hm} rx={ho > 0 ? 0 : 4} className="curve__bar curve__bar--monster" />}
              {ho > 0 && <rect x={x} y={base - hm - ho - (hm > 0 ? GAP : 0)} width={barW} height={Math.max(0, ho)} rx={4} className="curve__bar curve__bar--other" />}
              {n > 0 && (
                <text x={x + barW / 2} y={base - hm - ho - (hm > 0 && ho > 0 ? GAP : 0) - 3} className="curve__num" textAnchor="middle">
                  {n}
                </text>
              )}
              <text x={x + barW / 2} y={H - 4} className="curve__cost" textAnchor="middle">
                {b.cost}
              </text>
            </g>
          );
        })}
      </svg>
      {data.advice && !compact && <p className="curve__advice">{data.advice}</p>}
    </figure>
  );
}
