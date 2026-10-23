/**
 * 対戦に使うデッキを選ぶ（CPU 戦の準備・オンラインのロビーで共用）。UI2「黒鉄と金の卓」（決定事項 #112・#113）：
 * フォームのラジオの行ではなく、デッキ一覧と同じデッキ箱のタイル（components/DeckBox.tsx の `DeckBoxFace`・`.dbox`）を並べる
 * （スマホは横に流す1列、PC は格子）。
 * - プリセットは代表カードの代わりにデッキの紋、中身（宝石の数・コスト分布）は出さない
 * - 選ぶとサファイアの縁で 2px 浮く。使えないデッキは中身を暗くし、深紅の封蝋「要修正」を押して最後に並べる
 * - 中身は本物のラジオ（読み上げ・キーボードの矢印で選べる）
 */
import { useMemo } from 'react';
import { DeckBoxFace } from '../components/DeckBox.tsx';
import { cx } from '../util.ts';
import type { DeckChoice } from './deckChoices.ts';
import { deckSummary } from './deckSummary.ts';
import { presetGi } from './portraits.ts';

function DeckTile({ c, selected, onSelect, name }: { c: DeckChoice; selected: boolean; onSelect: () => void; name: string }) {
  const s = useMemo(() => deckSummary(c.deck, c.cards), [c.deck, c.cards]);
  const preset = c.key.startsWith('preset:') ? c.key.slice('preset:'.length) : null;
  const note = !c.valid ? `要修正：${c.note.replace(/^使えません：/, '')}` : preset ? 'プリセット' : `${s.total}枚`;
  return (
    <li>
      <label className={cx('dbox', 'dpick', selected && 'is-selected', !c.valid && 'is-ng')}>
        <input type="radio" className="sr" name={name} disabled={!c.valid} checked={selected} onChange={onSelect} />
        <DeckBoxFace
          s={s}
          name={c.name || c.label}
          {...(preset ? { crest: presetGi(preset), meta: false } : { count: s.total })}
          note={note}
          ng={!c.valid}
        />
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
