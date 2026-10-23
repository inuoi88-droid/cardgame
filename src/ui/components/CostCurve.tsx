/**
 * コスト分布の棒グラフ（MTG 要素 △ バッチD：#629 マナカーブ）。モンスター／それ以外の積み上げ。スマホでも横に収まる（SVG は幅100%）。
 * UI2「黒鉄と金の卓」（決定事項 #111 の D）：平らな金属の柱（モンスター＝サファイア、それ以外＝鉄銀）に上辺の光の線だけ、
 * 床は彫った線、コストの目盛りは小さな鉄の六角（カードのコストの宝石と同じ形・色は鉄）。数字は羊皮紙。
 */
import { useId, useMemo } from 'react';
import type { CardDef, Deck } from '../../engine/index.ts';
import { cx } from '../util.ts';
import { costCurve } from './costCurve.ts';
import './costCurve.css';

const W = 300;
const H = 132;
const PAD_B = 26;
const PAD_T = 16;
const GAP = 1;
/** 目盛りの六角の半径 */
const HEX_R = 9;

const hexPoints = (cx0: number, cy0: number, r: number) =>
  Array.from({ length: 6 }, (_, k) => {
    const t = (Math.PI / 3) * k - Math.PI / 2;
    return `${(cx0 + r * Math.cos(t)).toFixed(2)},${(cy0 + r * Math.sin(t)).toFixed(2)}`;
  }).join(' ');

export function CostCurve({ deck, cards, compact = false }: { deck: Pick<Deck, 'entries'>; cards: readonly CardDef[]; compact?: boolean }) {
  const data = useMemo(() => costCurve(deck, cards), [deck, cards]);
  const uid = useId().replace(/:/g, '');
  const max = Math.max(1, ...data.bars.map((b) => b.monster + b.other));
  const slot = W / data.bars.length;
  const barW = Math.min(30, slot * 0.56);
  const base = H - PAD_B;
  const scale = (n: number) => (n / max) * (base - PAD_T);
  const label = data.bars.map((b) => `コスト${b.cost}：${b.monster + b.other}枚（モンスター${b.monster}・それ以外${b.other}）`).join('、');
  const gm = `cc-m-${uid}`;
  const go = `cc-o-${uid}`;
  return (
    <figure className={cx('curve', compact && 'curve--compact')}>
      <figcaption className="curve__head">
        <b>コスト分布</b>
        <span>
          平均 <b className="curve__avg">{data.average.toFixed(1)}</b>
        </span>
        <span className="curve__legend">
          <i className="curve__swatch curve__swatch--monster" aria-hidden="true" />
          モンスター
          <i className="curve__swatch curve__swatch--other" aria-hidden="true" />
          それ以外
        </span>
      </figcaption>
      <svg className="curve__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`コスト分布：${label}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          {/* 平らな金属の柱：横に明暗（左の光・右の影） */}
          <linearGradient id={gm} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#5f8fe8" />
            <stop offset="0.35" stopColor="#3d6fd8" />
            <stop offset="1" stopColor="#1d3f9a" />
          </linearGradient>
          <linearGradient id={go} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#b9c0cc" />
            <stop offset="0.35" stopColor="#8d95a5" />
            <stop offset="1" stopColor="#4b5261" />
          </linearGradient>
        </defs>
        {/* 床：彫った線（暗い1px＋明るい1px） */}
        <line x1={0} x2={W} y1={base + 0.5} y2={base + 0.5} className="curve__axis" />
        <line x1={0} x2={W} y1={base + 1.5} y2={base + 1.5} className="curve__axis-hi" />
        {data.bars.map((b, i) => {
          const x = i * slot + (slot - barW) / 2;
          const hm = scale(b.monster);
          const ho = scale(b.other);
          const n = b.monster + b.other;
          const top = base - hm - ho - (hm > 0 && ho > 0 ? GAP : 0);
          const cxm = x + barW / 2;
          return (
            <g key={b.cost}>
              <title>{`コスト${b.cost}：${n}枚（モンスター${b.monster}・それ以外${b.other}）`}</title>
              {/* 当たり判定は棒より広く */}
              <rect x={i * slot} y={PAD_T} width={slot} height={base - PAD_T} fill="transparent" />
              {hm > 0 && <rect x={x} y={base - hm} width={barW} height={hm} className="curve__bar" fill={`url(#${gm})`} />}
              {ho > 0 && <rect x={x} y={base - hm - ho - (hm > 0 ? GAP : 0)} width={barW} height={ho} className="curve__bar" fill={`url(#${go})`} />}
              {/* 上辺の光の線と、柱の縁の黒 */}
              {n > 0 && (
                <>
                  <rect x={x} y={top} width={barW} height={base - top} className="curve__rim" />
                  <rect x={x + 1} y={top + 0.5} width={barW - 2} height={1.6} className="curve__cap" />
                  <text x={cxm} y={top - 4} className="curve__num" textAnchor="middle">
                    {n}
                  </text>
                </>
              )}
              <polygon points={hexPoints(cxm, H - HEX_R - 3, HEX_R)} className={cx('curve__hex', n === 0 && 'is-zero')} />
              <text x={cxm} y={H - HEX_R - 3} dy="0.36em" className="curve__cost" textAnchor="middle">
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
