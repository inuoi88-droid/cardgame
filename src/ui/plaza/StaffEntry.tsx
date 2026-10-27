/**
 * 運営の入口（決定事項 #141）。ボタンは見せない：画面の足元の版の印（「版 …」）を短い間に続けて押すと開く。
 * パスワードはサーバーが確かめる（コードには書かない）。運営になるとこの端末のプレイヤーが運営になり、
 * みんなの広場に公開できる・公式カードを書き換えられる。
 */
import { useRef, useState } from 'react';
import { APP_BUILD } from '../buildInfo.ts';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/Toast.tsx';
import { UiIcon } from '../components/UiIcon.tsx';
import { navigate } from '../router.ts';
import { useSocial } from '../social/socialStore.ts';
import { refreshStaff, staffLogin, staffLogout, useStaff } from './plazaStore.ts';

/** 続けて押す回数と、その間の長さ */
const TAPS = 7;
const WINDOW_MS = 4000;

/** 足元の版の印。続けて押すと運営の入口が開く */
export function BuildStamp() {
  const [open, setOpen] = useState(false);
  const taps = useRef<number[]>([]);
  const onTap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < WINDOW_MS), now];
    if (taps.current.length >= TAPS) {
      taps.current = [];
      setOpen(true);
      void refreshStaff();
    }
  };
  return (
    <>
      {/* 見た目はただの文字（ボタンの形にしない） */}
      <span className="app-foot__build" onClick={onTap} data-sfx="none">
        版 {APP_BUILD}
      </span>
      {open && <StaffSheet onClose={() => setOpen(false)} />}
    </>
  );
}

export function StaffSheet({ onClose }: { onClose: () => void }) {
  const staff = useStaff();
  const social = useSocial();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    const r = await staffLogin(password);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setPassword('');
    toast({ text: '運営になりました', kind: 'ok' });
  };
  const logout = async () => {
    setBusy(true);
    const r = await staffLogout();
    setBusy(false);
    if (!r.ok) setError(r.error);
    else toast({ text: '運営をやめました', kind: 'info' });
  };
  return (
    <Sheet open title="運営" onClose={onClose} desktop="modal">
      <div className="staff">
        {staff ? (
          <>
            <p className="staff__state">
              <UiIcon name="gi:podium" />
              「{social.identity?.name ?? '（名前なし）'}」（フレンドコード {social.identity?.friendCode}）は運営です。
            </p>
            <p className="hint">みんなの広場にカード・デッキを公開できます（カード・デッキの詳細から）。公式カードの一覧から公式カードを書き換えられます。書き換えは保存した時点で全員に効きます。</p>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  onClose();
                  navigate('/plaza');
                }}
              >
                <UiIcon name="gi:village" />
                みんなの広場
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onClose();
                  navigate('/official');
                }}
              >
                公式カードを書き換える
              </button>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void logout()}>
                運営をやめる
              </button>
            </div>
          </>
        ) : (
          <form
            className="staff__form"
            onSubmit={(e) => {
              e.preventDefault();
              void login();
            }}
          >
            <p className="hint">運営のパスワードを入れてください。この端末のプレイヤー（オンラインで使う名前）が運営になります。</p>
            <label className="field">
              <span>パスワード</span>
              <input type="password" inputMode="numeric" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={64} autoFocus />
            </label>
            {error && <p className="field__error">{error}</p>}
            <div className="btn-row">
              <button type="submit" className="btn btn--primary" disabled={!password || busy}>
                {busy ? '確かめています…' : '運営になる'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Sheet>
  );
}
