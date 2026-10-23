/**
 * オンライン対戦のロビー：名前とデッキを選び、部屋を作る／コードで入る。
 * UI2「黒鉄と金の卓」（決定事項 #111 の D）：フォームの羅列をやめ、
 * 「あなた（名前・リーダー）」→「使うデッキ（デッキ箱のタイル）」→「部屋を作る／コードで入る」の切り替え（井戸の溝）と、
 * 下に固定した金の主ボタン1つ（切り替えで「部屋を作る」「入る」に変わる）。対戦のルールは畳む。部屋コードは井戸に大きな等幅の字
 */
import { useState } from 'react';
import { BALANCE, type LeaderId, type PlanarMode } from '../../engine/index.ts';
import { LeaderField, RulesFields } from '../battle/MatchOptionsForm.tsx';
import { rulesSummary, toRules } from '../battle/matchOptions.ts';
import { UiIcon } from '../components/UiIcon.tsx';
import { cx } from '../util.ts';
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
  /** 下の主ボタンが「部屋を作る」か「入る」か（コード付きのリンクで来たら入る） */
  const [mode, setMode] = useState<'create' | 'join'>(initialCode ? 'join' : 'create');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // MTG 要素 △ バッチD：リーダー（作る・入る）と、部屋を作るときの次元・昼と夜
  const [leader, setLeader] = useState<LeaderId>('none');
  const [field, setField] = useState<PlanarMode>('off');
  const [dayNight, setDayNight] = useState(false);
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
    const player = { name, deck: selected.deck, cards: selected.cards, ...(leader !== 'none' ? { leader } : {}) };
    const rules = toRules(field, dayNight);
    const res = await callServer(mode === 'create' ? { op: 'create', ...player, ...(rules ? { rules } : {}) } : { op: 'join', code: joinCode!, ...player });
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
      <section className="panel lobby__you">
        <h2>あなた</h2>
        <div className="lobby__you-grid">
          <label className="field">
            <span>名前（{NAME_MAX_LENGTH}文字まで。空なら「プレイヤー」）</span>
            <input type="text" className="u-name-input" value={name} maxLength={NAME_MAX_LENGTH} placeholder="プレイヤー" onChange={(e) => setName(e.target.value)} />
          </label>
          <LeaderField label="あなたのリーダー" title="あなたのリーダー" value={leader} onChange={(v) => setLeader(v === 'random' ? 'none' : v)} id="online-leader" />
        </div>
      </section>
      <section className="panel">
        <h2>使うデッキ</h2>
        <DeckPicker choices={choices} selected={selected} onSelect={setDeckKey} />
      </section>
      <section className="panel lobby__entry">
        <div className="tabs lobby__tabs" role="tablist" aria-label="部屋を作るか、コードで入るか">
          <button type="button" role="tab" id="lobby-tab-create" aria-controls="lobby-pane-create" aria-selected={mode === 'create'} className={cx('tab', mode === 'create' && 'is-active')} onClick={() => setMode('create')}>
            部屋を作る
          </button>
          <button type="button" role="tab" id="lobby-tab-join" aria-controls="lobby-pane-join" aria-selected={mode === 'join'} className={cx('tab', mode === 'join' && 'is-active')} onClick={() => setMode('join')}>
            コードで入る
          </button>
        </div>
        {mode === 'create' ? (
          <div role="tabpanel" id="lobby-pane-create" aria-labelledby="lobby-tab-create" className="lobby__pane">
            <p className="hint">{CODE_LENGTH}文字の部屋コードが出ます。相手に伝えてください。対戦のルールは部屋を作る人が決めます。</p>
            <details className="fold">
              <summary>
                <span className="fold__title">対戦のルール</span>
                <span className="fold__value">{rulesSummary(toRules(field, dayNight))}</span>
              </summary>
              <div className="fold__body">
                <RulesFields field={field} dayNight={dayNight} onField={setField} onDayNight={setDayNight} name="online" />
              </div>
            </details>
          </div>
        ) : (
          <div role="tabpanel" id="lobby-pane-join" aria-labelledby="lobby-tab-join" className="lobby__pane">
            <label className="field lobby__code">
              <span>相手から聞いた部屋コード（{CODE_LENGTH}文字）</span>
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
          </div>
        )}
      </section>
      {busy && <div className="notice">サーバーとやりとりしています…</div>}
      {error && <div className="notice notice--ng">{error}</div>}
      <p className="hint">
        先攻・後攻はランダム。1ターンの制限時間は{BALANCE.online.turnSeconds}秒で、{BALANCE.online.timeoutLoseCount}
        回続けて時間切れになると負けです。同じブラウザで開き直せば、対戦の続きに戻れます。
      </p>
      <div className="savebar lobby-bar">
        <span className="lobby-bar__sum">
          <UiIcon name="world" />
          <span>
            <b className="u-name">{selected?.name || selected?.label || 'デッキ未選択'}</b>
            <small>{mode === 'create' ? rulesSummary(toRules(field, dayNight)) : code.trim() ? `コード ${code.trim()}` : 'コードを入れてください'}</small>
          </span>
        </span>
        {mode === 'create' ? (
          <button type="button" className="btn btn--primary btn--big" disabled={!selected?.valid || busy} onClick={() => void enter('create')}>
            部屋を作る
          </button>
        ) : (
          <button type="button" className="btn btn--primary btn--big" disabled={!selected?.valid || busy || code.trim() === ''} onClick={() => void enter('join')}>
            入る
          </button>
        )}
      </div>
    </>
  );
}
