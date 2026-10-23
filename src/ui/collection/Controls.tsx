/**
 * カード置き場の操作部品（決定事項 #109）：検索の欄、並べ替え・まとめ方・表示の密度、絞り込みのシート、掛かっている絞り込みの札。
 * カード一覧とデッキ構築の候補で共通に使う。
 */
import { useId, type ReactNode } from 'react';
import { CARD_TYPES, CARD_TYPE_LABEL, RARITIES, RARITY_LABEL, TRIBE_IDS, TRIBE_LABEL, type Deck } from '../../engine/index.ts';
import { RarityGem } from '../components/cardParts.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { cx } from '../util.ts';
import { COST_VALUES, EMPTY_FILTERS, SECTION_BYS, SECTION_LABEL, VIEW_LABEL, VIEW_MODES, filterChips, type Filters, type SectionBy, type SortKey, type ViewMode } from './query.ts';
import { ALL_TAGS, tagHint, tagLabel, type TagId } from './tags.ts';

// ---------------------------------------------------------------- 検索

export function SearchBox({ value, onChange, placeholder = '名前・効果・種族で探す' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="csearch">
      <span className="csearch__icon" aria-hidden="true">
        🔍
      </span>
      <input type="search" value={value} placeholder={placeholder} aria-label="カードを探す（ひらがな・カタカナどちらでも。-語 で除外）" onChange={(e) => onChange(e.target.value)} enterKeyHint="search" />
      {value !== '' && (
        <button type="button" className="csearch__clear" onClick={() => onChange('')} aria-label="検索をやめる">
          ✕
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 並べ替え・まとめ方・密度

const SORT_OPTIONS: { key: SortKey; desc: boolean; label: string }[] = [
  { key: 'added', desc: false, label: '追加順' },
  { key: 'newest', desc: false, label: '新しい順' },
  { key: 'name', desc: false, label: '名前（あ→ん）' },
  { key: 'name', desc: true, label: '名前（ん→あ）' },
  { key: 'cost', desc: false, label: 'コストが低い順' },
  { key: 'cost', desc: true, label: 'コストが高い順' },
  { key: 'rarity', desc: true, label: 'レアリティが高い順' },
  { key: 'rarity', desc: false, label: 'レアリティが低い順' },
  { key: 'type', desc: false, label: '種類' },
  { key: 'points', desc: true, label: 'ポイントが多い順' },
  { key: 'points', desc: false, label: 'ポイントが少ない順' },
];

export function SortSelect({ sort, desc, onChange, className }: { sort: SortKey; desc: boolean; onChange: (sort: SortKey, desc: boolean) => void; className?: string }) {
  const value = `${sort}:${desc ? 1 : 0}`;
  const known = SORT_OPTIONS.some((o) => `${o.key}:${o.desc ? 1 : 0}` === value);
  return (
    <select
      className={cx('csel', className)}
      value={known ? value : `${sort}:0`}
      aria-label="並べ替え"
      onChange={(e) => {
        const [k, d] = e.target.value.split(':');
        onChange(k as SortKey, d === '1');
      }}
    >
      {SORT_OPTIONS.map((o) => (
        <option key={`${o.key}:${o.desc}`} value={`${o.key}:${o.desc ? 1 : 0}`}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function SectionSelect({ value, onChange, hasGroups, className }: { value: SectionBy; onChange: (v: SectionBy) => void; hasGroups: boolean; className?: string }) {
  return (
    <select className={cx('csel', className)} value={value} aria-label="まとめ方" onChange={(e) => onChange(e.target.value as SectionBy)}>
      {SECTION_BYS.filter((s) => s !== 'group' || hasGroups || value === 'group').map((s) => (
        <option key={s} value={s}>
          {s === 'none' ? 'まとめない' : SECTION_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

const VIEW_ICON: Record<ViewMode, string> = { card: '▦', compact: '▩', list: '☰' };

export function ViewSeg({ value, onChange, labels = false }: { value: ViewMode; onChange: (v: ViewMode) => void; labels?: boolean }) {
  return (
    <div className="vseg" role="radiogroup" aria-label="表示">
      {VIEW_MODES.map((v) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={cx('vseg__btn', value === v && 'is-active')} onClick={() => onChange(v)} title={VIEW_LABEL[v]} aria-label={VIEW_LABEL[v]}>
          <span aria-hidden="true">{VIEW_ICON[v]}</span>
          {labels && <span className="vseg__label">{VIEW_LABEL[v]}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- 絞り込み

function toggle<T>(xs: readonly T[], x: T): T[] {
  return xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x];
}

function ChipSet({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="fset" aria-labelledby={id}>
      <h3 id={id}>{label}</h3>
      <div className="chips">{children}</div>
    </section>
  );
}

function Chip({ on, onClick, children, disabled, title }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean; title?: string }) {
  return (
    <button type="button" className={cx('chip', on && 'is-active')} aria-pressed={on} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

interface FilterSheetProps {
  filters: Filters;
  onChange: (f: Filters) => void;
  decks: readonly Deck[];
  /** タグ → 当てはまるカードの数（今のグループの中） */
  tagCounts: ReadonlyMap<TagId, number>;
  resultCount: number;
  onClose: () => void;
  /** デッキの絞り込みを出す（デッキ構築では出さない） */
  showDeck?: boolean;
  /** 見出しの右（並べ替えなどをシートの中に置くとき） */
  extra?: ReactNode;
}

export function FilterSheet({ filters: f, onChange, decks, tagCounts, resultCount, onClose, showDeck = true, extra }: FilterSheetProps) {
  const set = (patch: Partial<Filters>) => onChange({ ...f, ...patch });
  return (
    <Sheet open title="絞り込み" onClose={onClose} className="fsheet">
      {extra}
      <ChipSet label="種類">
        {CARD_TYPES.map((t) => (
          <Chip key={t} on={f.types.includes(t)} onClick={() => set({ types: toggle(f.types, t) })}>
            {CARD_TYPE_LABEL[t]}
          </Chip>
        ))}
      </ChipSet>
      <ChipSet label="レアリティ">
        {RARITIES.map((r) => (
          <Chip key={r} on={f.rarities.includes(r)} onClick={() => set({ rarities: toggle(f.rarities, r) })}>
            <RarityGem rarity={r} />
            {RARITY_LABEL[r]}
          </Chip>
        ))}
      </ChipSet>
      <ChipSet label="コスト">
        {COST_VALUES.map((c) => (
          <Chip key={c} on={f.costs.includes(c)} onClick={() => set({ costs: toggle(f.costs, c) })}>
            {c}
          </Chip>
        ))}
      </ChipSet>
      <ChipSet label="種族">
        {TRIBE_IDS.map((t) => (
          <Chip key={t} on={f.tribes.includes(t)} onClick={() => set({ tribes: toggle(f.tribes, t) })}>
            {TRIBE_LABEL[t]}
          </Chip>
        ))}
        <Chip on={f.tribes.includes('none')} onClick={() => set({ tribes: toggle(f.tribes, 'none') })}>
          種族なし
        </Chip>
      </ChipSet>
      <ChipSet label="呪い・状態">
        <Chip on={f.curse === 'only'} onClick={() => set({ curse: f.curse === 'only' ? 'any' : 'only' })}>
          呪いだけ
        </Chip>
        <Chip on={f.curse === 'exclude'} onClick={() => set({ curse: f.curse === 'exclude' ? 'any' : 'exclude' })}>
          呪いを除く
        </Chip>
        <Chip on={f.invalidOnly} onClick={() => set({ invalidOnly: !f.invalidOnly })}>
          要修正だけ
        </Chip>
      </ChipSet>
      {showDeck && (
        <section className="fset">
          <h3>デッキ</h3>
          <select className="csel" value={f.deck} aria-label="デッキで絞り込み" onChange={(e) => set({ deck: e.target.value })}>
            <option value="any">問わない</option>
            <option value="unused">どのデッキでも使っていない</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                「{d.name || '（名前なし）'}」に入っている
              </option>
            ))}
          </select>
        </section>
      )}
      <ChipSet label="仕組み（すべて含む）">
        {ALL_TAGS.map((t) => {
          const n = tagCounts.get(t) ?? 0;
          const on = f.tags.includes(t);
          if (n === 0 && !on) return null;
          return (
            <Chip key={t} on={on} onClick={() => set({ tags: toggle(f.tags, t) })} title={tagHint(t)}>
              #{tagLabel(t)} <small className="chip__n">{n}</small>
            </Chip>
          );
        })}
      </ChipSet>
      <div className="fsheet__foot">
        <span className="fsheet__count" aria-live="polite">
          <b>{resultCount}</b>枚が当てはまります
        </span>
        <button type="button" className="btn btn--secondary" onClick={() => onChange(EMPTY_FILTERS)}>
          すべて解除
        </button>
        <button type="button" className="btn btn--primary" onClick={onClose}>
          見る
        </button>
      </div>
    </Sheet>
  );
}

/** 掛かっている絞り込みの札（✕で外す）と「すべて解除」 */
export function FilterChipsRow({ filters, decks, onChange, children }: { filters: Filters; decks: readonly Deck[]; onChange: (f: Filters) => void; children?: ReactNode }) {
  const chips = filterChips(filters, decks);
  if (chips.length === 0 && !children) return null;
  return (
    <div className="fchips">
      {children}
      {chips.map((c) => (
        <button key={c.key} type="button" className="fchip" onClick={() => onChange(c.without)} aria-label={`${c.label}の絞り込みを外す`}>
          {c.label}
          <span aria-hidden="true">✕</span>
        </button>
      ))}
      {chips.length > 1 && (
        <button type="button" className="btn btn--ghost btn--small" onClick={() => onChange(EMPTY_FILTERS)}>
          すべて解除
        </button>
      )}
    </div>
  );
}
