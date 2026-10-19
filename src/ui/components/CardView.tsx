/** カード風の見た目。枠の色はレアリティごと、呪いカードは専用の見た目 */
import { useMemo } from 'react';
import { analyzeCard, CARD_TYPE_LABEL, CURSE_LABEL, RARITY_LABEL, type CardAnalysis, type CardDef } from '../../engine/index.ts';
import { cx } from '../util.ts';

interface Props {
  card: CardDef;
  analysis?: CardAnalysis;
  size?: 'sm' | 'lg';
  onClick?: () => void;
}

export function CardView({ card, analysis, size = 'lg', onClick }: Props) {
  const a = useMemo(() => analysis ?? analyzeCard(card), [analysis, card]);
  const name = card.name.trim() || '（名前なし）';
  return (
    <div
      className={cx('card', `card--${card.rarity}`, a.isCurse && 'card--curse', `card--${size}`, onClick && 'card--clickable')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      aria-label={onClick ? `${name}を編集` : undefined}
    >
      <div className="card__head">
        <span className="card__cost" title="コスト">
          {card.cost}
        </span>
        <span className="card__name">{name}</span>
      </div>
      <div className="card__art">
        <span className="card__icon">{card.icon}</span>
        {a.isCurse && <span className="card__curse-mark">呪</span>}
      </div>
      <div className="card__type">
        {CARD_TYPE_LABEL[a.cardType]}・{RARITY_LABEL[card.rarity]}
        {a.isCurse && `・${CURSE_LABEL}`}
      </div>
      <div className="card__text">
        {a.text.keywords.length > 0 && (
          <div className="card__keywords">
            {a.text.keywords.map((k, i) => (
              <span key={i} className="kw" title={k.text}>
                {k.name}
              </span>
            ))}
          </div>
        )}
        {a.text.effects.map((t, i) => (
          <p key={i}>{t}</p>
        ))}
        {a.text.drawbacks.map((t, i) => (
          <p key={`d${i}`} className="card__drawback">
            {t}
          </p>
        ))}
      </div>
      {card.stats && (
        <div className="card__stats">
          <span title="攻撃力">⚔{card.stats.attack}</span>
          <span title="体力">❤{card.stats.hp}</span>
          <span title="守備力">🛡{card.stats.defense}</span>
        </div>
      )}
      {!a.valid && size === 'sm' && <div className="card__invalid">要修正</div>}
    </div>
  );
}
