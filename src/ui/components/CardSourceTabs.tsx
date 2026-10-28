/**
 * カードの画面の上のタブ：自分のカード（#/cards）・公式カード（#/official）・みんなの広場（#/plaza）を行き来する。
 * どれも上のメニューの「カード」の中の画面（App の section は 'cards'）。
 */
import { navigate } from '../router.ts';
import { cx } from '../util.ts';
import { UiIcon, type UiIconName } from './UiIcon.tsx';

export type CardSource = 'mine' | 'official' | 'plaza';

const TABS: { id: CardSource; label: string; icon: UiIconName; path: string }[] = [
  { id: 'mine', label: '自分のカード', icon: 'card-play', path: '/cards' },
  { id: 'official', label: '公式カード', icon: 'book-cover', path: '/official' },
  { id: 'plaza', label: 'みんなの広場', icon: 'village', path: '/plaza' },
];

export function CardSourceTabs({ current }: { current: CardSource }) {
  return (
    <div className="tabs card-source-tabs" role="tablist" aria-label="どのカードを見るか">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={current === t.id}
          className={cx('tab', current === t.id && 'is-active')}
          data-source={t.id}
          onClick={() => current !== t.id && navigate(t.path)}
        >
          <UiIcon name={t.icon} />
          <span className="card-source-tabs__label">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
