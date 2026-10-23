/**
 * 対戦に使うデッキを選ぶ（CPU 戦の準備・オンラインのロビーで共用）。UI2「黒鉄と金の卓」（決定事項 #112）：
 * フォームのラジオの行ではなく、デッキ箱のタイルを並べる（スマホは横に流す1列、PC は格子）。
 * - タイル：鉄の板。上に代表カードの絵（プリセットはデッキの紋）と枚数、銘板にデッキ名（人の入力なので --font-title）、
 *   レアリティの宝石の数、ミニのコスト分布（鉄の柱）、1行の注記
 * - 選ぶとサファイアの縁で 2px 浮く。使えないデッキは中身を暗くし、深紅の封蝋「要修正」を押して最後に並べる
 * - 中身は本物のラジオ（読み上げ・キーボードの矢印で選べる）
 */
import { useMemo } from 'react';
import { RARITIES, type Rarity } from '../../engine/index.ts';
import { CardArtOf } from '../components/CardArt.tsx';
import { RarityGem } from '../components/cardParts.tsx';
import { UiIcon } from '../components/UiIcon.tsx';
import { cx } from '../util.ts';
import type { DeckChoice } from './deckChoices.ts';
import { deckSummary } from './deckSummary.ts';
import { presetGi } from './portraits.ts';

const GEM_ORDER: Rarity[] = [...RARITIES].reverse();

function DeckTile({ c, selected, onSelect, name }: { c: DeckChoice; selected: boolean; onSelect: () => void; name: string }) {
  const s = useMemo(() => deckSummary(c.deck, c.cards), [c.deck, c.cards]);
  const preset = c.key.startsWith('preset:') ? c.key.slice('preset:'.length) : null;
  const max = Math.max(1, ...s.curve);
  const note = !c.valid ? c.note.replace(/^使えません：/, '') : preset ? 'プリセット' : `${s.total}枚`;
  return (
    <li>
      <label className={cx('dpick', selected && 'is-selected', !c.valid && 'is-ng')}>
        <input type="radio" className="sr" name={name} disabled={!c.valid} checked={selected} onChange={onSelect} />
        <span className="dpick__art" aria-hidden="true">
          {preset ? (
            <span className="dpick__crest">
              <UiIcon name={`gi:${presetGi(preset)}`} />
            </span>
          ) : s.best ? (
            <CardArtOf card={s.best} />
          ) : (
            <span className="dpick__crest">
              <UiIcon name="gi:chest" />
            </span>
          )}
          {!preset && <span className="dpick__count">{s.total}枚</span>}
        </span>
        <span className="dpick__name">{c.name || c.label}</span>
        {!preset && (
          <span className="dpick__meta" aria-hidden="true">
            <span className="dpick__gems">
              {GEM_ORDER.filter((r) => s.gems[r] > 0).map((r) => (
                <span key={r}>
                  <RarityGem rarity={r} />
                  {s.gems[r]}
                </span>
              ))}
            </span>
            <span className="dpick__curve">
              {s.curve.map((n, i) => (
                <i key={i} style={{ height: `${Math.max(2, Math.round((n / max) * 20))}px` }} />
              ))}
            </span>
          </span>
        )}
        <span className={cx('dpick__note', !c.valid && 'is-ng')}>{c.valid ? note : `要修正：${note}`}</span>
        {!c.valid && (
          <span className="dpick__seal" aria-hidden="true">
            要<br />
            修正
          </span>
        )}
      </label>
    </li>
  );
}

export function DeckPicker({ choices, selected, onSelect, name = 'my-deck' }: { choices: DeckChoice[]; selected: DeckChoice | undefined; onSelect: (key: string) => void; name?: string }) {
  // 使えるデッキが先、要修正は最後（同じ中では元の順）
  const ordered = useMemo(() => [...choices.filter((c) => c.valid), ...choices.filter((c) => !c.valid)], [choices]);
  return (
    <ul className="dpicks" role="radiogroup" aria-label="あなたのデッキ">
      {ordered.map((c) => (
        <DeckTile key={c.key} c={c} name={name} selected={selected?.key === c.key} onSelect={() => onSelect(c.key)} />
      ))}
    </ul>
  );
}
