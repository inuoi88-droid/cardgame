/**
 * フレンド機能の裏方（App に1つ。決定事項 #123）：
 * - 生存の合図（hello）：画面が見えている間だけ約25秒おき（手元のサーバーは通知が無いので5秒おき。招待の返事待ちなどは8秒おき）。
 *   見えなくなったら止め、見えたらすぐ1回
 * - 本人あての通知（Realtime の cardgame:inbox:<inboxId>）を受けたら取り直す
 * - 公開中のデッキを直して保存したら送り直す（sharing.ts）
 * - 届いた対戦の招待を上に知らせる（InviteBanner。オンラインの画面では、ロビーの中に出すので出さない）
 * プレイヤーがまだ無い人には何もしない（作るのはオンラインの画面を開いたとき）
 */
import { useEffect, useRef, useState } from 'react';
import { analyzeDeck } from '../../engine/index.ts';
import { useToast } from '../components/Toast.tsx';
import { UiIcon } from '../components/UiIcon.tsx';
import { subscribeInbox } from '../online/client.ts';
import { LOCAL_SERVER_URL } from '../online/config.ts';
import type { Route } from '../router.ts';
import { useStore } from '../store.ts';
import { loadSigs, shareDeckNow } from './sharing.ts';
import { leftText, shareSignature, sharedDeckIds } from './socialLogic.ts';
import { refreshSocial, socialBoosted, useSocial } from './socialStore.ts';
import { MODE_LABEL, useInviteAnswer } from './useInviteAnswer.tsx';
import './social.css';

const NORMAL_MS = 25_000;
const FAST_MS = 8_000;
const LOCAL_MS = 5_000;
const TICK_MS = 1_000;

export function SocialRuntime({ route }: { route: Route }) {
  const { identity, snap, status } = useSocial();
  const has = identity !== null && status !== 'auth';

  // 生存の合図
  const last = useRef(0);
  useEffect(() => {
    if (!has) return;
    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      const every = LOCAL_SERVER_URL ? LOCAL_MS : socialBoosted() ? FAST_MS : NORMAL_MS;
      if (Date.now() - last.current < every) return;
      last.current = Date.now();
      void refreshSocial();
    };
    last.current = 0;
    beat();
    const t = setInterval(beat, TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        last.current = 0;
        beat();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [has]);

  // 本人あての通知
  const inboxId = snap?.me.inboxId ?? null;
  useEffect(() => {
    if (!has || !inboxId) return;
    return subscribeInbox(inboxId, () => {
      last.current = Date.now();
      void refreshSocial();
    });
  }, [has, inboxId]);

  useSharedDeckSync();

  const hideBanner = route.page === 'online' || route.page === 'onlineBattle' || route.page === 'friendLink';
  return has && !hideBanner ? <InviteBanner /> : null;
}

/** 公開中のデッキを直したら送り直す。ルールに合わなくなっていれば一度だけ知らせる（公開中のものは前のまま） */
function useSharedDeckSync() {
  const { snap } = useSocial();
  const { decks, cards } = useStore();
  const toast = useToast();
  const warned = useRef(new Set<string>());
  const sending = useRef(new Set<string>());
  const sharedKey = snap?.sharedDecks.map((d) => d.deckId).join(',') ?? '';
  useEffect(() => {
    if (!snap) return;
    const shared = sharedDeckIds(snap);
    const sigs = loadSigs();
    const byId = new Map(cards.map((c) => [c.id, c]));
    for (const d of decks) {
      if (!shared.has(d.id) || sending.current.has(d.id)) continue;
      const sig = shareSignature(d, cards);
      if (sigs[d.id] === sig || sigs[d.id] === undefined) continue;
      if (!analyzeDeck(d, byId).valid) {
        if (!warned.current.has(d.id)) {
          warned.current.add(d.id);
          toast({ text: `公開中のデッキ「${d.name}」はルールに合わないので、フレンドには前の中身のまま見えています`, kind: 'info', duration: 6000 });
        }
        continue;
      }
      sending.current.add(d.id);
      void shareDeckNow(d, cards).then(() => {
        sending.current.delete(d.id);
        warned.current.delete(d.id);
      });
    }
    // snap 全体ではなく、公開中のデッキの並びが変わったときだけ見直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedKey, decks, cards]);
}

/** 届いた対戦の招待（いちばん新しい1件。ほかにもあれば件数） */
function InviteBanner() {
  const { snap } = useSocial();
  const { accept, decline, busy, sheet } = useInviteAnswer();
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [, setTick] = useState(0);
  const invites = (snap?.invites ?? []).filter((i) => !hidden.has(i.id));
  const inv = invites[0];
  useEffect(() => {
    if (!inv) return;
    const t = setInterval(() => setTick((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, [inv]);
  if (!inv || !snap) return sheet;
  const offset = snap.serverNow - Date.now();
  const left = inv.expiresAt - (Date.now() + offset);
  return (
    <>
      <div className="invite-banner" role="alert" aria-live="assertive">
        <span className="invite-banner__icon" aria-hidden="true">
          <UiIcon name="envelope" />
        </span>
        <span className="invite-banner__text">
          <b>
            <span className="u-name">{inv.from.name}</span>さんから対戦の招待
          </b>
          <small>
            {MODE_LABEL[inv.mode]}・{left > 0 ? leftText(left) : 'まもなく期限切れ'}
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
            onClick={() => setHidden((h) => new Set(h).add(inv.id))}
          >
            <UiIcon name="cancel" />
          </button>
        </span>
      </div>
      {sheet}
    </>
  );
}
