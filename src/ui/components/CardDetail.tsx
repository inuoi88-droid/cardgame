/**
 * カードの詳細（一覧・デッキ構築でカードを押したときに出す）。PC は中央のモーダル、スマホは下からのシート。
 * 等倍のカード・ポイントの内訳・要修正の理由と、呼び出し側が渡す操作（編集・複製・デッキに追加など）を並べる。
 *
 *   <CardDetail card={c} onClose={…} actions={<button …>編集</button>} status="デッキに 2枚" />
 */
import { useMemo, type ReactNode } from 'react';
import { CARD_TYPE_LABEL, CURSE_LABEL, RARITY_LABEL, analyzeCard, formatPoints, type CardAnalysis, type CardDef } from '../../engine/index.ts';
import { cx } from '../util.ts';
import { CardView } from './CardView.tsx';
import { Sheet } from './Sheet.tsx';
import './cards.css';

interface Props {
  card: CardDef;
  analysis?: CardAnalysis;
  onClose: () => void;
  /** 下に並べる操作ボタン */
  actions?: ReactNode;
  /** 操作の上に出す補足（デッキに入っている枚数・入れられない理由など） */
  status?: ReactNode;
}

export function CardDetail({ card, analysis, onClose, actions, status }: Props) {
  const a = useMemo(() => analysis ?? analyzeCard(card), [analysis, card]);
  const p = a.points;
  const over = p.total > p.cap;
  const pct = p.cap > 0 ? Math.max(0, Math.min(100, (p.total / p.cap) * 100)) : 0;
  return (
    <Sheet open title={card.name.trim() || '（名前なし）'} onClose={onClose} desktop="modal">
      <div className="cd">
        <div className="cd__card">
          <CardView card={card} analysis={a} />
        </div>
        <div className="cd__info">
          <div className="cd__badges">
            <span className="badge">{CARD_TYPE_LABEL[a.cardType]}</span>
            <span className={cx('badge', `badge--${card.rarity}`)}>{RARITY_LABEL[card.rarity]}</span>
            {a.isCurse && <span className="badge badge--curse">{CURSE_LABEL}</span>}
            <span className="badge">コスト {card.cost}</span>
            {a.valid ? <span className="badge badge--ok">使用できます</span> : <span className="badge badge--ng">要修正</span>}
          </div>

          {!a.valid && (
            <div className="cd__ng" role="note">
              <b>要修正 {a.violations.length}件</b>
              <ul>
                {a.violations.map((v, i) => (
                  <li key={i}>{v.message}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="cd__points" aria-label="ポイント">
            <div className="cd__points-head">
              <span>ポイント</span>
              <b className={cx(over && 'text-ng')}>
                {formatPoints(p.total)} / {p.cap}pt
              </b>
            </div>
            <div className={cx('cd__bar', over && 'is-over')} aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </div>
            <details className="cd__lines">
              <summary>内訳を見る（{p.lines.length}行）</summary>
              <ul>
                {p.lines.map((l, i) => (
                  <li key={i} className={cx(`is-${l.kind}`)}>
                    <span className="cd__line-label">
                      {l.label}
                      {l.formula && l.formula !== String(l.value) && <small>{l.formula}</small>}
                    </span>
                    <b>{l.value > 0 ? `+${l.value}` : formatPoints(l.value)}</b>
                  </li>
                ))}
              </ul>
            </details>
          </section>

          {status && <div className="cd__status">{status}</div>}
          {actions && <div className="cd__actions btn-row">{actions}</div>}
        </div>
      </div>
    </Sheet>
  );
}
