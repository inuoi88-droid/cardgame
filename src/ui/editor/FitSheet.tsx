/**
 * 「あと N pt で入れられるもの」のシート（決定事項 #140）。保存バーの「あと N pt」から開く。
 * 足しても予算に収まるステータス・キーワード・効果・カードの能力を、入れられる最大の数値と一緒に並べる（計算は fits.ts）。
 * 押すとその最大の数値で足す（あとで数値は下げられる）。
 */
import { useDeferredValue, useMemo, useState } from 'react';
import { EFFECT_GROUPS, type CardDef, type EffectGroup } from '../../engine/index.ts';
import { Sheet } from '../components/Sheet.tsx';
import { UiIcon } from '../components/UiIcon.tsx';
import { cx } from '../util.ts';
import { EffectIcon } from './EffectIcon.tsx';
import { GROUP_GI } from './effectIcons.ts';
import { fitsWithin, fitValueText, type FitItem } from './fits.ts';

interface Props {
  card: CardDef;
  onPick: (it: FitItem) => void;
  onClose: () => void;
}

const STAT_MARK: Record<string, string> = { attack: '攻', hp: '体', defense: '守' };

export function FitSheet({ card, onPick, onClose }: Props) {
  // 入力のたびに計算し直さない（シートを開いている間はカードが変わったときだけ）
  const shownCard = useDeferredValue(card);
  const list = useMemo(() => fitsWithin(shownCard), [shownCard]);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<EffectGroup | 'all'>('all');
  const q = query.trim().toLowerCase();
  const match = (it: FitItem) => q === '' || it.name.toLowerCase().includes(q) || it.summary.toLowerCase().includes(q);
  const effects = list.effects.filter((it) => (group === 'all' || it.group === group) && match(it));
  const groupsShown = EFFECT_GROUPS.filter((g) => list.effects.some((e) => e.group === g.id));
  const sections: { title: string; items: FitItem[]; note?: string }[] = [
    { title: 'ステータス', items: list.stats.filter(match) },
    { title: 'キーワード', items: list.keywords.filter(match) },
    { title: '効果', items: effects, ...(list.effectsFull ? { note: list.effectsFull } : {}) },
    { title: 'カードの能力', items: list.abilities.filter(match), ...(list.abilitiesFull ? { note: list.abilitiesFull } : {}) },
  ];
  const total = list.stats.length + list.keywords.length + list.effects.length + list.abilities.length;

  return (
    <Sheet open title={list.remaining < 0 ? `予算を ${-list.remaining}pt 超えています` : `あと ${list.remaining}pt で入れられるもの`} onClose={onClose} desktop="side">
      <div className="pk fit">
        {list.remaining < 0 ? (
          <p className="pk__empty">予算を超えているので、まず数値を下げるか、コストを上げてください。</p>
        ) : total === 0 ? (
          <p className="pk__empty">残りのポイントで入れられるものはありません。コストを上げると予算が増えます。</p>
        ) : (
          <>
            <label className="pk__search">
              <span className="sr-only">検索</span>
              <input type="search" placeholder="名前や説明で探す" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
            </label>
            <p className="pk__hint">押すと、入れられる最大の数値で足します（あとで数値を下げられます）。効果は使用時・既定の対象で計算しています。</p>
            {groupsShown.length > 1 && (
              <div className="pk__groups" role="group" aria-label="効果の見出し">
                <button type="button" className={cx('chip', group === 'all' && 'is-active')} aria-pressed={group === 'all'} onClick={() => setGroup('all')}>
                  すべて
                </button>
                {groupsShown.map((g) => (
                  <button key={g.id} type="button" className={cx('chip', group === g.id && 'is-active')} aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>
                    <UiIcon name={`gi:${GROUP_GI[g.id]}`} />
                    {g.label}
                  </button>
                ))}
              </div>
            )}
            {sections.map((s) =>
              s.items.length === 0 && !s.note ? null : (
                <section key={s.title} className="fit__sec">
                  <h3 className="fit__title">
                    {s.title}
                    {s.items.length > 0 && <span className="fit__count">{s.items.length}</span>}
                  </h3>
                  {s.note && <p className="pk__hint">{s.note}</p>}
                  {s.items.length > 0 && (
                    <ul className="pk__list">
                      {s.items.map((it) => {
                        const value = fitValueText(it);
                        return (
                          <li key={`${it.kind}-${it.id}`}>
                            <button
                              type="button"
                              className="pk-row"
                              onClick={() => {
                                onPick(it);
                                onClose();
                              }}
                            >
                              {it.kind === 'stat' ? (
                                <span className="ed-sigil ed-sigil--stat pk-row__icon" aria-hidden="true">
                                  {STAT_MARK[it.id]}
                                </span>
                              ) : (
                                <EffectIcon kind={it.kind} id={it.id} group={it.group} className="pk-row__icon" />
                              )}
                              <span className="pk-row__main">
                                <span className="pk-row__name">
                                  {it.name}
                                  {value && <span className="fit__value">{value}</span>}
                                </span>
                                <span className="pk-row__sum">{it.summary}</span>
                              </span>
                              <span className={cx('pk-row__pts', 'is-fit')}>
                                <b>+{it.points}pt</b>
                                <small>残り {it.left}pt</small>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              ),
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
