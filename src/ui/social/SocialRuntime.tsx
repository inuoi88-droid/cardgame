/**
 * フレンド機能の裏方（App に1つ。決定事項 #123）：
 * - 生存の合図（hello）：画面が見えている間だけ約25秒おき（手元のサーバーは通知が無いので5秒おき。招待の返事待ちなどは8秒おき）。
 *   見えなくなったら止め、見えたらすぐ1回
 * - 本人あての通知（Realtime の cardgame:inbox:<inboxId>）を受けたら取り直す
 * - 公開中のデッキを直して保存したら送り直す（sharing.ts）
 * 届いた対戦の招待の知らせは InviteNotices.tsx（App が画面の見出しの上に出す・対戦の画面は見出しの札）
 * プレイヤーがまだ無い人には何もしない（作るのはオンラインの画面を開いたとき）
 */
import { useEffect, useRef } from 'react';
import { analyzeDeck } from '../../engine/index.ts';
import { useToast } from '../components/Toast.tsx';
import { subscribeInbox } from '../online/client.ts';
import { LOCAL_SERVER_URL } from '../online/config.ts';
import { useStore } from '../store.ts';
import { loadSigs, shareDeckNow } from './sharing.ts';
import { shareSignature, sharedDeckIds } from './socialLogic.ts';
import { refreshSocial, socialBoosted, useSocial } from './socialStore.ts';
import './social.css';

const NORMAL_MS = 25_000;
const FAST_MS = 8_000;
const LOCAL_MS = 5_000;
const TICK_MS = 1_000;

export function SocialRuntime() {
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
  return null;
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
