/** スマホ上部に固定する小さなプレビュー（アイコン・名前・種類・予算メーター）。タップで等倍プレビューと内訳を開く */
import { CARD_TYPE_LABEL, CURSE_LABEL, RARITY_LABEL, type CardAnalysis, type CardDef } from '../../engine/index.ts';
import { cx } from '../util.ts';
import { CardArt } from '../components/CardArt.tsx';
import { CostGem, frameClasses } from '../components/cardParts.tsx';
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
    <button type="button" className={cx('ed-mini', frameClasses(card.rarity, a.cardType, a.isCurse), a.isCurse && 'is-curse')} onClick={onOpen} aria-label={`${name}（コスト${card.cost}）のプレビューと内訳を見る`}>
      <span className="ed-mini__icon" aria-hidden="true">
        <CardArt icon={card.icon} rarity={card.rarity} cardType={a.cardType} curse={a.isCurse} size={52} />
        <CostGem cost={card.cost} className="ed-mini__gem" label={false} />
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
      <span className="ed-mini__chev" aria-hidden="true" />
    </button>
  );
}
