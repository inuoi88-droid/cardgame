/** 対戦の結果ダイアログと、決着後の操作バーに置く「相手のデッキ」（押すと DeckCopySheet。決定事項 #122） */
import { UiIcon } from '../components/UiIcon.tsx';

export function OppDeckButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="btn opp-deck-btn" onClick={onClick} disabled={disabled} title="相手のデッキを見て、カードやデッキをコピーできます">
      <UiIcon name="chest" />
      <span className="btn__label">相手のデッキ</span>
    </button>
  );
}
