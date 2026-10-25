/**
 * 「募集中の部屋」（公開の部屋の一覧。決定事項 #123）。部屋コードを打たずに1タップで入れる。
 * 見えている間は8秒おき（手元のサーバーは4秒おき）に取り直す。作成者がしばらく通信していない部屋はサーバーが出さない。
 */
import { useCallback, useEffect, useState } from 'react';
import { LEADERS } from '../../engine/index.ts';
import type { ListedRoomView } from '../../online/social/protocol.ts';
import { rulesSummary } from '../battle/matchOptions.ts';
import { UiIcon } from '../components/UiIcon.tsx';
import { callSocial } from '../online/client.ts';
import { LOCAL_SERVER_URL } from '../online/config.ts';
import { cx } from '../util.ts';
import { waitingText } from './socialLogic.ts';
import { MODE_LABEL } from './useInviteAnswer.tsx';

const EVERY_MS = LOCAL_SERVER_URL ? 4000 : 8000;

type ListState = { rooms: ListedRoomView[]; offset: number } | null;

export function PublicRooms({ myRoom, onJoin, onCreate, busyCode }: { myRoom: string | null; onJoin: (r: ListedRoomView) => void; onCreate: () => void; busyCode: string | null }) {
  const [list, setList] = useState<ListState>(null);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await callSocial({ op: 'list' });
    setLoading(false);
    if (res.ok) {
      setList({ rooms: res.rooms, offset: res.serverNow - Date.now() });
      setError(null);
    } else if (res.reason === 'unsupported' || res.reason === 'invalid') {
      // invalid：古いサーバーで「募集中の部屋」の操作を知らない（決定事項 #124）
      setUnsupported(true);
    } else setError(res.error);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
      else setTick((x) => x + 1);
    }, EVERY_MS);
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  if (unsupported) {
    return (
      <p className="notice rooms__unsupported">
        いまのサーバーは「募集中の部屋」にまだ対応していません。部屋を作ったら、部屋コードを相手に伝えてください。
      </p>
    );
  }
  // 同じ名前の部屋が並ぶときは、部屋コードの先頭を添えて見分ける
  const counts = new Map<string, number>();
  for (const r of list?.rooms ?? []) counts.set(r.hostName, (counts.get(r.hostName) ?? 0) + 1);
  const hostLabel = (r: ListedRoomView) => {
    const n = r.hostName || 'プレイヤー';
    return (counts.get(r.hostName) ?? 0) > 1 ? `${n}（${r.code.slice(0, 3)}…）` : n;
  };
  const now = Date.now() + (list?.offset ?? 0);
  return (
    <section className="panel rooms" aria-labelledby="rooms-h">
      <div className="rooms__head">
        <h2 id="rooms-h">
          <UiIcon name="open-gate" />
          募集中の部屋
        </h2>
        <button type="button" className={cx('btn btn--small btn--ghost', loading && 'is-loading')} onClick={() => void load()} aria-label="一覧を取り直す" title="取り直す">
          <UiIcon name="clockwise-rotation" />
          更新
        </button>
      </div>
      {error && (
        <p className="text-ng rooms__error" role="status">
          {list ? '一覧を取り直せませんでした（下は前の一覧です）。' : ''}
          {error}
          <button type="button" className="btn btn--small" onClick={() => void load()} disabled={loading}>
            <UiIcon name="clockwise-rotation" />
            再試行
          </button>
        </p>
      )}
      {list === null ? (
        !error && <p className="hint">読み込んでいます…</p>
      ) : list.rooms.length === 0 ? (
        <div className="rooms__empty">
          <p>いま募集中の部屋はありません。</p>
          <p className="hint">「公開」で部屋を作ると、ここに出て、だれでも1タップで入れます。</p>
          <button type="button" className="btn btn--small" onClick={onCreate}>
            <UiIcon name="quill-ink" />
            部屋を作る
          </button>
        </div>
      ) : (
        <ul className="rooms__list">
          {list.rooms.map((r) => {
            const mine = r.code === myRoom;
            return (
              <li key={r.code} className="rooms__row">
                <span className="rooms__mode" aria-hidden="true">
                  <UiIcon name={r.mode === 'draft' ? 'card-pick' : 'chest'} />
                </span>
                <span className="rooms__text">
                  <b className="u-name">{hostLabel(r)}</b>
                  <small>
                    {MODE_LABEL[r.mode]}・{rulesSummary(r.rules)}
                    {r.leader !== 'none' && `・リーダー ${LEADERS[r.leader].name}`}
                  </small>
                  <small className="rooms__wait">{waitingText(now - r.since)}</small>
                </span>
                {mine ? (
                  <span className="badge">あなたの部屋</span>
                ) : (
                  <button type="button" className="btn btn--small btn--primary" disabled={busyCode !== null} onClick={() => onJoin(r)} aria-label={`${hostLabel(r)}さんの部屋に入る`}>
                    {busyCode === r.code ? '入っています…' : '入る'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
