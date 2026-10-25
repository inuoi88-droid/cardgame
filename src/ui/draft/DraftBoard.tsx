/**
 * 場から交互に取るドラフトの画面（決定事項 #119。CPU 戦のドラフトとオンラインのドラフトで共用）。
 * - 上に固定した帯：手番の銘板（自分の番は金の縁）・残り時間・あと何回取れるか・レア／エピックの残り・伏せた山の枚数・おまかせ
 * - 表向きの場（ふつう6枚）：カードは一覧と同じ大きさの面（スマホは2列でスクロール、PC は3列）。押すと詳細（CardDetail）と「これを取る」。
 *   取れないカードは見えたまま、理由の札（「レアは上限」など）を付ける。山から新しく出たカードだけを少し光らせる（動きを減らす設定では光らない）
 * - あなたのデッキ・相手のデッキ（両者が取ったカードは公開）：枚数・レアリティの残り・コスト分布・コスト順の行（押すと詳細）
 * - 終わったら両者のデッキを並べ、呼び出し側の操作（対戦へ・保存など）を出す
 * 何を取れるかはエンジンの draftView（takeable）だけを見る。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BALANCE, RARITY_LABEL, type battle, type CardDef, type draft } from '../../engine/index.ts';
import { CardArtOf } from '../components/CardArt.tsx';
import { CardDetail } from '../components/CardDetail.tsx';
import { CardView } from '../components/CardView.tsx';
import { CostCurve } from '../components/CostCurve.tsx';
import { RarityGem } from '../components/cardParts.tsx';
import { UiIcon } from '../components/UiIcon.tsx';
import { useMediaQuery } from '../components/dialogUtil.ts';
import { useHeightVar } from '../collection/sticky.ts';
import { sfx } from '../sound/index.ts';
import { cx } from '../util.ts';
import { EMPTY_TRACK, deckRows, lastPickText, rarityRoom, shortReason, takenDeck, takenTotal, trackField } from './draftUi.ts';
import './draft.css';

type PlayerId = battle.PlayerId;
const D = BALANCE.draft;

export interface DraftBoardView extends draft.DraftView {
  /** 両者の「おまかせ」（オンラインだけ） */
  auto?: [boolean, boolean];
}

export interface DraftBoardProps {
  view: DraftBoardView;
  me: PlayerId;
  /** 席ごとの表示名（自分の席は「あなた」と出す） */
  names: readonly [string, string];
  /** 相手の肖像（game-icons の名前） */
  oppGi: string;
  /** 今のピックの残り秒（制限時間が無ければ null） */
  timeLeft?: number | null;
  /** 残りがこの秒数以下なら目立たせる（自分の番だけ） */
  warnSeconds?: number;
  /** 残り時間の札の説明（時間切れのときどうなるか） */
  timerHint?: string;
  /** 自分が続けて時間切れになった回数（オンラインだけ。1以上なら帯に「時間切れ n/上限」を出す） */
  timeouts?: number;
  /** 送っている途中（取るボタンを止める） */
  busy?: boolean;
  /** 相手（CPU）が考えている途中 */
  thinking?: boolean;
  onTake: (cardId: string) => void;
  /** おまかせの入れ切り（無ければボタンを出さない） */
  onAuto?: (on: boolean) => void;
  error?: string | null;
  /** 帯の右に足す札（接続状態など） */
  status?: ReactNode;
  /** 終わったときの説明と操作 */
  doneNote?: ReactNode;
  doneActions?: ReactNode;
}

type Zoom = { card: CardDef; where: 'field'; index: number } | { card: CardDef; where: 'deck'; owner: PlayerId; count: number };

export function DraftBoard(props: DraftBoardProps) {
  const { view, me, names, oppGi, timeLeft = null, warnSeconds = 10, timerHint, timeouts = 0, busy = false, thinking = false, onTake, onAuto, error, status } = props;
  const opp = (1 - me) as PlayerId;
  const wide = useMediaQuery('(min-width: 920px)');
  // 狭いスマホでは銘板に相手の名前を出さない（名前は接続の札にある。手番が替わっても帯の高さを変えない）
  const narrow = useMediaQuery('(max-width: 480px)');
  useHeightVar('--topbar-h', '.topbar');
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const [tab, setTab] = useState<'me' | 'opp'>('me');

  // 場のカードのキー（補充をまたいで同じカードは同じキー。新しく出たカードは fresh）。描画中に前の並びから求める（純粋な trackField）
  const idsKey = view.field.map((c) => c.id).join('|');
  const [track, setTrack] = useState(() => trackField(EMPTY_TRACK, view.field.map((c) => c.id)));
  let cur = track;
  if (track.ids.join('|') !== idsKey) {
    cur = trackField(track, view.field.map((c) => c.id));
    setTrack(cur);
  }
  const fresh = useMemo(() => new Set(cur.fresh), [cur.fresh]);

  // 手番が変わったら、開いていた場のカードの詳細はそのまま（取るボタンの可否だけ変わる）。場から消えたカードの詳細は閉じる
  useEffect(() => {
    if (zoom?.where === 'field' && view.field[zoom.index]?.id !== zoom.card.id) setZoom(null);
  }, [view.field, zoom]);

  const myTurn = view.turn === me && !view.done;
  const auto = view.auto ?? [false, false];
  const last = lastPickText(view, me, names);
  const nameOf = (p: PlayerId) => (p === me ? 'あなた' : names[p] || '相手');

  const take = (cardId: string) => {
    if (!myTurn || busy) return;
    // 効果音（決定事項 #127）：取った
    sfx('draft.pick');
    onTake(cardId);
    setZoom(null);
  };

  // 効果音：相手が取った（控えめ）・自分の分を「おまかせ」が取った。自分で取った分は take で鳴らしている
  const seenPicks = useRef(view.picks.length);
  useEffect(() => {
    const before = seenPicks.current;
    seenPicks.current = view.picks.length;
    if (view.picks.length <= before) return;
    const fresh = view.picks.slice(before);
    if (fresh.some((p) => p.player === me && p.by)) sfx('draft.pick');
    else if (fresh.some((p) => p.player !== me)) sfx('draft.pick', { gain: 0.5 });
  }, [view.picks, me]);

  if (view.done) return <DraftDone {...props} onCard={(card, owner, count) => setZoom({ card, where: 'deck', owner, count })} zoom={zoom} onCloseZoom={() => setZoom(null)} />;

  const zoomInfo = zoom?.where === 'field' ? view.takeable[zoom.index] : undefined;
  const zoomReason = zoom?.where === 'field' ? shortReason(zoomInfo, zoom.card) : null;

  const lastLine = last ?? (view.picks.length === 0 ? `${view.first === me ? 'あなた' : nameOf(opp)}から取ります。` : '');
  // スマホは直前の取得を固定した帯の中に1行で出す（下を読んでいる間に場のカードが替わっても、何が起きたかわかるように）
  const ticker = (
    <p className="dbar__ticker" aria-live="polite" title={lastLine}>
      {lastLine}
    </p>
  );
  const limit = BALANCE.online.timeoutLoseCount;
  const info = (
    <div className="dboard__info">
      {wide && (
        <p className="dboard__last" aria-live="polite" title={lastLine}>
          {lastLine}
        </p>
      )}
      {timeouts > 0 && (
        <span className="dstat is-out dstat--timeouts" title={`${limit}回続けて時間切れになると、自分で取るまで「おまかせ」になります（負けにはなりません）`}>
          時間切れ <b>{timeouts}</b>/{limit}
        </span>
      )}
      <span className="dstat dstat--pile" title="伏せた山の残り（中身と順番は見えません）">
        <UiIcon name="card-random" />
        山 {view.pileSize}
      </span>
      {auto[opp] && (
        <span className="dstat dstat--auto" title="相手は「おまかせ」で取っています">
          <UiIcon name="robot-grab" />
          相手はおまかせ
        </span>
      )}
      {status}
      {onAuto && (
        <button type="button" className={cx('btn btn--small dboard__auto', auto[me] && 'is-on')} aria-pressed={auto[me]} onClick={() => onAuto(!auto[me])} disabled={busy}>
          <UiIcon name="robot-grab" />
          {auto[me] ? 'おまかせ中（自分で選ぶ）' : 'おまかせ'}
        </button>
      )}
    </div>
  );

  return (
    <section className="dboard" aria-label="ドラフト">
      <div className="dbar">
        <div className={cx('dbar__turn', myTurn ? 'is-mine' : 'is-opp')} aria-live="polite">
          <UiIcon name={myTurn ? 'visored-helm' : `gi:${oppGi}`} className="dbar__gi" />
          <span className="dbar__who">
            {myTurn ? (
              'あなたの番'
            ) : narrow ? (
              '相手の番'
            ) : (
              <>
                <span className="u-name">{nameOf(opp)}</span>の番
              </>
            )}
          </span>
          {thinking && !myTurn && <span className="dbar__think" aria-label="選んでいます" />}
          {timeLeft !== null && (
            <span className={cx('dbar__time', myTurn && timeLeft <= warnSeconds && 'is-warn')} title={timerHint ?? 'このピックの残り時間'}>
              <UiIcon name="stopwatch" />
              {timeLeft}秒
            </span>
          )}
        </div>
        <div className="dbar__stats">
          <span className="dstat" title="あなたがあと取れる回数">
            残<b>{view.takesLeft[me]}</b>回
          </span>
          <span className="dstat dstat--rar">
            {rarityRoom(view.taken[me]).map((r) => (
              <span key={r.rarity} className={cx('dstat__rar', r.takesLeft === 0 && 'is-out')} title={`${RARITY_LABEL[r.rarity]}はあと${r.takesLeft}回取れます（デッキに${r.limit}枚まで）`}>
                <RarityGem rarity={r.rarity} />
                <span className="dstat__rarname">{RARITY_LABEL[r.rarity]}</span>残<b>{r.takesLeft}</b>
                <span className="sr">回</span>
              </span>
            ))}
          </span>
        </div>
        {wide ? info : ticker}
      </div>
      {!wide && info}
      {error && <div className="notice notice--ng">{error}</div>}

      <div className="dboard__main">
        <div className="dfield" role="list" aria-label={`場のカード（${view.field.length}枚）`}>
          {view.field.map((def, i) => {
            const info = view.takeable[i];
            const reason = shortReason(info, def);
            const key = cur.keys[i] ?? `i${i}`;
            return (
              <div key={key} role="listitem" className={cx('dcard', fresh.has(key) && 'is-new', reason && 'is-blocked')}>
                <div className="dcard__face">
                  <CardView card={def} size="sm" onClick={() => setZoom({ card: def, where: 'field', index: i })} actionLabel={`${def.name}の詳細を見る`} />
                </div>
                <div className="dcard__foot">
                  {reason ? (
                    <span className="dcard__no" title={info?.message}>
                      <UiIcon name="cancel" />
                      {reason}
                    </span>
                  ) : myTurn ? (
                    <button type="button" className="btn btn--primary btn--small dcard__take" disabled={busy} onClick={() => take(def.id)} aria-label={`「${def.name}」を取る（${D.copies}枚入る）`}>
                      取る
                    </button>
                  ) : (
                    <span className="dcard__ok">取れます</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="dboard__side">
          {wide ? (
            <>
              <DeckPanel title="あなたのデッキ" label="あなたのデッキ" owner={me} taken={view.taken[me]} gi="visored-helm" onCard={(card, count) => setZoom({ card, where: 'deck', owner: me, count })} />
              <DeckPanel title={<OppTitle name={nameOf(opp)} />} label={`${nameOf(opp)}のデッキ`} owner={opp} taken={view.taken[opp]} gi={oppGi} onCard={(card, count) => setZoom({ card, where: 'deck', owner: opp, count })} small />
            </>
          ) : (
            <>
              <div className="tabs dboard__tabs" role="tablist" aria-label="どちらのデッキを見るか">
                <button type="button" role="tab" aria-selected={tab === 'me'} className={cx('tab', tab === 'me' && 'is-active')} onClick={() => setTab('me')}>
                  あなた {takenTotal(view.taken[me])}/{BALANCE.deck.size}
                </button>
                <button type="button" role="tab" aria-selected={tab === 'opp'} className={cx('tab', tab === 'opp' && 'is-active')} onClick={() => setTab('opp')}>
                  {nameOf(opp)} {takenTotal(view.taken[opp])}/{BALANCE.deck.size}
                </button>
              </div>
              {tab === 'me' ? (
                <DeckPanel title="あなたのデッキ" label="あなたのデッキ" owner={me} taken={view.taken[me]} gi="visored-helm" onCard={(card, count) => setZoom({ card, where: 'deck', owner: me, count })} bare />
              ) : (
                <DeckPanel title={<OppTitle name={nameOf(opp)} />} label={`${nameOf(opp)}のデッキ`} owner={opp} taken={view.taken[opp]} gi={oppGi} onCard={(card, count) => setZoom({ card, where: 'deck', owner: opp, count })} bare />
              )}
            </>
          )}
        </div>
      </div>

      {zoom && (
        <CardDetail
          card={zoom.card}
          onClose={() => setZoom(null)}
          statusFirst={zoom.where === 'field'}
          hideValidity
          status={
            zoom.where === 'deck' ? (
              `${zoom.owner === me ? 'あなた' : nameOf(opp)}のデッキに${zoom.count}枚`
            ) : zoomReason ? (
              // 取れない理由は下の操作の欄（スマホでは画面の下に固定）に出す
              undefined
            ) : myTurn ? (
              `取ると${D.copies}枚デッキに入ります`
            ) : (
              `${nameOf(opp)}の番です（あなたの番になると取れます）`
            )
          }
          actions={
            zoom.where !== 'field' ? undefined : zoomReason ? (
              <p className="dcard__nonote text-ng">
                <UiIcon name="cancel" />
                取れません：{zoomInfo?.message ?? zoomReason}
              </p>
            ) : myTurn ? (
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => take(zoom.card.id)}>
                これを取る（{D.copies}枚入る）
              </button>
            ) : undefined
          }
        />
      )}
    </section>
  );
}

/** 取ったカードの一覧（枚数・レアリティの残り・コスト分布・コスト順の行） */
export function DeckPanel({
  title,
  label,
  owner,
  taken,
  gi,
  onCard,
  small = false,
  bare = false,
}: {
  title: ReactNode;
  /** 読み上げの名前 */
  label: string;
  owner: PlayerId;
  taken: readonly draft.DraftTaken[];
  gi: string;
  onCard: (card: CardDef, count: number) => void;
  /** コスト分布を省く（PC の相手の欄） */
  small?: boolean;
  /** 枠なし（タブの中） */
  bare?: boolean;
}) {
  const total = takenTotal(taken);
  const rows = useMemo(() => deckRows(taken), [taken]);
  const deck = useMemo(() => takenDeck(taken), [taken]);
  return (
    <section className={cx('dpanel', bare ? 'dpanel--bare' : 'panel')} aria-label={label} data-owner={owner}>
      <div className="dpanel__head">
        <h2 className={cx(bare && 'sr')}>
          <UiIcon name={gi.startsWith('gi:') ? (gi as `gi:${string}`) : `gi:${gi}`} className="dpanel__gi" />
          {title}
        </h2>
        <span className="dpanel__count">
          <b>{total}</b>/{BALANCE.deck.size}枚
        </span>
        {rarityRoom(taken).map((r) => (
          <span key={r.rarity} className={cx('dpanel__rar', r.takesLeft === 0 && 'is-out')}>
            <RarityGem rarity={r.rarity} />
            {total >= BALANCE.deck.size ? `${RARITY_LABEL[r.rarity]} ${r.copies}/${r.limit}枚` : `${RARITY_LABEL[r.rarity]}残${r.takesLeft}回（${r.copies}/${r.limit}枚）`}
          </span>
        ))}
      </div>
      {total === 0 ? (
        <p className="hint">まだ取っていません。</p>
      ) : (
        <>
          {!small && <CostCurve deck={deck} cards={deck.cards} compact />}
          <ul className="drows">
            {rows.map(({ card, count }) => (
              <li key={card.id}>
                <button type="button" className="drow" onClick={() => onCard(card, count)} aria-label={`${card.name}（${count}枚）の詳細を見る`}>
                  <span className="drow__cost" aria-label={`コスト${card.cost}`}>
                    {card.cost}
                  </span>
                  <CardArtOf card={card} size="1.5em" />
                  <span className="drow__name">{card.name}</span>
                  <RarityGem rarity={card.rarity} withLabel="sr" />
                  <b className="drow__n">×{count}</b>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** 相手のデッキの見出し（名前は人が入れた字なので名前の書体） */
function OppTitle({ name }: { name: string }) {
  return (
    <>
      <span className="u-name">{name}</span>のデッキ
    </>
  );
}

/** 終わったドラフト：両者のデッキを並べる */
function DraftDone({
  view,
  me,
  names,
  oppGi,
  doneNote,
  doneActions,
  error,
  onCard,
  zoom,
  onCloseZoom,
}: DraftBoardProps & { onCard: (card: CardDef, owner: PlayerId, count: number) => void; zoom: Zoom | null; onCloseZoom: () => void }) {
  const opp = (1 - me) as PlayerId;
  const oppName = names[opp] || '相手';
  return (
    <section className="dboard dboard--done" aria-label="ドラフトの結果">
      <div className="dboard__donehead">
        <h2>
          <UiIcon name="check-mark" />
          ドラフト完了
        </h2>
        {doneNote && <div className="dboard__donenote">{doneNote}</div>}
      </div>
      {error && <div className="notice notice--ng">{error}</div>}
      <div className="dboard__decks">
        <DeckPanel title="あなたのデッキ" label="あなたのデッキ" owner={me} taken={view.taken[me]} gi="visored-helm" onCard={(c, n) => onCard(c, me, n)} />
        <DeckPanel title={<OppTitle name={oppName} />} label={`${oppName}のデッキ`} owner={opp} taken={view.taken[opp]} gi={oppGi} onCard={(c, n) => onCard(c, opp, n)} />
      </div>
      {doneActions && <div className="dboard__donebar">{doneActions}</div>}
      {zoom && <CardDetail card={zoom.card} onClose={onCloseZoom} status={zoom.where === 'deck' ? `${zoom.owner === me ? 'あなた' : oppName}のデッキに${zoom.count}枚` : undefined} />}
    </section>
  );
}
