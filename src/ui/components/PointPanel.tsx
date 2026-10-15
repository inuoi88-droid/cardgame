/** 合計ポイント・内訳・上限までの残り・判定結果・違反理由の表示 */
import { CARD_TYPE_LABEL, CURSE_LABEL, RARITY_LABEL, type CardAnalysis, type Rarity } from '../../engine/index.ts';
import { cx, signed } from '../util.ts';
import { Violations } from './controls.tsx';

interface Props {
  analysis: CardAnalysis;
  rarity: Rarity;
  /** カード以外の理由で保存できないとき（名前の重複など） */
  extraViolations?: { message: string }[];
}

export function PointPanel({ analysis: a, rarity, extraViolations = [] }: Props) {
  const p = a.points;
  const over = p.remaining < 0;
  return (
    <section className="panel point-panel" aria-label="ポイントと判定">
      <div className="point-panel__badges">
        <span className="badge">{CARD_TYPE_LABEL[a.cardType]}</span>
        <span className={cx('badge', `badge--${rarity}`)}>{RARITY_LABEL[rarity]}</span>
        {a.isCurse && <span className="badge badge--curse">{CURSE_LABEL}</span>}
      </div>

      <div className={cx('point-panel__total', over && 'is-over')}>
        <div>
          <span className="point-panel__big">{p.total}</span>
          <span> / {p.cap}pt</span>
        </div>
        <div className="point-panel__remain">{over ? `${-p.remaining}pt 超過` : `残り ${p.remaining}pt`}</div>
      </div>

      <table className="point-table">
        <tbody>
          {p.lines.map((l, i) => (
            <tr key={i} className={cx(`point-table__${l.kind}`)}>
              <th scope="row">{l.label}</th>
              <td className="point-table__formula">{l.formula}</td>
              <td className="point-table__value">{signed(l.value)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">合計</th>
            <td />
            <td className="point-table__value">{p.total}</td>
          </tr>
        </tfoot>
      </table>

      {a.isCurse && (
        <p className={cx('curse-req', p.drawbackTotal < p.cap && 'is-ng')}>
          呪いの条件：デメリット合計 {p.drawbackTotal}pt（{p.cap}pt以上が必要）{p.drawbackTotal >= p.cap ? ' ✓' : ''}
        </p>
      )}

      {a.violations.length === 0 && extraViolations.length === 0 ? (
        <p className="ok-msg">✓ このカードは作成できます</p>
      ) : (
        <Violations items={[...a.violations, ...extraViolations]} />
      )}
    </section>
  );
}
