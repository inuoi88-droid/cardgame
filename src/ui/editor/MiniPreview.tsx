/** スマホ上部に固定する小さなプレビュー（アイコン・名前・種類・予算メーター）。タップで等倍プレビューと内訳を開く */
import { CARD_TYPE_LABEL, CURSE_LABEL, RARITY_LABEL, type CardAnalysis, type CardDef } from '../../engine/index.ts';
import { cx } from '../util.ts';
import type { BudgetModel } from './budget.ts';
import { BudgetMeterCompact } from './BudgetMeter.tsx';

interface Props {
  card: CardDef;
  analysis: CardAnalysis;
  budget: BudgetModel;
  invalidCount: number;
  flash?: boolean;
  onOpen: () => void;
}

export function MiniPreview({ card, analysis: a, budget, invalidCount, flash, onOpen }: Props) {
  const name = card.name.trim() || '（名前なし）';
  return (
    <button type="button" className={cx('ed-mini', a.isCurse && 'is-curse')} onClick={onOpen} aria-label={`${name} のプレビューと内訳を見る`}>
      <span className={cx('ed-mini__icon', `frame--${card.rarity}`, a.isCurse && 'frame--curse')} aria-hidden="true">
        {card.icon}
        <span className="ed-mini__cost">{card.cost}</span>
      </span>
      <span className="ed-mini__main">
        <span className="ed-mini__top">
          <b className="ed-mini__name">{name}</b>
          <span className={cx('ed-mini__type', `text--${card.rarity}`)}>
            {CARD_TYPE_LABEL[a.cardType]}・{RARITY_LABEL[card.rarity]}
            {a.isCurse && `・${CURSE_LABEL}`}
          </span>
          {invalidCount > 0 && <span className="badge badge--ng badge--sm">要修正 {invalidCount}</span>}
        </span>
        <BudgetMeterCompact m={budget} flash={flash} />
      </span>
      <span className="ed-mini__chev" aria-hidden="true">
        ▾
      </span>
    </button>
  );
}
