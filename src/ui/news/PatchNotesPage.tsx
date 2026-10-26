/**
 * 更新情報（パッチノート。決定事項 #131。#/news）：何が変わったかを新しい順に。開いたら「ここまで見た」にする（帯が消える）。
 */
import { useEffect, useState } from 'react';
import { UiIcon, type UiIconProps } from '../components/UiIcon.tsx';
import { cx } from '../util.ts';
import { itemsByKind, latestNo, NOTE_KIND_GI, NOTE_KIND_LABEL, noteDate } from './newsLogic.ts';
import { markNewsSeen, useNewsSeen } from './newsStore.ts';
import { PATCH_NOTES } from './notes.ts';
import './news.css';

export function PatchNotesPage() {
  const seen = useNewsSeen();
  // 開いたときの「見た番号」より新しいものに「新着」の札を付けたまま、印だけ進める
  const [shownSeen] = useState(seen);
  useEffect(() => markNewsSeen(latestNo(PATCH_NOTES)), []);
  const year = new Date().getFullYear();
  return (
    <div className="news">
      <div className="page-head">
        <h1>更新情報</h1>
      </div>
      <p className="hint news__lead">
        ゲームの変更（新機能・バランス調整・不具合の修正）をお知らせします。気になることは、対戦の結果やデッキ・カードの画面の「報告・要望」から送ってください。
      </p>
      <ol className="news__list">
        {PATCH_NOTES.map((n) => (
          <li key={n.no} className="panel news__note">
            <header className="news__head">
              <time className="news__date" dateTime={n.date}>
                {noteDate(n.date, year)}
              </time>
              {n.no > shownSeen && <span className="news__fresh">新着</span>}
              <h2 className="news__title">{n.title}</h2>
            </header>
            {itemsByKind(n).map((g) => (
              <section key={g.kind} className={cx('news__group', `news__group--${g.kind}`)} aria-label={NOTE_KIND_LABEL[g.kind]}>
                <h3 className="news__kind">
                  <UiIcon name={NOTE_KIND_GI[g.kind] as UiIconProps['name']} />
                  {NOTE_KIND_LABEL[g.kind]}
                </h3>
                <ul className="news__items">
                  {g.items.map((it, i) => (
                    <li key={i}>
                      {it.text}
                      {it.before !== undefined && it.after !== undefined && (
                        <span className="news__change">
                          <span className="news__before">{it.before}</span>
                          <span aria-label="から">→</span>
                          <span className="news__after">{it.after}</span>
                        </span>
                      )}
                      {it.reports && it.reports.length > 0 && <span className="news__reports">報告 {it.reports.map((r) => `#${r}`).join('・')} への対応</span>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </li>
        ))}
      </ol>
    </div>
  );
}

