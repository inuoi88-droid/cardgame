/** 対戦に使うデッキを選ぶ一覧 */
import { cx } from '../util.ts';
import type { DeckChoice } from './deckChoices.ts';

export function DeckPicker({ choices, selected, onSelect }: { choices: DeckChoice[]; selected: DeckChoice | undefined; onSelect: (key: string) => void }) {
  return (
    <div className="choice-list">
      {choices.map((c) => (
        <label key={c.key} className={cx('choice', !c.valid && 'is-disabled', selected?.key === c.key && 'is-active')}>
          <input type="radio" name="my-deck" disabled={!c.valid} checked={selected?.key === c.key} onChange={() => onSelect(c.key)} />
          <span>
            <b>{c.label}</b>
            <small className={c.valid ? '' : 'text-ng'}>{c.note}</small>
          </span>
        </label>
      ))}
    </div>
  );
}
