/**
 * 招待リンク（#/friend/<フレンドコード>/<鍵>/<名前>）を開いたとき（決定事項 #123）。
 * 「<名前>さんとフレンドになりますか？」と確かめてから friendByLink を送る（リンクを渡した人は渡した時点で同意しているので、承認は要らない）。
 * プレイヤーが無ければ先に作る。自分のリンク・形の壊れたリンク・無効になったリンクはそう伝える。
 */
import { useEffect, useState } from 'react';
import { NAME_MAX_LENGTH } from '../../online/codes.ts';
import { UiIcon } from '../components/UiIcon.tsx';
import { navigate } from '../router.ts';
import { AuthTrouble } from './ProfileSheet.tsx';
import { formatFriendCode, friendStateOf, parseFriendLinkParts } from './socialLogic.ts';
import { ensurePlayer, setPlayerName, socialAct, useSocial } from './socialStore.ts';
import './social.css';

export function FriendLinkPage({ parts }: { parts: string[] }) {
  const link = parseFriendLinkParts(parts);
  const { snap, status, identity } = useSocial();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [name, setName] = useState('');
  useEffect(() => {
    void ensurePlayer();
  }, []);
  useEffect(() => {
    if (snap && name === '') setName(snap.me.name);
    // 最初に届いた名前だけを入れる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);

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
  const shown = link.name || formatFriendCode(link.friendCode);
  const state = friendStateOf(snap, link.friendCode);
  const accept = async () => {
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
      ) : (
        <>
          <h1>
            <span className="u-name">{shown}</span>さんとフレンドになる
          </h1>
          <p>
            <span className="u-name">{shown}</span>さん（フレンドコード {formatFriendCode(link.friendCode)}）からの招待リンクです。フレンドになると、対戦に招待しあったり、
            オンラインかどうか・対戦の成績・公開したデッキが見られるようになります。
          </p>
          <label className="field friend-link__name">
            <span>あなたの名前（{NAME_MAX_LENGTH}文字まで。相手に見えます）</span>
            <input type="text" className="u-name-input" value={name} maxLength={NAME_MAX_LENGTH} placeholder="プレイヤー" onChange={(e) => setName(e.target.value)} />
          </label>
          {error && <p className="notice notice--ng">{error}</p>}
          {status === 'unsupported' && <p className="notice notice--ng">このサーバーはフレンド機能にまだ対応していません。</p>}
          <div className="btn-row friend-link__btns">
            <button type="button" className="btn btn--ghost" onClick={() => navigate('/online')}>
              やめる
            </button>
            <button type="button" className="btn btn--primary btn--big" disabled={busy || !identity || !snap || status === 'auth'} onClick={() => void accept()}>
              {busy ? 'つないでいます…' : !snap ? '準備しています…' : 'フレンドになる'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
