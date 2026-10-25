/**
 * デッキ一覧の「対戦した相手のデッキ」（決定事項 #122）：決着した対戦の相手のデッキを新しい順に並べ、押すと DeckCopySheet で見てコピーできる。
 * 記録は history.ts（localStorage の cardgame.v1.opponents。最大 20 件）。
 */
import { useState } from 'react';
import { UiIcon, type UiIconName } from '../components/UiIcon.tsx';
import { cx } from '../util.ts';
import { DeckCopySheet } from './DeckCopySheet.tsx';
import { RESULT_LABEL, SOURCE_LABEL, useOpponentHistory, type OpponentEntry, type OpponentSource } from './history.ts';
import './copy.css';

const SOURCE_GI: Record<OpponentSource, UiIconName> = {
  cpu: 'robot-golem',
  online: 'closed-barbute',
  draft: 'card-pick',
  friend: 'closed-barbute',
};

/** 「10/25 14:05」 */
export function shortDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function OpponentHistory() {
  const list = useOpponentHistory();
  const [open, setOpen] = useState<OpponentEntry | null>(null);
  return (
    <section className="opp-hist" aria-labelledby="opp-hist-title">
      <div className="opp-hist__head">
        <h2 id="opp-hist-title">
          対戦した相手のデッキ <small>{list.length > 0 ? `最近の${list.length}戦` : ''}</small>
        </h2>
      </div>
      {list.length === 0 ? (
        <p className="hint">CPU 戦やオンライン対戦が終わると、相手のデッキがここに残ります。押すと中身を見て、デッキごと・一部のカードだけコピーできます。</p>
      ) : (
        <ul className="opp-hist__list">
          {list.map((e) => {
            const n = e.deck.entries.reduce((s, x) => s + x.count, 0);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  className="opp-hist__row"
                  onClick={() => setOpen(e)}
                  aria-label={`${e.opponentName}のデッキを見る（${SOURCE_LABEL[e.source]}・${e.result ? RESULT_LABEL[e.result] : '結果なし'}）`}
                >
                  <UiIcon name={SOURCE_GI[e.source]} className="opp-hist__gi" />
                  <span className="opp-hist__main">
                    <span className="opp-hist__name">{e.opponentName}</span>
                    <span className="opp-hist__meta">
                      {SOURCE_LABEL[e.source]}・{n}枚・{shortDate(e.at)}
                    </span>
                  </span>
                  {e.result && <span className={cx('opp-hist__res', `opp-hist__res--${e.result}`)}>{RESULT_LABEL[e.result]}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open && <DeckCopySheet title={`${open.opponentName}のデッキ`} sourceName={open.opponentName} deck={open.deck} cards={open.cards} onClose={() => setOpen(null)} />}
    </section>
  );
}
