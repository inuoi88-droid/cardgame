/**
 * 届いた対戦の招待の知らせ（決定事項 #123・#124）。
 * - InviteBanner：ふつうの画面では、画面の見出しの上に流れの中で出す（上に重ねて画面の中身を隠さない）。
 *   「あとで」で閉じた招待は、このタブを閉じるまで出さない（sessionStorage）。読み上げは控えめ（role=status）
 * - InviteChip：対戦・ドラフトの画面（CPU 戦）では盤面を隠さず、見出しの札「招待 N」だけを出す。押すと一覧（参加・断る）
 * オンラインの画面（ロビー・部屋・招待リンク）では出さない（ロビーのフレンドのタブに出る）
 */
import { useEffect, useState } from 'react';
import type { InviteView } from '../../online/social/protocol.ts';
import { Sheet } from '../components/Sheet.tsx';
import { UiIcon } from '../components/UiIcon.tsx';
import { distinctNames, leftText } from './socialLogic.ts';
import { serverNowOf, useSocial, type SocialState } from './socialStore.ts';
import { MODE_LABEL, useInviteAnswer } from './useInviteAnswer.tsx';

const HIDDEN_KEY = 'cardgame.v1.hiddenInvites';

function loadHidden(): Set<string> {
  try {
    const raw = sessionStorage.getItem(HIDDEN_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveHidden(ids: Set<string>): void {
  try {
    sessionStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids].slice(-50)));
  } catch {
    // 保存できなくても、開いている間は閉じたまま
  }
}

/** 残り時間の表示を5秒ごとに描き直す */
function useTick(on: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setTick((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, [on]);
}

function leftOf(inv: InviteView, social: Pick<SocialState, 'snap' | 'snapAt'>): string {
  const left = inv.expiresAt - serverNowOf(social);
  return left > 0 ? leftText(left) : 'まもなく期限切れ';
}

/** ふつうの画面の上（流れの中）に出す招待の知らせ（いちばん新しい1件。ほかにもあれば件数） */
export function InviteBanner() {
  const social = useSocial();
  const { snap, identity, status } = social;
  const { accept, decline, busy, sheet } = useInviteAnswer();
  const [hidden, setHidden] = useState<Set<string>>(loadHidden);
  const invites = identity && status !== 'auth' ? (snap?.invites ?? []).filter((i) => !hidden.has(i.id)) : [];
  const inv = invites[0];
  useTick(!!inv);
  if (!inv || !snap) return <>{sheet}</>;
  const names = distinctNames(snap.invites.map((i) => i.from));
  const hide = () =>
    setHidden((h) => {
      const next = new Set(h).add(inv.id);
      saveHidden(next);
      return next;
    });
  return (
    <>
      <div className="invite-banner" role="status" aria-live="polite">
        <span className="invite-banner__icon" aria-hidden="true">
          <UiIcon name="envelope" />
        </span>
        <span className="invite-banner__text">
          <b>
            <span className="u-name">{names.get(inv.from.friendCode) ?? inv.from.name}</span>さんから対戦の招待
          </b>
          <small>
            {MODE_LABEL[inv.mode]}・{leftOf(inv, social)}
            {invites.length > 1 && `・ほかに${invites.length - 1}件`}
          </small>
        </span>
        <span className="invite-banner__btns">
          <button type="button" className="btn btn--small btn--ghost" disabled={busy === inv.id} onClick={() => void decline(inv)}>
            断る
          </button>
          <button type="button" className="btn btn--small btn--primary" disabled={busy === inv.id} onClick={() => void accept(inv)}>
            参加
          </button>
          <button
            type="button"
            className="btn btn--small btn--ghost btn--icon invite-banner__later"
            aria-label="あとで（いまは閉じる）"
            title="あとで（オンラインのフレンドのタブにも出ています）"
            onClick={hide}
          >
            <UiIcon name="cancel" />
          </button>
        </span>
      </div>
      {sheet}
    </>
  );
}

/** 対戦・ドラフトの画面の見出しに置く札「招待 N」（盤面を隠さない）。押すと届いた招待の一覧 */
export function InviteChip() {
  const { snap, identity, status } = useSocial();
  const [open, setOpen] = useState(false);
  const invites = identity && status !== 'auth' ? (snap?.invites ?? []) : [];
  if (invites.length === 0 && !open) return null;
  return (
    <>
      {invites.length > 0 && (
        <button type="button" className="online-chip invite-chip" onClick={() => setOpen(true)} aria-label={`対戦の招待が${invites.length}件届いています`}>
          <UiIcon name="envelope" className="online-chip__gi" />
          招待 {invites.length}
        </button>
      )}
      {open && <InviteListSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function InviteListSheet({ onClose }: { onClose: () => void }) {
  const social = useSocial();
  const { snap } = social;
  const { accept, decline, busy, sheet } = useInviteAnswer();
  const invites = snap?.invites ?? [];
  useTick(invites.length > 0);
  const names = distinctNames(invites.map((i) => i.from));
  return (
    <Sheet open title="届いた対戦の招待" onClose={onClose} desktop="modal">
      <p className="hint">参加すると、いまの対戦は中断して招待された部屋に移ります（CPU 戦の続きは準備画面から戻れます）。</p>
      {invites.length === 0 ? (
        <p className="hint">いま届いている招待はありません。</p>
      ) : (
        <ul className="friends__list">
          {invites.map((inv) => (
            <li key={inv.id} className="friend friend--invite">
              <span className="friend__text">
                <b>
                  <span className="u-name">{names.get(inv.from.friendCode) ?? inv.from.name}</span>さんから
                </b>
                <small>
                  {MODE_LABEL[inv.mode]}・{leftOf(inv, social)}
                </small>
              </span>
              <span className="friend__btns">
                <button type="button" className="btn btn--small btn--ghost" disabled={busy === inv.id} onClick={() => void decline(inv)}>
                  断る
                </button>
                <button type="button" className="btn btn--small btn--primary" disabled={busy === inv.id} onClick={() => void accept(inv)}>
                  参加
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {sheet}
    </Sheet>
  );
}
