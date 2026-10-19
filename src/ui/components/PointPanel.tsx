/** 予算メーター・内訳の表（折りたたみ）・要修正の一覧。PC の右カラムと、スマホの内訳シートで使う */
import { CARD_TYPE_LABEL, CURSE_LABEL, RARITY_LABEL, type CardAnalysis, type CardDef, type Violation } from '../../engine/index.ts';
import type { BudgetModel } from '../editor/budget.ts';
import { BudgetMeter } from '../editor/BudgetMeter.tsx';
import { cx, signed } from '../util.ts';

interface Props {
  card: CardDef;
  analysis: CardAnalysis;
  budget: BudgetModel;
  /** 画面に出す違反（名前の重複など、カード以外の理由も含む） */
  violations: Violation[];
  /** 違反をタップしたとき、その入力欄へ飛ぶ */
  onJump?: (path: string) => void;
  /** 内訳の表をはじめから開いておく */
  detailsOpen?: boolean;
  meterId?: string;
  flash?: boolean;
}

export function PointPanel({ card, analysis: a, budget, violations, onJump, detailsOpen = false, meterId, flash }: Props) {
  const p = a.points;
  return (
    <section className="panel point-panel" aria-label="ポイントと判定">
      <div className="point-panel__badges">
        <span className="badge">{CARD_TYPE_LABEL[a.cardType]}</span>
        <span className={cx('badge', `badge--${card.rarity}`)}>{RARITY_LABEL[card.rarity]}</span>
        {a.isCurse && <span className="badge badge--curse">{CURSE_LABEL}</span>}
      </div>

      <BudgetMeter m={budget} rarity={card.rarity} cost={card.cost} id={meterId} flash={flash} />

      {violations.length === 0 ? (
        <p className="ok-msg">✓ このカードは作成できます</p>
      ) : (
        <div className="ed-vlist" aria-live="polite">
          <p className="ed-vlist__head">要修正 {violations.length}件</p>
          <ul>
            {violations.map((v, i) => (
              <li key={i}>
                {onJump && v.path ? (
                  <button type="button" className="ed-vlist__btn" onClick={() => onJump(v.path!)}>
                    {v.message}
                    <span className="ed-vlist__go">→ 直す</span>
                  </button>
                ) : (
                  v.message
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <details className="ed-details" open={detailsOpen}>
        <summary>内訳の表</summary>
        <table className="point-table">
          <tbody>
            {p.lines.map((l, i) => (
              <tr key={i} className={cx(`point-table__${l.kind}`)}>
                <th scope="row">{l.kind === 'cost' ? `コスト${card.cost}` : l.label}</th>
                <td className="point-table__formula">{l.kind === 'cost' ? '予算に加算' : l.formula}</td>
                <td className="point-table__value">{l.kind === 'cost' ? `予算 +${-l.value}` : signed(l.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">使用</th>
              <td className="point-table__formula">予算 {budget.budget}</td>
              <td className="point-table__value">{budget.used}</td>
            </tr>
          </tfoot>
        </table>
      </details>

    </section>
  );
}
