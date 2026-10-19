/**
 * 予算メーター：「使用 92 / 予算 300（あと 8）」と、区分ごとに色分けした横棒。
 * compact はスマホ上部のミニプレビュー用（1行＋細い棒）、full は内訳パネル用。
 */
import { RARITY_LABEL, type Rarity } from '../../engine/index.ts';
import { cx } from '../util.ts';
import type { BudgetModel } from './budget.ts';

interface BarProps {
  m: BudgetModel;
  size?: 'sm' | 'md';
}

/** 区分ごとの横棒。棒の長さは予算（粗計が予算を超えていればそちら）が 100% */
export function BudgetBar({ m, size = 'md' }: BarProps) {
  const max = Math.max(m.budget, m.gross, 1);
  const w = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const segs = [
    { kind: 'stat', value: m.segments.stat, label: 'ステータス' },
    { kind: 'keyword', value: m.segments.keyword, label: 'キーワード' },
    { kind: 'effect', value: m.segments.effect, label: '効果' },
  ].filter((s) => s.value > 0);
  const overStart = Math.max(0, m.budget);
  const overEnd = Math.min(m.used, max);
  return (
    <div className={cx('bm__bar', `bm__bar--${size}`)} role="img" aria-label={`使用 ${m.used}pt、予算 ${m.budget}pt`}>
      <div className="bm__segs">
        {segs.map((s) => (
          <span key={s.kind} className={cx('bm__seg', `bm__seg--${s.kind}`)} style={{ width: w(s.value) }} title={`${s.label} ${s.value}pt`} />
        ))}
      </div>
      {m.offset > 0 && <span className="bm__offset" style={{ left: w(m.used), width: w(m.offset) }} title={`デメリットで相殺 ${m.offset}pt`} />}
      {m.over > 0 && <span className="bm__over" style={{ left: w(overStart), width: w(overEnd - overStart) }} title={`超過 ${m.over}pt`} />}
      {m.gross > m.budget && <span className="bm__mark" style={{ left: w(m.budget) }} />}
    </div>
  );
}

interface MeterProps {
  m: BudgetModel;
  rarity: Rarity;
  cost: number;
  /** 保存できない理由があるとき（枠を赤くするだけ） */
  invalid?: boolean;
  id?: string;
  /** 注目してほしいとき（「理由を見る」で飛んできた）に一瞬光らせる */
  flash?: boolean;
}

/** フルサイズのメーター（内訳パネル・PC の右カラム） */
export function BudgetMeter({ m, rarity, cost, id, flash }: MeterProps) {
  const over = m.over > 0;
  const curseOk = m.drawbackTotal >= m.curseNeed;
  return (
    <div className={cx('bm', over && 'is-over', flash && 'is-flash')} id={id} tabIndex={-1}>
      <div className="bm__head">
        <div className="bm__used">
          <span className="bm__label">使用</span>
          <b className="bm__big">{m.used}</b>
          <span className="bm__label"> / 予算 {m.budget}</span>
        </div>
        <div className={cx('bm__remain', over ? 'is-over' : 'is-ok')} aria-live="polite">
          {over ? `超過 ${m.over}pt` : `あと ${m.remaining}pt`}
        </div>
      </div>
      <BudgetBar m={m} />
      <ul className="bm__legend">
        {m.segments.stat > 0 && (
          <li>
            <i className="bm__dot bm__dot--stat" />
            ステータス {m.segments.stat}
          </li>
        )}
        {m.segments.keyword > 0 && (
          <li>
            <i className="bm__dot bm__dot--keyword" />
            キーワード {m.segments.keyword}
          </li>
        )}
        {m.segments.effect > 0 && (
          <li>
            <i className="bm__dot bm__dot--effect" />
            効果 {m.segments.effect}
          </li>
        )}
        {m.offset > 0 && (
          <li>
            <i className="bm__dot bm__dot--offset" />
            デメリットで相殺 −{m.offset}
          </li>
        )}
        {over && (
          <li className="is-over">
            <i className="bm__dot bm__dot--over" />
            超過 {m.over}
          </li>
        )}
      </ul>
      <p className="bm__note">
        予算 {m.budget} ＝ {RARITY_LABEL[rarity]}の上限 {m.cap}
        {cost === 0 ? '（コスト0は上限が下がる）' : ''} ＋ コスト{cost}の予算 +{m.costBonus}
      </p>
      {m.used < 0 && <p className="bm__note bm__note--warn">デメリットが重すぎます。効果を増やせます</p>}
      {m.curse && (
        <div className={cx('bm__curse', !curseOk && 'is-ng')} id="ed-f-drawbacks-curse">
          <div className="bm__curse-head">
            <span>呪いの条件：デメリット合計</span>
            <b>
              {m.drawbackTotal} / 必要 {m.curseNeed}
            </b>
            <span className={cx('badge', curseOk ? 'badge--ok' : 'badge--ng')}>{curseOk ? '達成' : 'あと ' + (m.curseNeed - m.drawbackTotal)}</span>
          </div>
          <div className="bm__bar bm__bar--sm bm__bar--curse" role="img" aria-label={`デメリット合計 ${m.drawbackTotal}pt、必要 ${m.curseNeed}pt`}>
            <div className="bm__segs">
              <span className="bm__seg bm__seg--offset" style={{ width: `${Math.min(100, (m.drawbackTotal / Math.max(1, m.curseNeed)) * 100)}%` }} />
            </div>
          </div>
          {m.drawbackTotal > m.offsetLimit && (
            <p className="bm__note">
              相殺に使えるのは {m.offsetLimit}pt まで。超えた {m.drawbackTotal - m.offsetLimit}pt はカードを弱くするだけです
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** 1行の小さいメーター（スマホ上部） */
export function BudgetMeterCompact({ m, flash }: { m: BudgetModel; flash?: boolean }) {
  const over = m.over > 0;
  return (
    <div className={cx('bm bm--compact', over && 'is-over', flash && 'is-flash')}>
      <div className="bm__head">
        <span className="bm__used">
          使用 <b>{m.used}</b> / 予算 {m.budget}
        </span>
        <span className={cx('bm__remain', over ? 'is-over' : 'is-ok')}>{over ? `超過 ${m.over}` : `あと ${m.remaining}`}</span>
      </div>
      <BudgetBar m={m} size="sm" />
    </div>
  );
}
