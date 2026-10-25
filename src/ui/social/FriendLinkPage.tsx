/**
 * 招待リンク（#/friend/<フレンドコード>/<鍵>/<名前>）を開いたとき（決定事項 #123・#124）。
 * 「<名前>さんとフレンドになりますか？」と確かめてから friendByLink を送る（リンクを渡した人は渡した時点で同意しているので、承認は要らない）。
 * 出す名前はサーバーに確かめた持ち主の本当の名前（linkInfo）。URL の名前は誰でも書き換えられるので、確かめている間も出さない。
 * プレイヤーが無ければ先に作る。名前が自動の「プレイヤー」のままなら、ここで決めてもらう。
 * LINE などのアプリの中のブラウザで開いたら、いつものブラウザで開き直すよう勧める（端末の保存場所が別なので、別のプレイヤーになる）。
 * 自分のリンク・形の壊れたリンク・無効になったリンクはそう伝える。
 */
import { useEffect, useState } from 'react';
import { NAME_MAX_LENGTH } from '../../online/codes.ts';
import { UiIcon } from '../components/UiIcon.tsx';
import { navigate } from '../router.ts';
import { AuthTrouble } from './ProfileSheet.tsx';
import { formatFriendCode, friendStateOf, isInAppBrowser, needsName, parseFriendLinkParts } from './socialLogic.ts';
import { ensurePlayer, setPlayerName, socialAct, useSocial } from './socialStore.ts';
import './social.css';

/** linkInfo の結果：checking（確かめている）／ok（本当の名前）／bad（リンクが無効）／unknown（古いサーバーなどで確かめられない） */
type Owner = { kind: 'checking' } | { kind: 'ok'; name: string } | { kind: 'bad' } | { kind: 'unknown' };

export function FriendLinkPage({ parts }: { parts: string[] }) {
  const link = parseFriendLinkParts(parts);
  const { snap, status, identity } = useSocial();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [owner, setOwner] = useState<Owner>({ kind: 'checking' });
  const inApp = typeof navigator !== 'undefined' && isInAppBrowser(navigator.userAgent);
  useEffect(() => {
    void ensurePlayer();
  }, []);
  useEffect(() => {
    // 自動の「プレイヤー」のままなら空にして、決めてもらう
    if (snap && name === '' && !needsName(snap.me.name)) setName(snap.me.name);
    // 最初に届いた名前だけを入れる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);
  const ready = !!snap;
  const friendCode = link?.friendCode ?? '';
  const token = link?.token ?? '';
  useEffect(() => {
    if (!ready || !friendCode) return;
    let live = true;
    void socialAct({ op: 'linkInfo', friendCode, token }).then((res) => {
      if (!live) return;
      if (res.ok) setOwner({ kind: 'ok', name: res.friend.name });
      else setOwner(res.reason === 'notFound' ? { kind: 'bad' } : { kind: 'unknown' });
    });
    return () => {
      live = false;
    };
  }, [ready, friendCode, token]);

  if (!link) {
    return (
      <section className="panel friend-link">
        <h1>招待リンクが正しくありません</h1>
        <p>リンクが途中で切れているかもしれません。送ってくれた人に、もう一度送ってもらってください。</p>
        <button type="button" className="btn" onClick={() => navigate('/online/friends')}>
          フレンドのタブへ
        </button>
      </section>
    );
  }
  // 本当の名前（確かめられないときはフレンドコード）。URL の名前は使わない
  const shown = owner.kind === 'ok' ? owner.name : formatFriendCode(link.friendCode);
  const state = friendStateOf(snap, link.friendCode);
  const nameMissing = needsName(name);
  const accept = async () => {
    if (nameMissing) {
      setError('あなたの名前を入れてください（相手のフレンドの一覧に出ます）');
      document.getElementById('friend-link-name')?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    if (snap && name.trim() !== snap.me.name) await setPlayerName(name.trim());
    const res = await socialAct({ op: 'friendByLink', friendCode: link.friendCode, token: link.token });
    setBusy(false);
    if (!res.ok) {
      setError(res.reason === 'notFound' ? 'この招待リンクは使えなくなっています（作り直されたか、形が違います）。送ってくれた人に新しいリンクをもらってください' : res.error);
      return;
    }
    setDone(res.friend.name);
  };

  return (
    <section className="panel friend-link">
      <span className="friend-link__crest" aria-hidden="true">
        <UiIcon name="shaking-hands" />
      </span>
      {status === 'auth' && <AuthTrouble />}
      {inApp && !done && (
        <p className="notice friend-link__inapp" role="note">
          LINE などのアプリの中で開いています。ここでフレンドになると、いつものブラウザとは別のプレイヤーになります。右上のメニューから「ブラウザで開く」（Safari・Chrome など）で開き直してください。
        </p>
      )}
      {done ? (
        <>
          <h1>フレンドになりました</h1>
          <p>
            <span className="u-name">{done}</span>さんとフレンドになりました。オンラインの「フレンド」のタブから対戦に招待したり、公開デッキを見たりできます。
          </p>
          <button type="button" className="btn btn--primary btn--big" onClick={() => navigate('/online/friends')}>
            フレンドを見る
          </button>
        </>
      ) : state === 'self' ? (
        <>
          <h1>あなたの招待リンクです</h1>
          <p>このリンクを LINE などで友だちに送ってください。開いた人が「フレンドになる」を押すと、あなたとフレンドになります。</p>
          <button type="button" className="btn" onClick={() => navigate('/online/friends')}>
            フレンドのタブへ
          </button>
        </>
      ) : state === 'friend' ? (
        <>
          <h1>もうフレンドです</h1>
          <p>
            <span className="u-name">{shown}</span>さんとはもうフレンドです。
          </p>
          <button type="button" className="btn btn--primary btn--big" onClick={() => navigate('/online/friends')}>
            フレンドを見る
          </button>
        </>
      ) : owner.kind === 'bad' ? (
        <>
          <h1>この招待リンクは使えません</h1>
          <p>作り直されたか、写し間違いかもしれません。送ってくれた人に新しいリンクをもらってください。</p>
          <button type="button" className="btn" onClick={() => navigate('/online/friends')}>
            フレンドのタブへ
          </button>
        </>
      ) : (
        <>
          <h1>{owner.kind === 'checking' ? '招待リンクを確かめています…' : <><span className="u-name">{shown}</span>さんとフレンドになる</>}</h1>
          <p>
            {owner.kind === 'checking' ? (
              <>フレンドコード {formatFriendCode(link.friendCode)} の人</>
            ) : (
              <>
                <span className="u-name">{shown}</span>さん（フレンドコード {formatFriendCode(link.friendCode)}）
              </>
            )}
            からの招待リンクです。フレンドになると、対戦に招待しあったり、オンラインかどうか・対戦の成績・公開したデッキが見られるようになります。
          </p>
          <label className="field friend-link__name">
            <span>あなたの名前（{NAME_MAX_LENGTH}文字まで。相手に見えます）</span>
            <input
              id="friend-link-name"
              type="text"
              className="u-name-input"
              value={name}
              maxLength={NAME_MAX_LENGTH}
              placeholder="名前を入れてください"
              autoFocus={!!snap && needsName(snap.me.name)}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {error && <p className="notice notice--ng">{error}</p>}
          {status === 'unsupported' && <p className="notice notice--ng">このサーバーはフレンド機能にまだ対応していません。</p>}
          <div className="btn-row friend-link__btns">
            <button type="button" className="btn btn--ghost" onClick={() => navigate('/online')}>
              やめる
            </button>
            <button
              type="button"
              className="btn btn--primary btn--big"
              disabled={busy || !identity || !snap || status === 'auth' || owner.kind === 'checking' || nameMissing}
              onClick={() => void accept()}
            >
              {busy ? 'つないでいます…' : !snap || owner.kind === 'checking' ? '準備しています…' : 'フレンドになる'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
