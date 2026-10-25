/**
 * あなたのプロフィール（決定事項 #123）：名前・フレンドコード・招待リンク・引き継ぎコード（別の端末へ移す）。
 * ログインもパスワードも無い。この端末のプレイヤーは鍵（引き継ぎコード）で決まるので、鍵は見せる前に注意を出す。
 */
import { useEffect, useState } from 'react';
import { NAME_MAX_LENGTH } from '../../online/codes.ts';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/Toast.tsx';
import { UiIcon } from '../components/UiIcon.tsx';
import { appBaseUrl } from '../online/config.ts';
import { canShare, copyText, shareLink } from './clip.ts';
import { formatFriendCode, formatSecret, friendLinkUrl } from './socialLogic.ts';
import { importSecret, rotateSecret, setPlayerName, socialAct, startOver, useSocial } from './socialStore.ts';

/** 招待リンクの鍵を取る（開いている間だけ覚えておく） */
export function useInviteLink(): { url: string | null; error: string | null; rotate: () => Promise<void> } {
  const { identity, snap } = useSocial();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const has = identity !== null;
  useEffect(() => {
    if (!has) return;
    let live = true;
    void socialAct({ op: 'inviteLink' }).then((res) => {
      if (!live) return;
      if (res.ok) setToken(res.token);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [has]);
  const rotate = async () => {
    const res = await socialAct({ op: 'inviteLink', rotate: true });
    if (res.ok) setToken(res.token);
    else setError(res.error);
  };
  const code = snap?.me.friendCode ?? identity?.friendCode;
  const url = token && code ? friendLinkUrl(appBaseUrl(), { friendCode: code, token, name: snap?.me.name ?? identity?.name ?? '' }) : null;
  return { url, error, rotate };
}

/** 招待リンクを送る（スマホは共有シート、無ければコピー） */
export async function sendInviteLink(url: string, name: string, toast: (o: { text: string; kind?: 'ok' | 'ng' | 'info' }) => unknown): Promise<void> {
  const text = `${name || 'プレイヤー'}とフレンドになりませんか？このリンクを開いて「フレンドになる」を押してください（自作カードバトル）`;
  const r = await shareLink(url, text);
  if (r === 'shared' || r === 'cancel') return;
  const ok = await copyText(url);
  toast(ok ? { text: '招待リンクをコピーしました。LINE などで送ってください', kind: 'ok' } : { text: 'コピーできませんでした。リンクを長押ししてコピーしてください', kind: 'ng' });
}

export function ProfileSheet({ onClose }: { onClose: () => void }) {
  const { identity, snap, status } = useSocial();
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(snap?.me.name ?? identity?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [importing, setImporting] = useState(false);
  const link = useInviteLink();
  const code = snap?.me.friendCode ?? identity?.friendCode ?? '';
  const currentName = snap?.me.name ?? identity?.name ?? '';

  const saveName = async () => {
    setSavingName(true);
    const ok = await setPlayerName(name.trim());
    setSavingName(false);
    toast(ok ? { text: '名前を変えました', kind: 'ok' } : { text: '名前を変えられませんでした（通信を確かめてください）', kind: 'ng' });
  };
  const copy = async (text: string, label: string) => {
    toast((await copyText(text)) ? { text: `${label}をコピーしました`, kind: 'ok' } : { text: 'コピーできませんでした', kind: 'ng' });
  };

  return (
    <Sheet open title="あなたのプロフィール" onClose={onClose} desktop="modal" className="profile-sheet">
      {status === 'auth' && <AuthTrouble onImported={(n) => setName(n)} />}
      <section className="prof__sec">
        <label className="field">
          <span>名前（{NAME_MAX_LENGTH}文字まで。フレンドと対戦相手に見えます）</span>
          <span className="prof__row">
            <input type="text" className="u-name-input" value={name} maxLength={NAME_MAX_LENGTH} placeholder="プレイヤー" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void saveName()} />
            <button type="button" className="btn btn--small" disabled={savingName || name.trim() === currentName} onClick={() => void saveName()}>
              変える
            </button>
          </span>
        </label>
      </section>

      <section className="prof__sec">
        <h3 className="prof__h">
          <UiIcon name="ticket" />
          フレンドコード
        </h3>
        <p className="hint">相手にこのコードを伝えて、フレンドのタブの「コードで申請」に入れてもらいます。</p>
        <div className="prof__row">
          <span className="prof__code" aria-label="フレンドコード">
            {code ? formatFriendCode(code) : '……'}
          </span>
          <button type="button" className="btn btn--small" disabled={!code} onClick={() => void copy(formatFriendCode(code), 'フレンドコード')}>
            <UiIcon name="files" />
            コピー
          </button>
        </div>
      </section>

      <section className="prof__sec">
        <h3 className="prof__h">
          <UiIcon name="linked-rings" />
          招待リンク
        </h3>
        <p className="hint">LINE などで送ると、開いた人が確かめるだけでフレンドになれます（申請の承認は要りません）。</p>
        {link.error && <p className="text-ng">{link.error}</p>}
        <div className="prof__row prof__row--wrap">
          <button type="button" className="btn btn--small" disabled={!link.url} onClick={() => link.url && void sendInviteLink(link.url, currentName, toast)}>
            <UiIcon name="share" />
            {canShare() ? 'リンクを送る' : 'リンクをコピー'}
          </button>
          <button
            type="button"
            className="btn btn--small btn--ghost"
            disabled={!link.url}
            onClick={async () => {
              if (
                await confirm({
                  title: '招待リンクを作り直しますか？',
                  message: 'いままでに送ったリンクは使えなくなります（もうフレンドになった人はそのままです）。',
                  okLabel: '作り直す',
                })
              ) {
                await link.rotate();
                toast({ text: '招待リンクを作り直しました', kind: 'ok' });
              }
            }}
          >
            作り直す
          </button>
        </div>
      </section>

      <section className="prof__sec">
        <h3 className="prof__h">
          <UiIcon name="key" />
          引き継ぎコード
        </h3>
        <p className="hint">
          この端末のプレイヤー（名前・フレンド・成績）は、引き継ぎコードで決まります。機種変更のときや別の端末でも同じプレイヤーで遊ぶときに使います。
        </p>
        {showSecret && identity ? (
          <div className="prof__secret">
            <p className="prof__warn" role="note">
              <UiIcon name="hazard-sign" />
              <span>
                このコードを知っている人は、あなたとしてフレンドや招待を使えます。自分だけが見るメモや、LINE の Keep・自分だけのトークに貼っておき、新しい端末でコピーして「別の端末から引き継ぐ」に入れます。人には送らないでください。
              </span>
            </p>
            <code className="prof__secret-code">{formatSecret(identity.secret)}</code>
            <div className="prof__row prof__row--wrap">
              <button type="button" className="btn btn--small" onClick={() => void copy(identity.secret, '引き継ぎコード')}>
                <UiIcon name="files" />
                コピー
              </button>
              <button type="button" className="btn btn--small btn--ghost" onClick={() => setShowSecret(false)}>
                隠す
              </button>
              <button
                type="button"
                className="btn btn--small btn--ghost btn--danger"
                onClick={async () => {
                  if (
                    await confirm({
                      title: '引き継ぎコードを作り直しますか？',
                      message: '見られたかもしれないときに使います。いまのコードは使えなくなり、ほかの端末で同じプレイヤーを使っていたら、新しいコードで引き継ぎ直しが必要です。',
                      okLabel: '作り直す',
                      danger: true,
                    })
                  )
                    toast((await rotateSecret()) ? { text: '新しい引き継ぎコードにしました', kind: 'ok' } : { text: '作り直せませんでした', kind: 'ng' });
                }}
              >
                作り直す
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn--small" disabled={!identity} onClick={() => setShowSecret(true)}>
            表示する
          </button>
        )}
        {importing && status !== 'auth' ? (
          <ImportForm
            confirmName={currentName || 'プレイヤー'}
            onDone={(n) => {
              setImporting(false);
              setShowSecret(false);
              setName(n);
            }}
            onCancel={() => setImporting(false)}
          />
        ) : (
          status !== 'auth' && (
            <button type="button" className="btn btn--small btn--ghost prof__import-btn" onClick={() => setImporting(true)}>
              別の端末から引き継ぐ
            </button>
          )
        )}
      </section>
    </Sheet>
  );
}

/**
 * 引き継ぎコードを入れる欄（プロフィールと、鍵が無効になったときの知らせで共用）。
 * confirmName があれば、いまのプレイヤーを替えてよいか確かめる（鍵が無効なときは確かめない）
 */
function ImportForm({ confirmName, onDone, onCancel }: { confirmName?: string; onDone?: (name: string) => void; onCancel?: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (confirmName !== undefined) {
      const ok = await confirm({
        title: 'この端末のプレイヤーを替えますか？',
        message: `いまの「${confirmName}」は、この端末からは使えなくなります（いまの引き継ぎコードを控えていれば、あとで戻せます）。`,
        okLabel: '引き継ぐ',
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    const r = await importSecret(input);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setInput('');
    setError(null);
    toast({ text: `「${r.name}」として引き継ぎました`, kind: 'ok' });
    onDone?.(r.name);
  };
  return (
    <div className="prof__import">
      <label className="field">
        <span>前の端末で表示した引き継ぎコード（64文字）</span>
        <textarea rows={2} value={input} spellCheck={false} autoCapitalize="off" autoComplete="off" onChange={(e) => setInput(e.target.value)} />
      </label>
      {error && <p className="text-ng">{error}</p>}
      <div className="prof__row prof__row--wrap">
        <button type="button" className="btn btn--small" disabled={busy || input.trim() === ''} onClick={() => void go()}>
          引き継ぐ
        </button>
        {onCancel && (
          <button type="button" className="btn btn--small btn--ghost" onClick={onCancel}>
            やめる
          </button>
        )}
      </div>
    </div>
  );
}

/** 端末の鍵が無効になっているとき（勝手に作り直さない）。引き継ぎコードをその場で入れられる */
export function AuthTrouble({ onImported }: { onImported?: (name: string) => void } = {}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [importing, setImporting] = useState(false);
  return (
    <div className="notice notice--ng prof__auth" role="alert">
      <p>この端末のプレイヤー情報が使えなくなっています（引き継ぎコードが別の端末で作り直された、など）。</p>
      <p>引き継ぎコードを持っていれば「引き継ぎコードを入れる」から入れてください。無ければ新しく始められます（前のフレンドは引き継げません）。</p>
      {importing ? (
        <ImportForm onDone={onImported} onCancel={() => setImporting(false)} />
      ) : (
        <div className="prof__row prof__row--wrap">
          <button type="button" className="btn btn--small" onClick={() => setImporting(true)}>
            <UiIcon name="key" />
            引き継ぎコードを入れる
          </button>
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={async () => {
              if (await confirm({ title: '新しく始めますか？', message: '新しいフレンドコードのプレイヤーを作ります。前のフレンドと成績は引き継げません。', okLabel: '新しく始める', danger: true })) {
                const id = await startOver();
                toast(id ? { text: '新しいプレイヤーを作りました', kind: 'ok' } : { text: '作れませんでした（通信を確かめてください）', kind: 'ng' });
              }
            }}
          >
            新しく始める
          </button>
        </div>
      )}
    </div>
  );
}
