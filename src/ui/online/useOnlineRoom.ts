/**
 * 参加中の部屋の様子をサーバーと合わせ続ける。
 * - 一定間隔で状態を取りに行く（接続中の目印も兼ねる）
 * - Realtime の「版が上がった」通知が来たら、すぐ取りに行く
 * - 締め切りを過ぎたら、時間切れの処理を頼みに行く（処理はサーバーがする）
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { battle } from '../../engine/index.ts';
import type { RoomView } from '../../online/protocol.ts';
import { callServer, subscribeRoom, type OnlineSession } from './client.ts';
import { DEADLINE_GRACE_MS, POLL_MS } from './config.ts';

export interface OnlineRoom {
  room: RoomView | null;
  /** 一時的なエラー（行動を断られた、通信できないなど） */
  error: string | null;
  /** 部屋がもうない・参加者でない（続けられない） */
  fatal: string | null;
  /** 行動を送っている途中 */
  busy: boolean;
  /** 直前の通信がサーバーに届いたか */
  online: boolean;
  /** サーバーの時計で今の時刻（ミリ秒） */
  serverNow: () => number;
  send: (action: battle.Action) => void;
  refresh: () => void;
}

export function useOnlineRoom(session: OnlineSession): OnlineRoom {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const roomRef = useRef<RoomView | null>(null);
  /** サーバーの時計 − 手元の時計 */
  const offset = useRef(0);
  const inFlight = useRef(false);
  const again = useRef(false);

  /** 届いた様子を取り入れる。遅れて届いた古い版は捨てる */
  const accept = useCallback((r: RoomView) => {
    const cur = roomRef.current;
    if (cur && r.version < cur.version) return;
    offset.current = r.serverNow - Date.now();
    roomRef.current = r;
    setRoom(r);
    setOnline(true);
  }, []);

  const refresh = useCallback(() => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    void callServer({ op: 'state', code: session.code, token: session.token }).then((res) => {
      inFlight.current = false;
      if (res.ok) accept(res);
      else if (res.reason === 'network') setOnline(false);
      else if (res.reason === 'notFound' || res.reason === 'auth') setFatal(res.error);
      else setError(res.error);
      if (again.current) {
        again.current = false;
        refresh();
      }
    });
  }, [session.code, session.token, accept]);

  const send = useCallback(
    (action: battle.Action) => {
      const cur = roomRef.current;
      if (!cur) return;
      setBusy(true);
      setError(null);
      void callServer({ op: 'action', code: session.code, token: session.token, version: cur.version, action }).then((res) => {
        setBusy(false);
        if (res.ok) {
          accept(res);
          return;
        }
        if (res.reason === 'network') setOnline(false);
        setError(res.reason === 'version' ? '相手の操作か時間切れが先に起きました。画面を確かめて、もう一度操作してください' : res.error);
        refresh();
      });
    },
    [session.code, session.token, accept, refresh],
  );

  const ended = room?.status === 'ended';

  // 最初の取得・一定間隔の取得・画面に戻ったときの取得
  useEffect(() => {
    refresh();
    if (ended) return;
    const timer = setInterval(refresh, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, ended]);

  // 版が上がった通知
  useEffect(() => {
    if (ended) return;
    return subscribeRoom(session.code, (version) => {
      if (!roomRef.current || version > roomRef.current.version) refresh();
    });
  }, [session.code, refresh, ended]);

  // 締め切りを過ぎたら取りに行く（サーバーが時間切れを処理する）
  const deadline = room?.deadline ?? null;
  useEffect(() => {
    if (deadline === null) return;
    const wait = Math.max(0, deadline - (Date.now() + offset.current)) + DEADLINE_GRACE_MS;
    const t = setTimeout(refresh, wait);
    return () => clearTimeout(t);
  }, [deadline, refresh]);

  const serverNow = useCallback(() => Date.now() + offset.current, []);

  return { room, error, fatal, busy, online, serverNow, send, refresh };
}
