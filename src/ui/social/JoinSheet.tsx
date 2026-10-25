/**
 * 部屋に入る前の確かめ（募集中の部屋・届いた招待で共用。決定事項 #123）。
 * 自分のデッキの部屋は使うデッキを選ぶ（前に選んだデッキが最初から選ばれている）。ドラフトの部屋はデッキが要らない。
 * 下に金の「入る」1つ。
 */
import { useState, type ReactNode } from 'react';
import { DeckPicker } from '../battle/DeckPicker.tsx';
import { pickChoice, useDeckChoices, type DeckChoice } from '../battle/deckChoices.ts';
import { Sheet } from '../components/Sheet.tsx';
import type { RoomMode } from '../../online/protocol.ts';
import { loadOnlineDeckKey, saveOnlineDeckKey } from './enterRoom.ts';

export function JoinSheet({
  title,
  info,
  mode,
  okLabel = '入る',
  onJoin,
  onClose,
}: {
  title: string;
  info: ReactNode;
  mode: RoomMode;
  okLabel?: string;
  /** 入る（エラーの言葉か null を返す） */
  onJoin: (deck: DeckChoice | null) => Promise<string | null>;
  onClose: () => void;
}) {
  const choices = useDeckChoices();
  const [deckKey, setDeckKey] = useState(() => loadOnlineDeckKey());
  const selected = pickChoice(choices, deckKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = mode === 'draft';
  const go = async () => {
    if (busy || (!draft && !selected)) return;
    setBusy(true);
    setError(null);
    if (selected && !draft) saveOnlineDeckKey(selected.key);
    const e = await onJoin(draft ? null : (selected ?? null));
    setBusy(false);
    if (e) setError(e);
  };
  return (
    <Sheet open title={title} onClose={onClose} desktop="modal" className="join-sheet">
      <div className="join-sheet__info">{info}</div>
      {draft ? (
        <p className="hint">ドラフトの部屋です。公式カードの場から交互に取ってデッキを作るので、自分のデッキは要りません。</p>
      ) : (
        <>
          <h3 className="join-sheet__h">使うデッキ</h3>
          <DeckPicker choices={choices} selected={selected} onSelect={setDeckKey} name="join-deck" />
        </>
      )}
      {error && (
        <p className="notice notice--ng" role="alert">
          {error}
        </p>
      )}
      <div className="modal__foot join-sheet__foot">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          やめる
        </button>
        <button type="button" className="btn btn--primary btn--big" disabled={busy || (!draft && !selected)} onClick={() => void go()}>
          {busy ? '入っています…' : okLabel}
        </button>
      </div>
    </Sheet>
  );
}
