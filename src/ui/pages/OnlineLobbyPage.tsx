/**
 * オンライン対戦のロビー：名前とデッキを選び、部屋を作る／コードで入る。
 * UI2「黒鉄と金の卓」（決定事項 #111 の D）：フォームの羅列をやめ、
 * 「あなた（名前・リーダー）」→「使うデッキ（デッキ箱のタイル）」→「部屋を作る／コードで入る」の切り替え（井戸の溝）と、
 * 下に固定した金の主ボタン1つ（切り替えで「部屋を作る」「入る」に変わる）。対戦のルールは畳む。部屋コードは井戸に大きな等幅の字。
 * 部屋を作るときは形式を選ぶ（決定事項 #119）：「自分のデッキ」か「ドラフト（公式カード）」。ドラフトの部屋はデッキを選ばない
 * （入る人も、ドラフトの部屋ならデッキは使われない）。リーダーと対戦のルールはどちらの形式でも選べる
 * フレンド機能（決定事項 #123）：上に「対戦」「フレンド」のタブ。対戦のタブは「募集中の部屋」（公開の部屋の一覧。1タップで入る）→
 * 部屋を作る（公開／合言葉）・コードで入る。開いたときにこの端末のプレイヤーを自動で作る（ログイン・パスワードなし）。
 * 見出しの右にプロフィール（名前・フレンドコード・招待リンク・引き継ぎコード）
 */
import { useEffect, useState } from 'react';
import { BALANCE, type LeaderId, type PlanarMode } from '../../engine/index.ts';
import { LeaderField, RulesFields } from '../battle/MatchOptionsForm.tsx';
import { rulesSummary, toRules } from '../battle/matchOptions.ts';
import { UiIcon } from '../components/UiIcon.tsx';
import { cx } from '../util.ts';
import { CODE_LENGTH, NAME_MAX_LENGTH, normalizeCode } from '../../online/codes.ts';
import { DeckPicker } from '../battle/DeckPicker.tsx';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { pickChoice, useDeckChoices } from '../battle/deckChoices.ts';
import { loadOnlineName, loadOnlineSession } from '../online/client.ts';
import { navigate } from '../router.ts';
import { OFFICIAL_SET } from '../../official/index.ts';
import { DRAFT_FEATURE, type RoomMode } from '../../online/protocol.ts';
import type { ListedRoomView } from '../../online/social/protocol.ts';
import { confirmLeaveRoom, enterRoom, goToRoom, leaveRoom, loadOnlineDeckKey, saveOnlineDeckKey } from '../social/enterRoom.ts';
import { FriendsTab } from '../social/FriendsTab.tsx';
import { JoinSheet } from '../social/JoinSheet.tsx';
import { ProfileSheet } from '../social/ProfileSheet.tsx';
import { PublicRooms } from '../social/PublicRooms.tsx';
import { badgeCount, needsName } from '../social/socialLogic.ts';
import { ensurePlayer, setPlayerName, useSocial } from '../social/socialStore.ts';
import { MODE_LABEL } from '../social/useInviteAnswer.tsx';
import '../draft/draft.css';
import '../social/social.css';

const LISTED_KEY = 'cardgame.v1.onlineListed';

/** 前に選んだ「公開／合言葉」（見る人ごとの便利さだけ。既定は公開） */
function loadListed(): boolean {
  try {
    return localStorage.getItem(LISTED_KEY) !== '0';
  } catch {
    return true;
  }
}
function saveListed(on: boolean): void {
  try {
    localStorage.setItem(LISTED_KEY, on ? '1' : '0');
  } catch {
    // 何もしない
  }
}

export function OnlineLobbyPage({ code: initialCode, tab = 'battle' }: { code: string | null; tab?: 'battle' | 'friends' }) {
  const social = useSocial();
  const [profileOpen, setProfileOpen] = useState(false);
  // この端末のプレイヤーを用意する（初めてなら作る。名前は前に使ったオンラインの名前）
  useEffect(() => {
    void ensurePlayer();
  }, []);
  const badge = badgeCount(social.snap);
  const meName = social.snap?.me.name ?? social.identity?.name ?? '';
  return (
    <>
      <div className="page-head lobby-head">
        <h1>オンライン対戦</h1>
        <button type="button" className="btn btn--small lobby-head__me" onClick={() => setProfileOpen(true)} aria-label={`プロフィール（${meName || 'プレイヤー'}）`}>
          <UiIcon name="visored-helm" />
          <span className="u-name">{meName || 'プレイヤー'}</span>
        </button>
      </div>
      <div className="tabs lobby__top-tabs" role="tablist" aria-label="対戦かフレンドか">
        <button type="button" role="tab" aria-selected={tab === 'battle'} className={cx('tab', tab === 'battle' && 'is-active')} onClick={() => navigate('/online')}>
          <UiIcon name="crossed-swords" />
          対戦
        </button>
        <button type="button" role="tab" aria-selected={tab === 'friends'} className={cx('tab', tab === 'friends' && 'is-active')} onClick={() => navigate('/online/friends')}>
          <UiIcon name="three-friends" />
          フレンド
          {badge > 0 && (
            <span className="count-badge" aria-label={`新しいお知らせ ${badge}件`}>
              {badge}
            </span>
          )}
        </button>
      </div>
      {tab === 'friends' ? <FriendsTab onProfile={() => setProfileOpen(true)} /> : <BattleTab initialCode={initialCode} meName={meName} />}
      {profileOpen && <ProfileSheet onClose={() => setProfileOpen(false)} />}
    </>
  );
}

function BattleTab({ initialCode, meName }: { initialCode: string | null; meName: string }) {
  const choices = useDeckChoices();
  const confirm = useConfirm();
  const [existing, setExisting] = useState(() => loadOnlineSession());
  // 名前が自動の「プレイヤー」のままなら空にして、最初に部屋を作る・入るときに決めてもらう（決定事項 #124）
  const [name, setName] = useState(() => (needsName(meName) ? (needsName(loadOnlineName()) ? '' : loadOnlineName()) : meName));
  const [deckKey, setDeckKeyState] = useState(() => loadOnlineDeckKey());
  const setDeckKey = (k: string) => {
    setDeckKeyState(k);
    saveOnlineDeckKey(k);
  };
  /** 公開（募集中の部屋に出す）か合言葉か */
  const [listed, setListedState] = useState(() => loadListed());
  const setListed = (on: boolean) => {
    setListedState(on);
    saveListed(on);
  };
  const [joiningRoom, setJoiningRoom] = useState<ListedRoomView | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  // プロフィールで名前を変えたら、ここの名前もそろえる
  useEffect(() => {
    if (meName && !needsName(meName)) setName(meName);
  }, [meName]);
  /** 名前を決めていなければ、名前の欄へ案内する（一度決めれば次からは聞かない） */
  const askName = (): boolean => {
    if (!needsName(name)) return false;
    setError('まず名前を決めてください（対戦相手や「募集中の部屋」、フレンドの一覧に出ます）');
    const el = document.getElementById('online-name');
    el?.scrollIntoView({ block: 'center' });
    el?.focus();
    return true;
  };
  const [code, setCode] = useState(initialCode ?? '');
  /** 下の主ボタンが「部屋を作る」か「入る」か（コード付きのリンクで来たら入る） */
  const [mode, setMode] = useState<'create' | 'join'>(initialCode ? 'join' : 'create');
  /** 作る部屋の形式（自分のデッキ／ドラフト） */
  const [roomMode, setRoomMode] = useState<RoomMode>('deck');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // MTG 要素 △ バッチD：リーダー（作る・入る）と、部屋を作るときの次元・昼と夜
  const [leader, setLeader] = useState<LeaderId>('none');
  const [field, setField] = useState<PlanarMode>('off');
  const [dayNight, setDayNight] = useState(false);
  const selected = pickChoice(choices, deckKey);

  const draftRoom = mode === 'create' && roomMode === 'draft';
  /** 部屋を作る：自分のデッキの部屋は使えるデッキが要る。入る：コードが要る（デッキはドラフトの部屋なら使われない） */
  const canEnter = mode === 'create' ? draftRoom || !!selected?.valid : code.trim() !== '';
  /** 名前をプレイヤーの名前にもそろえる（変わっていれば） */
  const syncName = () => {
    if (name.trim() !== meName) void setPlayerName(name.trim());
  };
  const enter = async (mode: 'create' | 'join') => {
    if (busy) return;
    if (mode === 'create' && !draftRoom && !selected?.valid) return;
    const joinCode = normalizeCode(code);
    if (mode === 'join' && !joinCode) {
      setError(`部屋コードは${CODE_LENGTH}文字です`);
      return;
    }
    if (askName()) return;
    if (!(await confirmLeaveRoom(confirm))) return;
    setBusy(true);
    setError(null);
    syncName();
    const deck = selected?.valid && !draftRoom ? { deck: selected.deck, cards: selected.cards } : {};
    const player = { name, ...deck, ...(leader !== 'none' ? { leader } : {}) };
    const rules = toRules(field, dayNight);
    const res = await enterRoom(
      mode === 'create'
        ? { op: 'create', ...player, ...(rules ? { rules } : {}), ...(draftRoom ? { mode: 'draft' as const } : {}), listed }
        : { op: 'join', code: joinCode!, ...player, features: [DRAFT_FEATURE] },
    );
    setBusy(false);
    if (!res.ok) {
      setError(mode === 'join' && !selected?.valid ? `${res.error}（自分のデッキで戦う部屋です。使うデッキを選んでください）` : res.error);
      return;
    }
    goToRoom();
  };

  /** 募集中の部屋に入る：ドラフトの部屋はそのまま、自分のデッキの部屋はデッキを選ぶシートを挟む */
  const joinListed = async (r: ListedRoomView) => {
    if (busyCode) return;
    if (askName()) return;
    // 参加中の部屋を抜けてよいかは、シートを開く前に確かめる（シートの上に確認を重ねない）
    if (!(await confirmLeaveRoom(confirm))) return;
    if (r.mode === 'deck') {
      setJoiningRoom(r);
      return;
    }
    setBusyCode(r.code);
    syncName();
    const res = await enterRoom({ op: 'join', code: r.code, name, ...(leader !== 'none' ? { leader } : {}), features: [DRAFT_FEATURE] });
    setBusyCode(null);
    if (!res.ok) setError(res.error);
    else goToRoom();
  };

  return (
    <>
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
                  message: '相手待ちの部屋は閉じます（一覧からも消えます）。ドラフト中・対戦中なら降参（負け）になり、相手にすぐ知らせます。',
                  okLabel: '抜ける',
                  danger: true,
                });
                if (!ok) return;
                setExisting(null);
                await leaveRoom();
              }}
            >
              部屋を抜ける
            </button>
          </span>
        </div>
      )}
      <PublicRooms
        myRoom={existing?.code ?? null}
        busyCode={busyCode}
        onJoin={(r) => void joinListed(r)}
        onCreate={() => {
          setMode('create');
          setListed(true);
          document.getElementById('lobby-entry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />
      <section className="panel lobby__you">
        <h2>あなた</h2>
        <div className="lobby__you-grid">
          <label className="field">
            <span>名前（{NAME_MAX_LENGTH}文字まで。対戦相手・フレンドに見えます）</span>
            <input
              id="online-name"
              type="text"
              className="u-name-input"
              value={name}
              maxLength={NAME_MAX_LENGTH}
              placeholder="名前を入れてください"
              onChange={(e) => {
                setName(e.target.value);
                if (error && !needsName(e.target.value)) setError(null);
              }}
              onBlur={() => !needsName(name) && syncName()}
            />
          </label>
          <LeaderField label="あなたのリーダー" title="あなたのリーダー" value={leader} onChange={(v) => setLeader(v === 'random' ? 'none' : v)} id="online-leader" />
        </div>
      </section>
      <section className="panel lobby__entry" id="lobby-entry">
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
            <div className="lobby__mode" role="radiogroup" aria-label="部屋の形式">
              <label className="dchoice">
                <input type="radio" name="room-mode" checked={roomMode === 'deck'} onChange={() => setRoomMode('deck')} />
                <UiIcon name="chest" />
                <b>自分のデッキ</b>
                <small>お互いに自分で作ったデッキで戦う</small>
              </label>
              <label className="dchoice">
                <input type="radio" name="room-mode" checked={roomMode === 'draft'} onChange={() => setRoomMode('draft')} />
                <UiIcon name="card-pick" />
                <b>ドラフト（公式カード）</b>
                <small>公式カードの場から交互に取ってデッキを作り、そのまま戦う</small>
              </label>
            </div>
            <div className="lobby__mode lobby__vis" role="radiogroup" aria-label="だれが入れるか">
              <label className="dchoice">
                <input type="radio" name="room-vis" checked={listed} onChange={() => setListed(true)} />
                <UiIcon name="open-gate" />
                <b>公開</b>
                <small>だれでも入れる</small>
              </label>
              <label className="dchoice">
                <input type="radio" name="room-vis" checked={!listed} onChange={() => setListed(false)} />
                <UiIcon name="locked-door" />
                <b>合言葉</b>
                <small>コードを知る人だけ</small>
              </label>
            </div>
            <p className="hint">
              公開の部屋は「募集中の部屋」に出て、1タップで入ってもらえます。どちらも{CODE_LENGTH}文字の部屋コードでも入れます。フレンドとなら「フレンド」のタブの「招待」が手軽です。
            </p>
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
      {draftRoom ? (
        <section className="panel lobby__draft">
          <h2>ドラフト戦の流れ</h2>
          <ol className="lobby__steps">
            <li>
              公式カード「{OFFICIAL_SET.name}」の表向きの場（いつも{BALANCE.draft.field}枚）から、2人で交互に1枚ずつ取ります。取るたびに伏せた山から1枚補充されます。
            </li>
            <li>
              1回取ると同じカードが{BALANCE.draft.copies}枚デッキに入ります。{BALANCE.draft.takes}回ずつ取ると、どちらも{BALANCE.deck.size}枚のデッキが完成します（レア・エピックはデッキの上限まで）。
            </li>
            <li>できたデッキでそのまま対戦。先攻・後攻はランダムです。終わったら「同じデッキでもう一戦」もできます。</li>
          </ol>
          <p className="hint">
            1回の制限時間は{BALANCE.online.draftPickSeconds}秒（時間切れは「おまかせ」で代わりに取り、負けにはなりません）。
            <a className="dlink" href="#/official">
              <UiIcon name="book-cover" />
              公式カードを見る
            </a>
          </p>
        </section>
      ) : (
        <section className="panel">
          <h2>使うデッキ</h2>
          {mode === 'join' && <p className="hint">入る部屋がドラフトの部屋なら、デッキは使いません（そのまま「入る」でかまいません）。</p>}
          <DeckPicker choices={choices} selected={selected} onSelect={setDeckKey} />
        </section>
      )}
      {busy && <div className="notice">サーバーとやりとりしています…</div>}
      {error && <div className="notice notice--ng">{error}</div>}
      <p className="hint">
        先攻・後攻はランダム（ドラフトの部屋も同じ）。1ターンの制限時間は{BALANCE.online.turnSeconds}秒で、{BALANCE.online.timeoutLoseCount}
        回続けて時間切れになると負けです。同じブラウザで開き直せば、対戦の続きに戻れます。
      </p>
      <div className="savebar lobby-bar">
        <span className="lobby-bar__sum">
          <UiIcon name="world" />
          <span>
            {draftRoom ? <b>ドラフト（公式カード）</b> : <b className="u-name">{selected?.name || selected?.label || 'デッキ未選択'}</b>}
            <small>
              {mode === 'create' ? `${listed ? '公開' : '合言葉'}・${rulesSummary(toRules(field, dayNight))}` : code.trim() ? `コード ${code.trim()}` : 'コードを入れてください'}
            </small>
          </span>
        </span>
        {mode === 'create' ? (
          <button type="button" className="btn btn--primary btn--big" disabled={!canEnter || busy} onClick={() => void enter('create')}>
            部屋を作る
          </button>
        ) : (
          <button type="button" className="btn btn--primary btn--big" disabled={!canEnter || busy} onClick={() => void enter('join')}>
            入る
          </button>
        )}
      </div>
      {joiningRoom && (
        <JoinSheet
          title={`「${joiningRoom.hostName || 'プレイヤー'}」さんの部屋に入る`}
          mode={joiningRoom.mode}
          info={
            <p>
              {MODE_LABEL[joiningRoom.mode]}・{rulesSummary(joiningRoom.rules)}・部屋コード {joiningRoom.code}
            </p>
          }
          onJoin={async (c) => {
            syncName();
            const res = await enterRoom({
              op: 'join',
              code: joiningRoom.code,
              name,
              ...(c ? { deck: c.deck, cards: c.cards } : {}),
              ...(leader !== 'none' ? { leader } : {}),
              features: [DRAFT_FEATURE],
            });
            if (!res.ok) return res.error;
            setJoiningRoom(null);
            goToRoom();
            return null;
          }}
          onClose={() => setJoiningRoom(null)}
        />
      )}
    </>
  );
}
