/**
 * オンラインの「フレンド」のタブ（決定事項 #123）。上から：届いた招待 → 届いた申請 → フレンド（在室・成績・招待）→
 * フレンドを増やす（コードで申請・招待リンク・最近の対戦相手）→ 送った申請。
 * フレンドの行を押すと詳細（成績・公開デッキ・外す）。公開デッキは相手のデッキと同じ DeckCopySheet でコピーできる。
 */
import { useEffect, useState } from 'react';
import type { FriendView, SharedDeckView } from '../../online/social/protocol.ts';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/Toast.tsx';
import { UiIcon } from '../components/UiIcon.tsx';
import { DeckCopySheet } from '../copy/DeckCopySheet.tsx';
import { shortDate } from '../copy/OpponentHistory.tsx';
import { useOpponentHistory } from '../copy/history.ts';
import { cx } from '../util.ts';
import { InviteFriendSheet, PresenceDot } from './InviteFriendSheet.tsx';
import { AuthTrouble, sendInviteLink, useInviteLink } from './ProfileSheet.tsx';
import { agoText, distinctNames, formatFriendCode, leftText, PRESENCE_LABEL, recordText, requestableOpponents, sourceLabel } from './socialLogic.ts';
import { serverNowOf, socialAct, useSocial, useSocialBoost } from './socialStore.ts';
import { MODE_LABEL, useInviteAnswer } from './useInviteAnswer.tsx';
import { copyText, canShare } from './clip.ts';
import { confirmLeaveRoom } from './enterRoom.ts';

const RESULT_TEXT = { requested: 'に申請しました。相手が承認するとフレンドになります', friends: 'とフレンドになりました', already: 'とはもうフレンドです' } as const;

export function FriendsTab({ onProfile }: { onProfile: () => void }) {
  const social = useSocial();
  const { snap, status } = social;
  useSocialBoost();
  const toast = useToast();
  const confirm = useConfirm();
  const answer = useInviteAnswer();
  const history = useOpponentHistory();
  const link = useInviteLink();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [inviting, setInviting] = useState<FriendView | null>(null);
  const [detail, setDetail] = useState<FriendView | null>(null);

  if (status === 'unsupported') {
    return <p className="notice">このサーバーはフレンド機能にまだ対応していません（部屋コードでの対戦はできます）。</p>;
  }
  if (status === 'auth') return <AuthTrouble />;
  if (!snap) {
    return <p className="hint">{status === 'offline' ? 'サーバーにつながりません。通信環境を確かめてください（自動でつなぎ直します）' : 'フレンドの情報を読み込んでいます…'}</p>;
  }

  const now = () => serverNowOf(social);
  /** サーバーにつながらない：前に見た様子なので、在室は「不明」にして、送る操作は止める（決定事項 #124） */
  const stale = status === 'offline';
  const names = distinctNames([...snap.friends, ...snap.incoming, ...snap.outgoing, ...snap.invites.map((i) => i.from)]);
  const nameOf = (p: { friendCode: string; name: string }) => names.get(p.friendCode) ?? p.name;
  const run = async (key: string, f: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(key);
    const r = await f();
    setBusy(null);
    if (!r.ok && r.error) toast({ text: r.error, kind: 'ng' });
    return r.ok;
  };
  const request = async (friendCode: string, name?: string) => {
    setBusy(`req-${friendCode}`);
    const res = await socialAct({ op: 'friendRequest', friendCode });
    setBusy(null);
    if (!res.ok) {
      toast({ text: res.reason === 'notFound' ? 'そのフレンドコードの人は見つかりません' : res.error, kind: 'ng' });
      return false;
    }
    const who = name ?? res.friends.find((f) => f.friendCode === friendCode)?.name ?? res.outgoing.find((r) => r.friendCode === friendCode)?.name ?? formatFriendCode(friendCode);
    toast({ text: `${who}さん${RESULT_TEXT[res.result]}`, kind: 'ok' });
    return true;
  };
  /** 招待のシートを開く（参加中の部屋があれば、先に抜けてよいか確かめる：シートの上に確認を重ねない） */
  const openInvite = async (f: FriendView) => {
    if (await confirmLeaveRoom(confirm)) setInviting(f);
  };
  const pendingTo = new Map(snap.sentInvites.filter((i) => i.status === 'pending').map((i) => [i.to.friendCode, i]));
  const recent = requestableOpponents(history, snap);

  return (
    <div className="friends">
      {stale && (
        <p className="notice notice--ng" role="status">
          サーバーにつながりません。下は前に見た状態です（自動でつなぎ直します）。
        </p>
      )}
      {snap.invites.length > 0 && (
        <section className="panel friends__invites" aria-labelledby="fr-inv">
          <h2 id="fr-inv">
            <UiIcon name="envelope" />
            対戦の招待
          </h2>
          <ul className="friends__list">
            {snap.invites.map((inv) => (
              <li key={inv.id} className="friend friend--invite">
                <span className="friend__text">
                  <b>
                    <span className="u-name">{nameOf(inv.from)}</span>さんから
                  </b>
                  <small>
                    {MODE_LABEL[inv.mode]}・{leftText(inv.expiresAt - now())}
                  </small>
                </span>
                <span className="friend__btns">
                  <button type="button" className="btn btn--small btn--ghost" disabled={stale || answer.busy === inv.id} onClick={() => void answer.decline(inv)}>
                    断る
                  </button>
                  <button type="button" className="btn btn--small btn--primary" disabled={stale || answer.busy === inv.id} onClick={() => void answer.accept(inv)}>
                    参加
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {snap.incoming.length > 0 && (
        <section className="panel" aria-labelledby="fr-in">
          <h2 id="fr-in">
            <UiIcon name="shaking-hands" />
            届いた申請
          </h2>
          <ul className="friends__list">
            {snap.incoming.map((r) => (
              <li key={r.friendCode} className="friend">
                <span className="friend__text">
                  <b className="u-name">{nameOf(r)}</b>
                  <small>
                    {formatFriendCode(r.friendCode)}・{agoText(now() - r.at)}
                  </small>
                </span>
                <span className="friend__btns">
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    disabled={stale || busy !== null}
                    onClick={() => void run(`in-${r.friendCode}`, () => socialAct({ op: 'friendRespond', friendCode: r.friendCode, accept: false }))}
                  >
                    断る
                  </button>
                  <button
                    type="button"
                    className="btn btn--small btn--primary"
                    disabled={stale || busy !== null}
                    onClick={async () => {
                      if (await run(`in-${r.friendCode}`, () => socialAct({ op: 'friendRespond', friendCode: r.friendCode, accept: true }))) toast({ text: `${nameOf(r)}さんとフレンドになりました`, kind: 'ok' });
                    }}
                  >
                    承認
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel" aria-labelledby="fr-list">
        <h2 id="fr-list">
          <UiIcon name="three-friends" />
          フレンド <small>{snap.friends.length}人</small>
        </h2>
        {snap.friends.length === 0 ? (
          <p className="hint">まだフレンドがいません。下の「フレンドを増やす」から、フレンドコードか招待リンクで増やせます。対戦した相手にも結果の画面から申請できます。</p>
        ) : (
          <ul className="friends__list">
            {snap.friends.map((f) => {
              const pending = pendingTo.get(f.friendCode);
              const pres = stale ? '不明' : PRESENCE_LABEL[f.presence];
              return (
                <li key={f.friendCode} className={cx('friend', !stale && `is-${f.presence}`)}>
                  <button type="button" className="friend__main" onClick={() => setDetail(f)} aria-label={`${nameOf(f)}（${pres}）の詳細`}>
                    <PresenceDot presence={stale ? 'unknown' : f.presence} />
                    <span className="friend__text">
                      <b className="u-name">{nameOf(f)}</b>
                      <small>
                        <span className={cx('friend__pres', !stale && `friend__pres--${f.presence}`)}>{pres}</span>・{recordText(f.record)}
                        {f.decks > 0 && `・公開デッキ ${f.decks}`}
                      </small>
                    </span>
                    <span className="friend__chev" aria-hidden="true" />
                  </button>
                  <span className="friend__btns">
                    {pending ? (
                      <span className="badge badge--mine friend__pending">招待中</span>
                    ) : (
                      <button type="button" className="btn btn--small" disabled={stale || f.presence === 'battle'} onClick={() => void openInvite(f)} aria-label={`${nameOf(f)}さんを対戦に招待`}>
                        <UiIcon name="envelope" />
                        {f.presence === 'battle' ? '対戦中' : '招待'}
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel friends__add" aria-labelledby="fr-add">
        <h2 id="fr-add">
          <UiIcon name="shaking-hands" />
          フレンドを増やす
        </h2>
        <div className="friends__mine">
          <span className="friends__mine-label">あなたのフレンドコード</span>
          <span className="prof__code">{formatFriendCode(snap.me.friendCode)}</span>
          <span className="friends__mine-btns">
            <button
              type="button"
              className="btn btn--small"
              onClick={async () => toast((await copyText(formatFriendCode(snap.me.friendCode))) ? { text: 'フレンドコードをコピーしました', kind: 'ok' } : { text: 'コピーできませんでした', kind: 'ng' })}
            >
              <UiIcon name="files" />
              コピー
            </button>
            <button type="button" className="btn btn--small" disabled={!link.url} onClick={() => link.url && void sendInviteLink(link.url, snap.me.name, toast)}>
              <UiIcon name="linked-rings" />
              {canShare() ? '招待リンクを送る' : '招待リンクをコピー'}
            </button>
          </span>
        </div>
        <form
          className="friends__code"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await request(code)) setCode('');
          }}
        >
          <label className="field">
            <span>相手のフレンドコードで申請</span>
            <input
              type="text"
              className="online-code-input friends__code-input"
              value={code}
              maxLength={11}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="ABCD-EFGH"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </label>
          <button type="submit" className="btn" disabled={stale || code.replace(/[\s-]/g, '').length !== 8 || busy !== null}>
            申請する
          </button>
        </form>
        {recent.length > 0 && (
          <div className="friends__recent">
            <h3 className="join-sheet__h">最近の対戦相手</h3>
            <ul className="friends__list">
              {recent.map((e) => (
                <li key={e.friendCode} className="friend">
                  <span className="friend__text">
                    <b className="u-name">{e.opponentName}</b>
                    <small>{shortDate(e.at)} に対戦</small>
                  </span>
                  <button type="button" className="btn btn--small" disabled={stale || busy !== null} onClick={() => void request(e.friendCode!, e.opponentName)}>
                    <UiIcon name="shaking-hands" />
                    申請
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="hint friends__prof">
          名前・引き継ぎコード（別の端末で同じプレイヤーを使う）は
          <button type="button" className="btn btn--small btn--ghost" onClick={onProfile}>
            <UiIcon name="visored-helm" />
            プロフィール
          </button>
        </p>
      </section>

      {snap.outgoing.length > 0 && (
        <section className="panel" aria-labelledby="fr-out">
          <h2 id="fr-out">送った申請</h2>
          <ul className="friends__list">
            {snap.outgoing.map((r) => (
              <li key={r.friendCode} className="friend">
                <span className="friend__text">
                  <b className="u-name">{nameOf(r)}</b>
                  <small>承認待ち・{agoText(now() - r.at)}</small>
                </span>
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  disabled={stale || busy !== null}
                  onClick={() => void run(`out-${r.friendCode}`, () => socialAct({ op: 'friendRemove', friendCode: r.friendCode }))}
                >
                  取り消す
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {answer.sheet}
      {inviting && <InviteFriendSheet friend={inviting} onClose={() => setInviting(null)} />}
      {detail && (
        <FriendSheet
          friend={snap.friends.find((f) => f.friendCode === detail.friendCode) ?? detail}
          name={nameOf(detail)}
          stale={stale}
          now={now()}
          onInvite={() => {
            const f = detail;
            setDetail(null);
            void openInvite(f);
          }}
          onRemove={async () => {
            const ok = await confirm({
              title: `「${nameOf(detail)}」さんをフレンドから外しますか？`,
              message: '相手のフレンドの一覧からも消えます。成績は残り、また申請すればフレンドに戻れます。',
              okLabel: '外す',
              danger: true,
            });
            if (!ok) return;
            if (await run(`rm-${detail.friendCode}`, () => socialAct({ op: 'friendRemove', friendCode: detail.friendCode }))) {
              toast({ text: `${nameOf(detail)}さんをフレンドから外しました`, kind: 'info' });
              setDetail(null);
            }
          }}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

/** フレンドの詳細：在室・成績・公開デッキ（押すとコピーのシート）・招待・外す */
function FriendSheet({
  friend,
  name,
  stale,
  now,
  onInvite,
  onRemove,
  onClose,
}: {
  friend: FriendView;
  /** 表示名（同じ名前の人がいればフレンドコードを添えたもの） */
  name: string;
  /** サーバーにつながらない（在室は前に見た様子） */
  stale: boolean;
  now: number;
  onInvite: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [decks, setDecks] = useState<SharedDeckView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<SharedDeckView | null>(null);
  useEffect(() => {
    if (friend.decks === 0) {
      setDecks([]);
      return;
    }
    let live = true;
    void socialAct({ op: 'friendDecks', friendCode: friend.friendCode }).then((res) => {
      if (!live) return;
      if (res.ok) setDecks(res.decks);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [friend.friendCode, friend.decks]);
  const r = friend.record;
  const total = r.win + r.loss + r.draw;
  return (
    <Sheet open title={`「${name}」さん`} onClose={onClose} desktop="modal" className="friend-sheet">
      <div className="friend-sheet__head">
        <PresenceDot presence={stale ? 'unknown' : friend.presence} />
        <span>
          <b className={cx('friend__pres', !stale && `friend__pres--${friend.presence}`)}>{stale ? '不明（サーバーにつながりません）' : PRESENCE_LABEL[friend.presence]}</b>
          {!stale && friend.presence === 'offline' && friend.lastSeen !== null && <small>（最後に見かけたのは{agoText(now - friend.lastSeen)}）</small>}
        </span>
      </div>
      <dl className="friend-sheet__rec">
        <div>
          <dt>勝ち</dt>
          <dd>{r.win}</dd>
        </div>
        <div>
          <dt>負け</dt>
          <dd>{r.loss}</dd>
        </div>
        <div>
          <dt>引き分け</dt>
          <dd>{r.draw}</dd>
        </div>
      </dl>
      <p className="hint">
        {total === 0 ? 'まだ対戦していません。' : `${total}戦（フレンドになる前の対戦も数えます）。`}
        フレンドになったのは{agoText(now - friend.since)}。フレンドコード {formatFriendCode(friend.friendCode)}
      </p>
      <h3 className="join-sheet__h">公開デッキ</h3>
      {error && <p className="text-ng">{error}</p>}
      {decks === null ? (
        <p className="hint">読み込んでいます…</p>
      ) : decks.length === 0 ? (
        <p className="hint">公開しているデッキはありません。</p>
      ) : (
        <ul className="opp-hist__list">
          {decks.map((d) => (
            <li key={d.deckId}>
              <button type="button" className="opp-hist__row" onClick={() => setOpen(d)} aria-label={`公開デッキ「${d.name}」を見る`}>
                <UiIcon name="chest" className="opp-hist__gi" />
                <span className="opp-hist__main">
                  <span className="opp-hist__name">{d.name || '（名前なし）'}</span>
                  <span className="opp-hist__meta">
                    {d.count}枚・{shortDate(d.updatedAt)} 更新
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="modal__foot join-sheet__foot">
        <button type="button" className="btn btn--ghost btn--danger" onClick={onRemove}>
          フレンドから外す
        </button>
        <button type="button" className="btn btn--primary" disabled={stale || friend.presence === 'battle'} onClick={onInvite}>
          <UiIcon name="envelope" />
          対戦に招待
        </button>
      </div>
      {open && (
        <DeckCopySheet title={`「${name}」さんの「${open.name}」`} sourceName={sourceLabel(friend.name, friend.friendCode)} deck={open.deck} cards={open.cards} onClose={() => setOpen(null)} />
      )}
    </Sheet>
  );
}
