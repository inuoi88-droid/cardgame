/**
 * 効果・デメリット・キーワードを選んで追加するピッカー（スマホはボトムシート、PC は右のパネル）。
 * 検索、グループ、1行の説明、基礎ポイント、「残りの予算に入るか」、レアリティ不足の理由を見せる。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EFFECT_GROUPS,
  RARITY_LABEL,
  availableDrawbacks,
  drawbackFitsBase,
  getDrawback,
  availableEffects,
  cardBase,
  createDrawback,
  createEffect,
  drawbackPoints,
  effectPoints,
  listDrawbacks,
  listEffects,
  listKeywords,
  type CardDef,
  type DrawbackDef,
  type EffectGroup,
} from '../../engine/index.ts';
import { Sheet } from '../components/Sheet.tsx';
import { cx } from '../util.ts';

export type PickerMode = 'effect' | 'drawback' | 'keyword';

export const GROUP_ICON: Record<EffectGroup, string> = {
  damage: '💥',
  defense: '🛡️',
  status: '☠️',
  buff: '💪',
  resource: '🃏',
  disrupt: '🌀',
  special: '✨',
};

interface Item {
  id: string;
  icon: string;
  name: string;
  summary: string;
  group?: EffectGroup;
  /** 既定の値で追加したときのポイント（デメリットは正の数で持つ） */
  points: number;
  /** 選べない理由（あれば灰色） */
  locked?: string;
  /** キーワードの場合、すでに付いているか */
  active?: boolean;
}

interface Props {
  mode: PickerMode;
  card: CardDef;
  /** 残りの予算（「入るか」の判定に使う） */
  remaining: number;
  onPick: (id: string) => void;
  onClose: () => void;
}

/** 同時に付けられないデメリット（防衛と裏切りなど）がカードにあれば、その名前 */
function conflictName(d: DrawbackDef, card: CardDef): string | undefined {
  const x = card.drawbacks.find((c) => d.conflicts?.includes(c.id) || getDrawback(c.id)?.conflicts?.includes(d.id));
  return x ? (getDrawback(x.id)?.name ?? x.id) : undefined;
}

const TITLE: Record<PickerMode, string> = { effect: '効果を追加', drawback: 'デメリットを追加', keyword: 'キーワード' };

export function EffectPicker({ mode, card, remaining, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<EffectGroup | 'all'>('all');
  const searchRef = useRef<HTMLInputElement>(null);
  const base = cardBase(card);

  useEffect(() => {
    // シートのフォーカストラップは最初の要素（検索欄）にフォーカスするが、念のため
    const t = setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 50);
    return () => clearTimeout(t);
  }, []);

  const items = useMemo<Item[]>(() => {
    if (mode === 'effect') {
      const ok = new Set(availableEffects(card.rarity).map((d) => d.id));
      return listEffects().map((d) => ({
        id: d.id,
        icon: GROUP_ICON[d.group],
        name: d.name,
        summary: d.summary,
        group: d.group,
        points: effectPoints(createEffect(d.id, base), card).value,
        locked: ok.has(d.id) ? undefined : d.minRarity === 'legend' ? 'レジェンドのみ' : `${RARITY_LABEL[d.minRarity ?? 'common']}以上`,
      }));
    }
    if (mode === 'drawback') {
      const ok = new Set(availableDrawbacks(card).map((d) => d.id));
      const used = new Set(card.drawbacks.map((d) => d.id));
      return listDrawbacks().map((d) => ({
        id: d.id,
        icon: '☠',
        name: d.name,
        summary: d.summary,
        points: drawbackPoints(createDrawback(d.id, base), card).value,
        locked: ok.has(d.id)
          ? undefined
          : used.has(d.id)
            ? '追加済み（同じデメリットは1回まで）'
            : d.monsterOnly && base !== 'monster'
              ? 'モンスター専用'
              : !drawbackFitsBase(d, base)
                ? 'このカードの種類には付けられません'
                : conflictName(d, card)
                  ? `「${conflictName(d, card)}」と同時には付けられません`
                  : '選べません',
      }));
    }
    const stats = card.stats ?? { attack: 0, hp: 0, defense: 0 };
    return listKeywords().map((d) => {
      const inst = card.keywords.find((k) => k.id === d.id) ?? (d.value ? { id: d.id, value: d.value.default } : { id: d.id });
      return { id: d.id, icon: '◆', name: d.name, summary: d.summary, points: d.points(inst, stats), active: card.keywords.some((k) => k.id === d.id) };
    });
  }, [mode, card, base]);

  const q = query.trim().toLowerCase();
  const shown = items.filter((it) => (group === 'all' || it.group === group) && (q === '' || it.name.toLowerCase().includes(q) || it.summary.toLowerCase().includes(q)));

  const sign = mode === 'drawback' ? '−' : '+';
  const fitLabel = (it: Item) => {
    if (mode === 'drawback') return `予算が最大 ${it.points}pt ぶん戻る`;
    if (it.active) return '付いています';
    return it.points <= remaining ? '予算内' : `あと ${it.points - remaining}pt 足りない`;
  };

  return (
    <Sheet open title={TITLE[mode]} onClose={onClose} desktop="side">
      <div className="pk">
        <label className="pk__search">
          <span className="sr-only">検索</span>
          <input ref={searchRef} type="search" placeholder="名前や説明で探す" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        </label>
        {mode === 'effect' && (
          <div className="pk__groups" role="group" aria-label="グループ">
            <button type="button" className={cx('chip', group === 'all' && 'is-active')} aria-pressed={group === 'all'} onClick={() => setGroup('all')}>
              すべて
            </button>
            {EFFECT_GROUPS.map((g) => (
              <button key={g.id} type="button" className={cx('chip', group === g.id && 'is-active')} aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>
                {GROUP_ICON[g.id]} {g.label}
              </button>
            ))}
          </div>
        )}
        <p className="pk__hint">
          {mode === 'effect' && `残りの予算 ${remaining}pt。ポイントは既定の値・使用時・対象1体のときの目安です`}
          {mode === 'drawback' && 'デメリットを付けると呪いカードになります。相殺できるのは上限ぶんまで'}
          {mode === 'keyword' && 'モンスター専用。タップで付け外し。ポイントは今の攻撃力から計算'}
        </p>
        {shown.length === 0 ? (
          <p className="pk__empty">「{query}」に合うものはありません</p>
        ) : (
          <ul className="pk__list">
            {shown.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  className={cx('pk-row', it.locked && 'is-locked', it.active && 'is-active')}
                  aria-disabled={it.locked ? true : undefined}
                  aria-pressed={mode === 'keyword' ? it.active : undefined}
                  onClick={() => {
                    if (it.locked) return;
                    onPick(it.id);
                    if (mode !== 'keyword') onClose();
                  }}
                >
                  <span className="pk-row__icon" aria-hidden="true">
                    {it.icon}
                  </span>
                  <span className="pk-row__main">
                    <span className="pk-row__name">
                      {it.name}
                      {it.active && <span className="badge badge--ok badge--sm">付いている</span>}
                    </span>
                    <span className="pk-row__sum">{it.summary}</span>
                    {it.locked && <span className="pk-row__reason">🔒 {it.locked}</span>}
                  </span>
                  <span className={cx('pk-row__pts', mode !== 'drawback' && !it.active && (it.points <= remaining ? 'is-fit' : 'is-tight'))}>
                    <b>
                      {sign}
                      {it.points}pt
                    </b>
                    {!it.locked && <small>{fitLabel(it)}</small>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
