/** カード風の見た目。枠の色はレアリティごと、呪いカードは専用の見た目 */
import { useMemo } from 'react';
import { analyzeCard, CARD_TYPE_LABEL, CURSE_LABEL, RARITY_LABEL, TRIBE_LABEL, type CardAnalysis, type CardDef } from '../../engine/index.ts';
import { cx } from '../util.ts';
import { CardArt } from './CardArt.tsx';
import './cards.css';

interface Props {
  card: CardDef;
  analysis?: CardAnalysis;
  size?: 'sm' | 'lg';
  onClick?: () => void;
  /** onClick があるときの読み上げ名（既定は「〇〇の詳細を見る」） */
  actionLabel?: string;
}

export function CardView({ card, analysis, size = 'lg', onClick, actionLabel }: Props) {
  const a = useMemo(() => analysis ?? analyzeCard(card), [analysis, card]);
  const name = card.name.trim() || '（名前なし）';
  return (
    <div
      className={cx('card', `card--${card.rarity}`, a.isCurse && 'card--curse', `card--${size}`, onClick && 'card--clickable')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
              e.preventDefault();
              onClick();
            }
          : undefined
      }
      aria-label={onClick ? (actionLabel ?? `${name}の詳細を見る`) : undefined}
    >
      <div className="card__head">
        <span className="card__cost" title="コスト">
          {card.cost}
        </span>
        <span className="card__name">{name}</span>
      </div>
      <div className="card__art">
        <CardArt icon={card.icon} rarity={card.rarity} cardType={a.cardType} curse={a.isCurse} className="card__icon" size={size === 'sm' ? 'var(--card-art-sm, 52px)' : 'var(--card-art-lg, 92px)'} />
        {a.isCurse && <span className="card__curse-mark">呪</span>}
      </div>
      <div className="card__type">
        {CARD_TYPE_LABEL[a.cardType]}・{RARITY_LABEL[card.rarity]}
        {a.isCurse && `・${CURSE_LABEL}`}
        {card.tribe && TRIBE_LABEL[card.tribe] && `・${TRIBE_LABEL[card.tribe]}`}
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
          // モード選択（MTG 要素 ○ バッチC2）の「A：…」の行は字下げ
          <p key={i} className={/^[ABC]：/.test(t) ? 'card__mode' : undefined}>
            {t}
          </p>
        ))}
        {a.text.abilities.length > 0 && (
          <div className="card__keywords card__abilities">
            {a.text.abilities.map((x, i) => (
              <span key={`a${i}`} className="kw kw--ability" title={x.text}>
                ✦{x.name}
              </span>
            ))}
          </div>
        )}
        {a.text.drawbacks.map((t, i) => (
          <p key={`d${i}`} className="card__drawback">
            {t}
          </p>
        ))}
        {card.description && <p className="card__desc">{card.description}</p>}
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
