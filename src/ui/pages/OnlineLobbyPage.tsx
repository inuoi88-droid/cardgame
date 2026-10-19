/** オンライン対戦のロビー：名前とデッキを選び、部屋を作る／コードで入る */
import { useState } from 'react';
import { BALANCE } from '../../engine/index.ts';
import { CODE_LENGTH, NAME_MAX_LENGTH, normalizeCode } from '../../online/codes.ts';
import { DeckPicker } from '../battle/DeckPicker.tsx';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { pickChoice, useDeckChoices } from '../battle/deckChoices.ts';
import { callServer, clearOnlineSession, loadOnlineName, loadOnlineSession, saveOnlineName, saveOnlineSession } from '../online/client.ts';
import { navigate } from '../router.ts';

export function OnlineLobbyPage({ code: initialCode }: { code: string | null }) {
  const choices = useDeckChoices();
  const confirm = useConfirm();
  const [existing, setExisting] = useState(() => loadOnlineSession());
  const [name, setName] = useState(() => loadOnlineName());
  const [deckKey, setDeckKey] = useState('');
  const [code, setCode] = useState(initialCode ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = pickChoice(choices, deckKey);

  const enter = async (mode: 'create' | 'join') => {
    if (!selected?.valid || busy) return;
    const joinCode = normalizeCode(code);
    if (mode === 'join' && !joinCode) {
      setError(`部屋コードは${CODE_LENGTH}文字です`);
      return;
    }
    if (
      existing &&
      !(await confirm({
        title: '新しい部屋に移りますか？',
        message: `いま参加している部屋（コード ${existing.code}）を抜けます。対戦中なら、その対戦には戻れなくなります。`,
        okLabel: '移る',
        danger: true,
      }))
    )
      return;
    setBusy(true);
    setError(null);
    saveOnlineName(name);
    const player = { name, deck: selected.deck, cards: selected.cards };
    const res = await callServer(mode === 'create' ? { op: 'create', ...player } : { op: 'join', code: joinCode!, ...player });
    setBusy(false);
    if (!res.ok || !res.token) {
      setError(res.ok ? 'サーバーから合言葉が届きませんでした' : res.error);
      return;
    }
    saveOnlineSession({ v: 1, code: res.code, token: res.token });
    navigate('/online/play');
  };

  return (
    <>
      <div className="page-head">
        <h1>オンライン対戦</h1>
      </div>
      {existing && (
        <div className="notice">
          参加中の部屋があります（コード {existing.code}）。
          <span className="btn-row">
            <button type="button" className="btn btn--small btn--primary" onClick={() => navigate('/online/play')}>
              部屋に戻る
            </button>
            <button
              type="button"
              className="btn btn--small"
              onClick={async () => {
                const ok = await confirm({
                  title: 'この部屋を抜けますか？',
                  message: '対戦中なら、その対戦には戻れなくなります。',
                  okLabel: '抜ける',
                  danger: true,
                });
                if (!ok) return;
                clearOnlineSession();
                setExisting(null);
              }}
            >
              部屋を抜ける
            </button>
          </span>
        </div>
      )}
      <section className="panel">
        <label className="field">
          <span>あなたの名前（{NAME_MAX_LENGTH}文字まで。空なら「プレイヤー」）</span>
          <input type="text" value={name} maxLength={NAME_MAX_LENGTH} placeholder="プレイヤー" onChange={(e) => setName(e.target.value)} />
        </label>
      </section>
      <section className="panel">
        <h2>使うデッキ</h2>
        <DeckPicker choices={choices} selected={selected} onSelect={setDeckKey} />
      </section>
      <section className="panel online-entry">
        <div>
          <h2>部屋を作る</h2>
          <p className="hint">{CODE_LENGTH}文字の部屋コードが出ます。相手に伝えてください。</p>
          <button type="button" className="btn btn--primary btn--big" disabled={!selected?.valid || busy} onClick={() => void enter('create')}>
            部屋を作る
          </button>
        </div>
        <div>
          <h2>コードで入る</h2>
          <label className="field">
            <span>相手から聞いた部屋コード</span>
            <input
              type="text"
              className="online-code-input"
              value={code}
              maxLength={CODE_LENGTH + 2}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="ABC234"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && void enter('join')}
            />
          </label>
          <button type="button" className="btn btn--primary btn--big" disabled={!selected?.valid || busy || code.trim() === ''} onClick={() => void enter('join')}>
            入る
          </button>
        </div>
      </section>
      {busy && <div className="notice">サーバーとやりとりしています…</div>}
      {error && <div className="notice notice--ng">{error}</div>}
      <p className="hint">
        先攻・後攻はランダム。1ターンの制限時間は{BALANCE.online.turnSeconds}秒で、{BALANCE.online.timeoutLoseCount}
        回続けて時間切れになると負けです。同じブラウザで開き直せば、対戦の続きに戻れます。
      </p>
    </>
  );
}
