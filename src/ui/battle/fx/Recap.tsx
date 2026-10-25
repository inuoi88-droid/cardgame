/**
 * 「相手のターンのまとめ」の表示（決定事項 #126）。
 * - 自分のターンが始まって相手の演出が終わったら、自分の場の上の端に1行の帯（形と短い文字）を出し、約4.5秒で畳む
 * - 畳んだあとは見出しの「まとめ」（RecapButton）から開ける。ログからも開ける（RecapLogButton）
 * - 開いた一覧は1行1項目。カード名を押すと詳細。どこかを押すと閉じる
 */
import { useCallback, useEffect, useState } from 'react';
import { UiIcon } from '../../components/UiIcon.tsx';
import { cx } from '../../util.ts';
import { playCue } from './cues.ts';
import type { Recap } from './recap.ts';

/** 帯を出しておく時間 */
export const RECAP_AUTO_MS = 4500;

export function RecapStrip({ recap, onOpen, onClose }: { recap: Recap; onOpen: () => void; onClose: () => void }) {
  useEffect(() => {
    playCue('recap', { mine: false });
    const t = setTimeout(onClose, RECAP_AUTO_MS);
    return () => clearTimeout(t);
  }, [recap.turn, onClose]);
  return (
    <div
      className="recap-strip"
      role="button"
      tabIndex={0}
      aria-label={`相手のターンのまとめ：${recap.chips.map((i) => i.text).join('、')}（押すと一覧）`}
      onClick={(e) => (e.stopPropagation(), onOpen())}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
    >
      <span className="recap-strip__title">相手のターン</span>
      <span className="recap-strip__chips">
        {recap.chips.map((i, n) => (
          <span key={n} className={cx('recap-chip', `recap-chip--${i.tone}`)}>
            <UiIcon name={`gi:${i.gi}`} />
            {i.short}
          </span>
        ))}
      </span>
      <button type="button" className="recap-strip__close" aria-label="まとめを閉じる" onClick={(e) => (e.stopPropagation(), onClose())}>
        ×
      </button>
    </div>
  );
}

export function RecapPanel({ recap, onClose, onCard }: { recap: Recap; onClose: () => void; onCard?: (cardId: string) => void }) {
  // 外を押したら閉じる
  useEffect(() => {
    const on = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.recap-panel')) onClose();
    };
    const t = setTimeout(() => window.addEventListener('pointerdown', on), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', on);
    };
  }, [onClose]);
  return (
    <div className="recap-panel" role="dialog" aria-label="相手のターンのまとめ">
      <div className="recap-panel__head">
        <span>相手のターンのまとめ{recap.turnNo ? `（${recap.turnNo}ターン目）` : ''}</span>
        <button type="button" className="btn btn--small btn--ghost" onClick={onClose}>
          閉じる
        </button>
      </div>
      {recap.items.map((i, n) => (
        <div key={n} className={cx('recap-row', `recap-row--${i.tone}`)}>
          <UiIcon name={`gi:${i.gi}`} />
          {i.cardId && onCard ? (
            <span>
              <button type="button" className="recap-row__card" onClick={() => onCard(i.cardId!)}>
                「{i.short}」
              </button>
              を使った
            </span>
          ) : (
            <span>{i.text}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** 見出しの「まとめ」のボタン（畳んだあとも開ける。スマホは形だけ） */
export function RecapButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="btn btn--small btn--ghost battle__recapbtn" onClick={onOpen} aria-label="相手のターンのまとめ">
      <UiIcon name="gi:tied-scroll" />
      <span className="battle__logtext">まとめ</span>
    </button>
  );
}

/** ログの上の「相手のターンのまとめ」 */
export function RecapLogButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="btn btn--small recap-logbtn" onClick={onOpen}>
      <UiIcon name="gi:tied-scroll" />
      相手のターンのまとめ
    </button>
  );
}

/** まとめの表示の状態：auto（帯）・open（一覧）・closed */
export function useRecapState(recapTurn: number | null, ready: boolean): { mode: 'auto' | 'open' | 'closed'; open: () => void; close: () => void } {
  const [mode, setMode] = useState<'auto' | 'open' | 'closed'>('closed');
  const [shownFor, setShownFor] = useState<number | null>(null);
  useEffect(() => {
    if (!ready || recapTurn === null || recapTurn === shownFor) return;
    setShownFor(recapTurn);
    setMode('auto');
  }, [ready, recapTurn, shownFor]);
  const open = useCallback(() => setMode('open'), []);
  const close = useCallback(() => setMode('closed'), []);
  return { mode, open, close };
}
