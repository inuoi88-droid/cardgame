/**
 * 対戦画面の本体。CPU 戦とオンライン対戦で共用する。
 * - 表示は viewFor() で相手の非公開情報を隠した状態（view）から作り、行動は onAction で親に渡す
 * - 画面は 100dvh の固定レイアウト（ページはスクロールしない。場だけ内部スクロール）
 * - 相手の行動は useReplay（イベント再生層）が順に演出する。どこかをタップすると残りを一気に反映する
 * - 操作はドラッグ＆ドロップ（useDrag・dragLogic）：手札のカードを場（対象のあるカードは光る対象）へ、
 *   攻撃できるモンスターを相手へ。タップ（クリック）はどのカードでも詳細を開く。
 *   詳細の「使う」「攻撃する」からは、候補ボタンで対象を選ぶ（キーボード・ドラッグしにくいとき用）
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BALANCE, FIELDS, LEADERS, TRIBE_IDS, battle, describeEffect, getEffect, type CardDef } from '../../engine/index.ts';
import { abilityGlossary, mechanicGlossary } from '../glossary.ts';
import { CardView } from '../components/CardView.tsx';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { Modal } from '../components/controls.tsx';
import { useIsPhone, useMediaQuery } from '../components/dialogUtil.ts';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/Toast.tsx';
import { navigate } from '../router.ts';
import { cx } from '../util.ts';
import { preloadIcons } from '../icons/load.ts';
import { iconText } from '../icons/ref.ts';
import { UiIcon } from '../components/UiIcon.tsx';
import { sfx } from '../sound/index.ts';
import { SettingsPanel } from '../settings/SettingsPanel.tsx';
import { useBgmScene } from '../sound/bgmScene.ts';
import { FeedbackButton, FeedbackSheet } from '../feedback/FeedbackSheet.tsx';
import { matchCards, matchContext } from '../feedback/feedbackLogic.ts';
import './battle.css';
import { CardDetailBody, CardDetailSheet, NoiseDetailBody } from './CardDetail.tsx';
import {
  AbilityChoiceSheet,
  CardRow,
  ChoiceDialog,
  EnlistSheet,
  ModeDialog,
  MulliganDialog,
  needsPaySheet,
  payFields,
  PaySheet,
  ResultDialog,
  resultTexts,
  ZoomModal,
  type PayChoice,
} from './dialogs.tsx';
import { DragLayer } from './DragLayer.tsx';
import { previewActionOf, resolveDrop, resolveModeDrop, parseSpot, targetKey, type DragSource } from './dragLogic.ts';
import { DamagePreview } from './DamagePreview.tsx';
import { keyOf } from './events.ts';
import type { FxDirector, FxEnv } from './fx/director.ts';
import { FxLayer } from './fx/FxLayer.tsx';
import { buildRecap } from './fx/recap.ts';
import { RecapButton, RecapLogButton, RecapPanel, RecapStrip, useRecapState } from './fx/Recap.tsx';
import { fxPreload } from './fx/registry.ts';
import { useFxLevel } from './fx/settings.ts';
import { logNamesOf } from './logFormat.ts';
import { EnergyGem, grownDef, HandCard, MatchBand, LogPanel, LogText, MonsterTile, PlayerPanel, PowersList, type ActivateButton, type TribeProgress } from './parts.tsx';
import { useBattleDrag, type DropResult } from './useDrag.ts';
import { useOverlay, useReplay, type OverlayStore } from './useReplay.ts';

type GameState = battle.GameState;
type TargetRef = battle.TargetRef;

/**
 * 対象選びの途中のもの。card は手札・捨て札（from）のカード、activate は起動（MTG 要素 ○ バッチC1）、channel は魂力・予見（ability）。
 * pay はカードの支払い（キッカー・再活の捨てる手札・脱出の除外する捨て札・△ バッチB の追加の支払い）。決めたものだけ入る。
 * discardAbility は捨て札のカードの能力（MTG 要素 △ バッチB：相続・発掘・不朽）
 */
/** mode はモード選択のカード（MTG 要素 ○ バッチC2）で選んだモード（0 は双呪）、modes は放題（△ バッチB）で選んだモード */
/** from は捨て札（○ バッチC1）・待機ゾーン（△ バッチC）から使うとき */
type CardSel = { kind: 'card'; uid: string; from?: 'discard' | 'waiting'; enemy?: TargetRef; ally?: string; pay?: PayChoice; mode?: number; modes?: number[] };
type Selection =
  | null
  | CardSel
  | { kind: 'attacker'; uid: string }
  | { kind: 'activate'; uid: string; use?: battle.ActivateUse; enemy?: TargetRef; ally?: string }
  /** 裏向きの自分のモンスターを表にする（MTG 要素 △ バッチC） */
  | { kind: 'reveal'; uid: string; enemy?: TargetRef; ally?: string }
  | { kind: 'channel'; uid: string; ability?: 'channel' | 'forecast'; enemy?: TargetRef; ally?: string }
  | { kind: 'discardAbility'; uid: string; ability: battle.DiscardAbilityKind; enemy?: TargetRef; ally?: string };
type TargetSel = Exclude<Selection, null | { kind: 'attacker' }>;

/** 詳細を開いているもの（discard は自分の捨て札のカード：捨て札から使う） */
type Detail =
  | { kind: 'hand'; uid: string }
  | { kind: 'monster'; uid: string }
  | { kind: 'card'; cardId: string }
  | { kind: 'discard'; uid: string }
  | { kind: 'power'; player: battle.PlayerId; uid: string }
  /** 待機ゾーンのカード（MTG 要素 △ バッチC。自分のなら「待機ゾーンから使う」） */
  | { kind: 'waiting'; player: battle.PlayerId; uid: string };

/** 起動の情報の鍵（同じカードに Lvアップ・忠誠+1／−K など複数ある：MTG 要素 △ バッチC） */
const actKey = (uid: string, use?: battle.ActivateUse) => `${uid}|${use ?? ''}`;
/** 起動の使い方ごとのボタンの印 */
const USE_ICON: Record<battle.ActivateUse, string> = { level: '⬆', plus: '+', minus: '−' };

/** 対象の候補と、使えない理由（使う・捨て札から使う・起動・魂力で共通の形） */
interface TargetInfo {
  blocked: string | null;
  enemyTargets: TargetRef[];
  allyTargets: string[];
  warnings: string[];
  tauntLimited: boolean;
  cost: number;
  targetCosts?: Record<string, number>;
}

const sameRef = (a: TargetRef, b: TargetRef) =>
  a.kind === 'player' ? b.kind === 'player' && a.player === b.player : b.kind === 'monster' && a.uid === b.uid;

export interface BattleBoardProps {
  /** 自分から見える状態（viewFor の結果） */
  view: GameState;
  me: battle.PlayerId;
  /** 行動を送る（画面側で事前に検証済み） */
  onAction: (a: battle.Action) => void;
  /** 親からのエラー（サーバーに断られたなど） */
  error?: string | null;
  /** 通信中で操作を受け付けない */
  busy?: boolean;
  /** 見出しに出す情報（残り時間、相手の接続状態など） */
  status?: ReactNode;
  /** 相手の呼び方（「CPU」「相手」など） */
  opponentLabel: string;
  /** 結果ダイアログに出すボタン */
  resultButtons: ReactNode;
  /**
   * 決着したあと、操作バーの「結果を見る」の前に置くもの（「相手のデッキ」など。決定事項 #122）。
   * スマホではボタンの文字（.btn__label）を隠して形だけにする（決定事項 #124：結果を見る・もう一戦が画面の外に出ないように）
   */
  endActions?: ReactNode;
  /** 決着したあとの操作バーの主役（オンラインの「もう一戦」）。あれば「結果を見る」は金ではなくなる */
  endPrimary?: ReactNode;
  /** マリガン・選択ダイアログの中に出す残り時間（オンライン） */
  timeLeft?: ReactNode;
  /** 新しい状態の演出を再生し終えたとき（演出がなければすぐ）。CPU 戦が次の手を打つ合図に使う */
  onReplayDone?: () => void;
  /** メニュー（⋯）に足す項目（「対戦の準備に戻る」など） */
  menuItems?: ReactNode;
  /** 相手の肖像（PC の銘板。game-icons の名前。CPU は強さで形が変わる：BattlePage。UI2） */
  opponentPortrait?: string;
  /** 報告・要望（決定事項 #129）に添える、画面からの補足（CPU の強さ・デッキ名、部屋の形式など） */
  feedbackExtra?: Record<string, unknown>;
}

/** 攻撃できない理由を、タイルに出す短い言葉にする */
function shortBlock(reason: string | null): string | null {
  if (!reason) return null;
  if (reason.includes('場に出たターン')) return '次のターンから';
  if (reason.includes('もう攻撃')) return '攻撃済み';
  if (reason.includes('凍結')) return '凍結中';
  if (reason.includes('混乱')) return '混乱中';
  if (reason.includes('裏切')) return '裏切り';
  return null;
}

export function BattleBoard({
  view,
  me,
  onAction,
  error,
  busy = false,
  status,
  opponentLabel,
  resultButtons,
  endActions,
  endPrimary,
  timeLeft,
  onReplayDone,
  menuItems,
  opponentPortrait,
  feedbackExtra,
}: BattleBoardProps) {
  const opp = battle.other(me);
  const confirm = useConfirm();
  const toast = useToast();
  const phone = useIsPhone(919);
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  // カードの絵を先に読んでおく（両方のデッキのうち見えているカード・トークンなどの特別なカード・リーダー・フィールド）。
  // 相手のカードやトークンが初めて出る演出の途中で、絵が空の円盤にならないように（決定事項 #106）
  const cardCount = Object.keys(view.cards).length;
  useEffect(() => {
    const b = BALANCE.battle;
    preloadIcons([
      ...Object.values(view.cards).map((c) => c.icon),
      b.tokenArt,
      b.armyArt,
      b.eggArt,
      b.faceDownArt,
      b.siegeArt,
      ...Object.values(LEADERS).map((l) => l.art),
      ...Object.values(FIELDS).map((f) => f.art),
      // 演出の形（決定事項 #126）：見えているカードの効果・キーワード・デメリット・能力と、知らせの形
      ...fxPreload(Object.values(view.cards)).map((n) => `gi:${n}`),
    ]);
    // view.cards は手番ごとに作り直されるので、カードの数が変わったときだけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardCount]);
  const [sel, setSel] = useState<Selection>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [pile, setPile] = useState<{ player: battle.PlayerId; kind: 'discard' | 'exile' } | null>(null);
  /** 開いている待機ゾーンの一覧（MTG 要素 △ バッチC） */
  const [waitingOpen, setWaitingOpen] = useState<battle.PlayerId | null>(null);
  const [zoom, setZoom] = useState<CardDef | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // 報告・要望のシート（決定事項 #129）：結果の画面からは 'result'、対戦の途中にメニューからは 'battle'
  const [feedbackFrom, setFeedbackFrom] = useState<'result' | 'battle' | null>(null);
  // スマホの帯から開く：プレイヤーの詳細・自分のパワーの一覧
  const [playerOpen, setPlayerOpen] = useState<battle.PlayerId | null>(null);
  const [powersOpen, setPowersOpen] = useState(false);
  const [resultHidden, setResultHidden] = useState(false);
  // 結果ダイアログは演出が終わって少し待ってから出す（演出を飛ばしたタップで閉じてしまわないように）
  const [resultReady, setResultReady] = useState(false);
  const [hover, setHover] = useState<{ el: HTMLElement; def: CardDef } | null>(null);
  const skipEndConfirm = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 演出（決定事項 #126）：1枚の層と、その本体（FxDirector）。位置の手がかりは最新の view から
  const fx = useFxLevel();
  const fxRef = useRef<FxDirector | null>(null);
  const viewRefForFx = useRef(view);
  viewRefForFx.current = view;
  const fxEnv = useRef<FxEnv>({ me, playerHp: view.players[me].maxHp, ownerOfKey: () => null });
  fxEnv.current = {
    me,
    playerHp: view.players[me].maxHp,
    ownerOfKey: (key) => {
      const v = viewRefForFx.current;
      const m = battle.findMonster(v, key);
      if (m) return m.controller;
      for (const p of [0, 1] as const) if ([...v.players[p].powers, ...(v.players[p].emblems ?? [])].some((pw) => pw.uid === key)) return p;
      return null;
    },
  };
  const replay = useReplay(view, me, onReplayDone, { fx: fxRef, level: fx.level });
  // 盤面が描き直されたら（タイルが出た・消えた・状態が進んだ）、演出の層の位置の読み置きを捨てる
  useLayoutEffect(() => {
    fxRef.current?.invalidate();
  }, [view, replay.hidden, replay.ghosts, phone]);
  // 相手のターンのまとめ（決定事項 #126）：自分のターンになって演出が終わったら帯を出し、少しして畳む
  const recap = useMemo(() => (view.phase === 'main' || view.phase === 'ended' ? buildRecap(view.log, view, me) : null), [view, me]);
  const recapReady = !!recap && view.phase === 'main' && view.active === me && !replay.playing;
  const recapUi = useRecapState(recap ? recap.turn : null, recapReady);
  const ended = view.phase === 'ended' && !!view.result;
  useEffect(() => {
    if (!ended || replay.playing) {
      setResultReady(false);
      return;
    }
    const t = setTimeout(() => setResultReady(true), 450);
    return () => clearTimeout(t);
  }, [ended, replay.playing]);

  // 新しい対戦が始まったら、ターン終了の確認の設定を戻す
  useEffect(() => {
    if (view.phase === 'mulligan') skipEndConfirm.current = false;
  }, [view.phase]);

  // 効果音（決定事項 #127）：対戦の始め（最初の手札を決める）に山札を切る音、決着の結果が出たら勝ち・負け・引き分け
  const choosingHand = view.phase === 'mulligan' && !view.players[me].mulligan.done;
  useEffect(() => {
    if (choosingHand) sfx('card.shuffle');
  }, [choosingHand]);
  const resultSound = ended && resultReady && view.result ? (view.result.winner === null ? 'draw-game' : view.result.winner === me ? 'victory' : 'defeat') : null;
  useEffect(() => {
    if (resultSound) sfx(resultSound);
  }, [resultSound]);
  // BGM（決定事項 #128）：対戦中は対戦の曲。決着の演出が終わって結果が出たら（勝ち・負けの音と一緒に）消す。もう一戦で次の曲。
  // replay.playing は決着の直後に一瞬 false になるので、それを待つ resultReady で決める（消してまた流すのを防ぐ）
  useBgmScene(resultReady ? null : 'battle');

  useEffect(() => {
    if (error) toast({ text: error, kind: 'ng' });
  }, [error, toast]);

  const act = useCallback(
    (action: battle.Action) => {
      if (busy) return;
      const reason = battle.validateAction(view, action);
      if (reason) {
        toast({ text: reason, kind: 'ng' });
        return;
      }
      setSel(null);
      // 効果音（決定事項 #127）：自分の操作の音はここで（演出の card.play は claim で鳴らさない）
      if (action.type === 'playCard') sfx('card.play', { claim: true });
      else if (action.type === 'setAside') sfx('card.play');
      else if (action.type === 'endTurn') sfx('turn.end');
      else if (action.type === 'mulligan' && action.mode !== 'keep') sfx('mulligan');
      onAction(action);
    },
    [busy, view, onAction, toast],
  );

  const mine = view.players[me];
  const theirs = view.players[opp];
  /** 場の種族の数と揃いの進み具合（決定事項 #143）：揃っているもの → 数の多いもの の順 */
  const tribesOf = (p: battle.PlayerId): TribeProgress[] =>
    TRIBE_IDS.map((t) => ({ tribe: t, count: battle.tribeCount(view, p, t), active: battle.tribeSetActive(view, p, t) }))
      .filter((t) => t.count > 0)
      .sort((a, b) => Number(b.active) - Number(a.active) || b.count - a.count);
  // 対戦中に手札へ入ったカード（引いた・サイクリング・引いたときの効果・戻ってきた）を少しの間光らせる
  const prevHand = useRef<Set<string> | null>(null);
  const [freshHand, setFreshHand] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const now = mine.hand.map((c) => c.uid);
    const before = prevHand.current;
    prevHand.current = new Set(now);
    if (!before || view.phase !== 'main') return;
    const added = now.filter((u) => !before.has(u));
    if (added.length === 0) return;
    setFreshHand(new Set(added));
    const t = setTimeout(() => setFreshHand(new Set()), 1600);
    return () => clearTimeout(t);
  }, [mine.hand, view.phase]);
  const myTurn = view.phase === 'main' && view.active === me && !view.pending && !busy;
  // 護法（MTG 要素 ○ バッチB）：エナジーが足りない相手は対象の候補にしない
  const infos = useMemo(
    () =>
      new Map(
        mine.hand.map((c) => {
          const i = battle.playInfo(view, me, c);
          return [c.uid, { ...i, enemyTargets: battle.payableEnemyTargets(i, view.players[me].energy) }];
        }),
      ),
    [view, me, mine.hand],
  );
  // MTG 要素 ○ バッチC1：捨て札から使えるカード・起動・手札から使う能力（サイクリング・魂力）の情報（すべてエンジンから）
  const discardInfos = useMemo(
    () => new Map(battle.discardPlayInfos(view, me).map((i) => [i.card.uid, { ...i, enemyTargets: battle.payableEnemyTargets(i, view.players[me].energy) }])),
    [view, me],
  );
  const activateInfos = useMemo(
    () => new Map(battle.activateInfos(view, me).map((i) => [actKey(i.sourceUid, i.use), { ...i, enemyTargets: battle.payableEnemyTargets(i, view.players[me].energy) }])),
    [view, me],
  );
  /** このカード（モンスター・パワー）の起動（起動・Lvアップ・忠誠+1／−K） */
  const activatesOf = (uid: string) => [...activateInfos.values()].filter((i) => i.sourceUid === uid);
  // MTG 要素 △ バッチC：待機ゾーンから使うカード・裏向きのモンスターを表にする・手札を待機させる（すべてエンジンから）
  const waitingInfos = useMemo(
    () => new Map(battle.waitingPlayInfos(view, me).map((i) => [i.card.uid, { ...i, enemyTargets: battle.payableEnemyTargets(i, view.players[me].energy) }])),
    [view, me],
  );
  const revealInfos = useMemo(
    () => new Map(battle.revealInfos(view, me).map((i) => [i.uid, { ...i, enemyTargets: battle.payableEnemyTargets(i, view.players[me].energy) }])),
    [view, me],
  );
  const setAsides = useMemo(() => new Map(mine.hand.map((c) => [c.uid, battle.setAsideInfo(view, me, c)])), [view, me, mine.hand]);
  const waitingCards = useMemo(() => (mine.waiting ?? []).map((w) => w.card), [mine.waiting]);
  /** 手札・捨て札・待機ゾーンのどこから使うかで、使う情報を選ぶ */
  const pickInfos = (from?: 'discard' | 'waiting') => (from === 'discard' ? discardInfos : from === 'waiting' ? waitingInfos : infos);
  const handAbilities = useMemo(
    () =>
      new Map(
        mine.hand.map((c) => [
          c.uid,
          battle.handAbilityInfos(view, me, c).map((i) => ({ ...i, enemyTargets: battle.payableEnemyTargets(i, view.players[me].energy) })),
        ]),
      ),
    [view, me, mine.hand],
  );
  // 捨て札のカードの能力（MTG 要素 △ バッチB：相続・発掘・不朽）。キーは「uid:能力」
  const discardAbilities = useMemo(
    () => new Map(battle.discardAbilityInfos(view, me).map((i) => [`${i.card.uid}:${i.ability}`, { ...i, enemyTargets: battle.payableEnemyTargets(i, view.players[me].energy) }])),
    [view, me],
  );
  const discardAbilitiesOf = (uid: string) => [...discardAbilities.values()].filter((i) => i.card.uid === uid);
  const usableHandAbilities = (uid: string): battle.HandAbilityKind[] => (myTurn ? (handAbilities.get(uid) ?? []).filter((h) => !h.blocked).map((h) => h.ability) : []);
  const usableSetAside = (uid: string): battle.SetAsideKind[] => (myTurn ? (setAsides.get(uid) ?? []).filter((x) => !x.blocked).map((x) => x.kind) : []);
  const waitingUsable = myTurn ? [...waitingInfos.values()].filter((i) => !i.blocked).length : 0;
  const discardUsable = myTurn ? new Set([...[...discardInfos.values()].filter((i) => !i.blocked), ...[...discardAbilities.values()].filter((i) => !i.blocked)].map((i) => i.card.uid)).size : 0;
  const isPlayable = (c: battle.CardInst) => {
    const i = infos.get(c.uid)!;
    return myTurn && (c.cardId === battle.NOISE_CARD_ID ? mine.energy >= i.cost : !i.blocked || usableHandAbilities(c.uid).length > 0 || usableSetAside(c.uid).length > 0);
  };
  const playableCount = mine.hand.filter(isPlayable).length;
  const readyAttackers = myTurn ? mine.board.filter((m) => !battle.attackBlockReason(view, m)) : [];
  const nothingLeft = myTurn && playableCount === 0 && readyAttackers.length === 0;
  const names = useMemo(() => logNamesOf(view), [view]);

  // ---------------------------------------------------------------- 対象選択（詳細の「使う」・ドラッグで足りない選択）
  /** 選んでいるもののカード（手札・捨て札のカード、魂力のカード）と、その対象の情報 */
  const cardOf = (x: TargetSel): battle.CardInst | undefined =>
    x.kind === 'card'
      ? (x.from === 'discard' ? mine.discard : x.from === 'waiting' ? waitingCards : mine.hand).find((c) => c.uid === x.uid)
      : x.kind === 'channel'
        ? mine.hand.find((c) => c.uid === x.uid)
        : x.kind === 'discardAbility'
          ? mine.discard.find((c) => c.uid === x.uid)
          : undefined;
  const infoOf = (x: TargetSel): TargetInfo | undefined => {
    if (x.kind === 'card') {
      const pi = pickInfos(x.from).get(x.uid);
      // 代わりの使い方（MTG 要素 △ バッチB）：その使い方の候補・コスト（超過は対象なし）
      const alt = x.pay?.alt ? pi?.pay?.alts?.find((a) => a.alt === x.pay!.alt) : undefined;
      if (pi && alt) {
        return { ...pi, blocked: alt.blocked, enemyTargets: battle.payableEnemyTargets(alt, mine.energy), allyTargets: alt.allyTargets, warnings: alt.warnings, cost: alt.cost, targetCosts: alt.targetCosts };
      }
      // モード選択のカード（MTG 要素 ○ バッチC2）：モードを選んだら、そのモードの候補・コスト・注意（放題は組み合わせ）
      const m = x.modes ? pi?.modeCombos?.find((y) => y.modes?.join() === x.modes!.join()) : x.mode !== undefined ? pi?.modes?.find((y) => y.mode === x.mode) : undefined;
      if (pi && m) {
        return { ...pi, blocked: m.blocked, enemyTargets: battle.payableEnemyTargets(m, mine.energy), allyTargets: m.allyTargets, warnings: m.warnings, cost: m.cost, targetCosts: m.targetCosts };
      }
      return pi;
    }
    if (x.kind === 'activate') return activateInfos.get(actKey(x.uid, x.use));
    if (x.kind === 'reveal') return revealInfos.get(x.uid);
    if (x.kind === 'discardAbility') return discardAbilities.get(`${x.uid}:${x.ability}`);
    return handAbilities.get(x.uid)?.find((h) => h.ability === (x.ability ?? 'channel'));
  };
  const targetSel = sel && sel.kind !== 'attacker' ? sel : null;
  const selCard = targetSel ? cardOf(targetSel) : undefined;
  const info = targetSel ? (infoOf(targetSel) ?? null) : null;
  const selDef = selCard
    ? view.cards[selCard.cardId]
    : targetSel?.kind === 'activate'
      ? view.cards[activateInfos.get(actKey(targetSel.uid, targetSel.use))?.cardId ?? '']
      : targetSel?.kind === 'reveal'
        ? view.cards[revealInfos.get(targetSel.uid)?.cardId ?? '']
        : undefined;
  const needEnemy = !!targetSel && !!info && info.enemyTargets.length > 0 && !targetSel.enemy;
  const needAlly = !!targetSel && !!info && info.allyTargets.length > 0 && !targetSel.ally;
  /** 召喚するモンスターのカード自身（自分のモンスターの候補に入っているが、ボタンは別に出す） */
  const selSelf = targetSel?.kind === 'card' ? targetSel.uid : undefined;
  const attacker = sel?.kind === 'attacker' ? battle.findMonster(view, sel.uid) : undefined;
  const attackTargets = attacker ? battle.attackTargets(view, attacker) : [];

  /** 今選べる対象の一覧（バーの候補ボタンにも使う） */
  const candidates: TargetRef[] = needEnemy
    ? info!.enemyTargets
    : needAlly
      ? info!.allyTargets.filter((u) => u !== selSelf).map((uid): TargetRef => ({ kind: 'monster', uid }))
      : attacker
        ? attackTargets
        : [];

  // 対象選択に入ったら最初の候補を見えるところへ
  const selKey = sel ? `${sel.kind}:${sel.uid}:${needEnemy ? 'e' : needAlly ? 'a' : ''}` : '';
  useEffect(() => {
    if (!selKey || candidates.length === 0) return;
    const first = candidates[0]!;
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-fx="${first.kind === 'player' ? (first.player === me ? 'me' : 'opp') : first.uid}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey]);

  // 対象選択中は Esc でやめる
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel]);

  const confirmWarnings = async (i: Pick<TargetInfo, 'warnings'>, def: Pick<CardDef, 'name'>): Promise<boolean> => {
    if (i.warnings.length === 0) return true;
    const capOnly = i.warnings.every((w) => battle.isPowerCapWarning(w));
    return confirm({
      title: capOnly ? `「${def.name}」を使うと古いパワーが消えます` : `「${def.name}」は発動しない効果があります`,
      message: (
        <>
          <ul className="warn-list">
            {i.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p>{capOnly ? '使いますか？' : '発動しない効果はエナジーを払うだけになります。使いますか？'}</p>
        </>
      ),
      okLabel: 'それでも使う',
      cancelLabel: 'やめる',
    });
  };

  /** モードの選択・支払いのシート（MTG 要素 ○ バッチC1・C2・△ バッチB） */
  const [ask, setAsk] = useState<null | { kind: 'pay' | 'mode'; sel: CardSel }>(null);
  /** 後援で休ませる味方を選ぶ攻撃（MTG 要素 △ バッチB） */
  const [enlistAsk, setEnlistAsk] = useState<null | { uid: string; target: TargetRef }>(null);
  /** 捨て札の山に落としたカードの能力が複数あるとき（サイクリング・魂力・予見） */
  const [pileAsk, setPileAsk] = useState<null | { uid: string; abilities: battle.HandAbilityKind[] }>(null);

  const chosenOf = (x: { enemy?: TargetRef; ally?: string }): battle.Chosen => ({ ...(x.enemy ? { enemy: x.enemy } : {}), ...(x.ally ? { ally: x.ally } : {}) });

  /** 対象を選ぶもの（カード・起動・魂力・予見・捨て札の能力）を、足りない選択・支払いのシート・注意の確認を経て行動にする */
  const tryPlay = async (next: TargetSel) => {
    // モード選択のカード（MTG 要素 ○ バッチC2）：まだモードを選んでいなければ、モードの選択シートへ（対象はそのあと）
    if (next.kind === 'card' && next.mode === undefined && next.modes === undefined && pickInfos(next.from).get(next.uid)?.modes) {
      setSel(null);
      setAsk({ kind: 'mode', sel: next });
      return;
    }
    const i = infoOf(next);
    if (!i) return;
    const ready = (i.enemyTargets.length === 0 || next.enemy) && (i.allyTargets.length === 0 || next.ally);
    // 支払いのシート（MTG 要素 △ バッチB。キッカー・再活・脱出も）：対象が決まってから（超過は対象なしで決まる）
    if (next.kind === 'card' && !next.pay?.done) {
      const pi = pickInfos(next.from).get(next.uid);
      if (pi && needsPaySheet(pi, mine.energy) && (ready || pi.pay?.alts?.some((a) => a.alt === 'overload'))) {
        setSel(null);
        setAsk({ kind: 'pay', sel: next });
        return;
      }
    }
    if (!ready) {
      setSel(next);
      return;
    }
    const chosen = chosenOf(next);
    if (next.kind === 'activate') {
      const a = activateInfos.get(actKey(next.uid, next.use));
      if (a && !(await confirmWarnings(a, { name: a.name }))) {
        setSel(null);
        return;
      }
      act({ type: 'activate', player: me, sourceUid: next.uid, chosen, ...(next.use ? { use: next.use } : {}) });
      return;
    }
    if (next.kind === 'reveal') {
      const r = revealInfos.get(next.uid);
      if (r && !(await confirmWarnings(r, { name: r.name }))) {
        setSel(null);
        return;
      }
      act({ type: 'reveal', player: me, uid: next.uid, chosen });
      return;
    }
    if (next.kind === 'discardAbility') {
      const d = discardAbilities.get(`${next.uid}:${next.ability}`);
      if (d && !(await confirmWarnings(d, { name: d.name }))) {
        setSel(null);
        return;
      }
      act({ type: 'discardAbility', player: me, cardUid: next.uid, ability: next.ability, chosen });
      return;
    }
    if (next.kind === 'channel') {
      const card = cardOf(next);
      const def = card ? view.cards[card.cardId] : undefined;
      if (def && !(await confirmWarnings(i, def))) {
        setSel(null);
        return;
      }
      act({ type: 'handAbility', player: me, cardUid: next.uid, ability: next.ability ?? 'channel', chosen });
      return;
    }
    const card = cardOf(next);
    if (!card) return;
    const pay = next.pay ?? {};
    const def = view.cards[card.cardId];
    if (def && !(await confirmWarnings(i, def))) {
      setSel(null);
      return;
    }
    act({
      type: 'playCard',
      player: me,
      cardUid: next.uid,
      chosen: pay.alt === 'overload' ? {} : chosen,
      ...(next.from ? { from: next.from } : {}),
      ...payFields(pay),
      ...(next.modes !== undefined ? { modes: next.modes } : next.mode !== undefined ? { mode: next.mode } : {}),
    });
  };

  /** 攻撃（MTG 要素 △ バッチB：後援できるなら、休ませる味方を先に選ぶ） */
  const tryAttack = (uid: string, target: TargetRef) => {
    const m = battle.findMonster(view, uid);
    if (m && battle.enlistOptions(view, m).length > 0) {
      setSel(null);
      setEnlistAsk({ uid, target });
      return;
    }
    act({ type: 'attack', player: me, attackerUid: uid, target });
  };

  /** 手札から使う能力（サイクリング・魂力）：確認してから使う。魂力で対象が要れば対象選びへ */
  const tryHandAbility = async (uid: string, ability: battle.HandAbilityKind) => {
    const card = mine.hand.find((c) => c.uid === uid);
    const h = handAbilities.get(uid)?.find((x) => x.ability === ability);
    const def = card ? view.cards[card.cardId] : undefined;
    if (!card || !h || !def) return;
    if (h.blocked) {
      toast({ text: h.blocked, kind: 'ng' });
      return;
    }
    const channelText = def.effects.filter((e) => e.timing === ability).map((e) => describeEffect(e, def));
    const ok = await confirm({
      title: `${h.name}：「${def.name}」`,
      message:
        ability === 'cycling' ? (
          <p>
            エナジー{h.cost}でこのカードを捨て、カードを1枚引きます（カードを使ったことには数えません）。
          </p>
        ) : (
          <>
            <p>
              {ability === 'forecast'
                ? `エナジー${h.cost}でこのカードを相手に見せ、次の効果を使います（カードは手札に残ります。1ターン1回）。`
                : `エナジー${h.cost}でこのカードを捨て、次の効果を使います（カードを使ったことには数えません）。`}
            </p>
            <ul className="warn-list kick-list">
              {channelText.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </>
        ),
      okLabel: `${h.name}（⚡${h.cost}）`,
      cancelLabel: 'やめる',
    });
    if (!ok) return;
    if (ability === 'cycling') {
      act({ type: 'handAbility', player: me, cardUid: uid, ability: 'cycling' });
      return;
    }
    void tryPlay({ kind: 'channel', uid, ability });
  };

  /** 捨て札のカードの能力（MTG 要素 △ バッチB）：対象が要らなければ確認して使う、要るなら対象選びへ */
  const tapDiscardAbility = async (uid: string, ability: battle.DiscardAbilityKind) => {
    const d = discardAbilities.get(`${uid}:${ability}`);
    const def = d ? view.cards[d.card.cardId] : undefined;
    if (!d || !def) return;
    if (d.blocked) {
      toast({ text: d.blocked, kind: 'ng' });
      return;
    }
    setPile(null);
    if (d.enemyTargets.length > 0 || d.allyTargets.length > 0) {
      void tryPlay({ kind: 'discardAbility', uid, ability });
      return;
    }
    const n = d.card && def.abilities?.find((a) => a.id === ability)?.value;
    const ok = await confirm({
      title: `${d.name}：「${def.name}」`,
      message:
        ability === 'dredge' ? (
          <p>山札の上{n}枚を捨て札に置き、このカードを手札に戻します（1ターン1回）。</p>
        ) : ability === 'embalm' ? (
          <p>エナジー{d.cost}でこのカードを除外し、コピーのトークンを出します。</p>
        ) : (
          <p>エナジー{d.cost}でこのカードを除外し、「相続」の効果を使います。</p>
        ),
      okLabel: `${d.name}${d.cost > 0 ? `（⚡${d.cost}）` : ''}`,
      cancelLabel: 'やめる',
    });
    if (ok) void tryPlay({ kind: 'discardAbility', uid, ability });
  };

  /** 起動の ⚡ を押した：対象が要らなければ起動、要るなら対象選びへ（use は Lvアップ・忠誠+1／−K） */
  const tapActivate = (uid: string, use?: battle.ActivateUse) => {
    const a = activateInfos.get(actKey(uid, use));
    if (!a) return;
    if (a.blocked) {
      toast({ text: a.blocked, kind: 'ng' });
      return;
    }
    void tryPlay({ kind: 'activate', uid, ...(use ? { use } : {}) });
  };

  /** 裏向きの自分のモンスターを表にする（MTG 要素 △ バッチC）：対象が要れば対象選びへ */
  const tapReveal = (uid: string) => {
    const r = revealInfos.get(uid);
    if (!r) return;
    if (r.blocked) {
      toast({ text: r.blocked, kind: 'ng' });
      return;
    }
    void tryPlay({ kind: 'reveal', uid });
  };

  /** 手札のカードを待機させる（MTG 要素 △ バッチC：予顕・計画・待機）。複数あれば選ばせ、確認してから */
  const [asideAsk, setAsideAsk] = useState<null | { uid: string; kinds: battle.SetAsideKind[] }>(null);
  const trySetAside = async (uid: string, kinds?: battle.SetAsideKind[]) => {
    const list = (setAsides.get(uid) ?? []).filter((x) => !kinds || kinds.includes(x.kind));
    if (list.length === 0) return;
    if (list.length > 1) {
      setAsideAsk({ uid, kinds: list.map((x) => x.kind) });
      return;
    }
    const x = list[0]!;
    const card = mine.hand.find((c) => c.uid === uid);
    const def = card ? view.cards[card.cardId] : undefined;
    if (!def) return;
    if (x.blocked) {
      toast({ text: x.blocked, kind: 'ng' });
      return;
    }
    const ok = await confirm({
      title: `${x.name}：「${def.name}」`,
      message: (
        <p>
          {x.note}。待機ゾーン（{(mine.waiting ?? []).length}/{BALANCE.battle.maxWaiting}）に置きます{x.kind === 'foretell' ? '（相手には裏向き）' : ''}。カードを使ったことには数えません。
        </p>
      ),
      okLabel: `${x.name}（⚡${x.cost}）`,
      cancelLabel: 'やめる',
    });
    if (ok) act({ type: 'setAside', player: me, cardUid: uid, kind: x.kind });
  };

  const onTarget = (t: TargetRef) => {
    if (!candidates.some((x) => sameRef(x, t))) return false;
    if (targetSel) {
      if (needEnemy) void tryPlay({ ...targetSel, enemy: t });
      else if (t.kind === 'monster') void tryPlay({ ...targetSel, ally: t.uid });
      return true;
    }
    if (sel?.kind === 'attacker') {
      tryAttack(sel.uid, t);
      return true;
    }
    return false;
  };

  // ---------------------------------------------------------------- ドラッグ＆ドロップ
  const notMyTurn = () => (view.phase === 'main' && view.active !== me ? `${opponentLabel}のターンです` : '今は使えません');
  const cardSource = (c: battle.CardInst): DragSource => {
    const i = infos.get(c.uid)!;
    const noise = c.cardId === battle.NOISE_CARD_ID;
    let blocked = i.blocked;
    if (!myTurn) blocked = notMyTurn();
    else if (noise && mine.energy < i.cost) blocked = `エナジーが足りません（必要${i.cost}・残り${mine.energy}）`;
    else if (blocked === 'エナジーが足りません') blocked = `エナジーが足りません（必要${i.cost}・残り${mine.energy}）`;
    return {
      kind: 'card',
      uid: c.uid,
      noise,
      blocked,
      enemyTargets: i.enemyTargets,
      allyTargets: i.allyTargets,
      handAbilities: usableHandAbilities(c.uid),
      ...(usableSetAside(c.uid).length > 0 ? { setAside: usableSetAside(c.uid) } : {}),
      ...(i.modes ? { modal: true } : {}),
      // 支払いのシート（MTG 要素 △ バッチB）
      ...(!noise && needsPaySheet(i, mine.energy) ? { pay: true } : {}),
      ...(i.pay?.alts?.some((a) => a.alt === 'overload' && !a.blocked) ? { anyDrop: true } : {}),
    };
  };
  /** 捨て札のカード（捨て札から使う。MTG 要素 ○ バッチC1。捨て札から使えず、捨て札のカードの能力があればそれ：△ バッチB） */
  const discardSource = (c: battle.CardInst): DragSource | null => {
    const i = discardInfos.get(c.uid);
    if (!i) {
      const d = discardAbilitiesOf(c.uid).sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked))[0];
      if (!d) return null;
      return { kind: 'discardAbility', uid: c.uid, ability: d.ability, blocked: myTurn ? d.blocked : notMyTurn(), enemyTargets: d.enemyTargets, allyTargets: d.allyTargets };
    }
    let blocked = i.blocked;
    if (!myTurn) blocked = notMyTurn();
    else if (blocked === 'エナジーが足りません') blocked = `エナジーが足りません（必要${i.cost}・残り${mine.energy}）`;
    return {
      kind: 'card',
      uid: c.uid,
      noise: false,
      blocked,
      enemyTargets: i.enemyTargets,
      allyTargets: i.allyTargets,
      from: 'discard',
      ...(i.modes ? { modal: true } : {}),
      ...(needsPaySheet(i, mine.energy) ? { pay: true } : {}),
    };
  };
  /** 待機ゾーンのカード（MTG 要素 △ バッチC：待機ゾーンから使う） */
  const waitingSource = (c: battle.CardInst): DragSource | null => {
    const i = waitingInfos.get(c.uid);
    if (!i) return null;
    let blocked = i.blocked;
    if (!myTurn) blocked = notMyTurn();
    else if (blocked === 'エナジーが足りません') blocked = `エナジーが足りません（必要${i.cost}・残り${mine.energy}）`;
    return {
      kind: 'card',
      uid: c.uid,
      noise: false,
      blocked,
      enemyTargets: i.enemyTargets,
      allyTargets: i.allyTargets,
      from: 'waiting',
      ...(i.modes ? { modal: true } : {}),
      ...(needsPaySheet(i, mine.energy) ? { pay: true } : {}),
    };
  };
  /** 起動の ⚡（MTG 要素 ○ バッチC1。use は Lvアップ・忠誠：△ バッチC） */
  const activateDragSource = (uid: string, use?: battle.ActivateUse): DragSource | null => {
    const i = activateInfos.get(actKey(uid, use));
    if (!i) return null;
    return { kind: 'activate', uid, ...(use ? { use } : {}), blocked: myTurn ? i.blocked : notMyTurn(), enemyTargets: i.enemyTargets, allyTargets: i.allyTargets };
  };
  /** 表にする 🂠（MTG 要素 △ バッチC） */
  const revealDragSource = (uid: string): DragSource | null => {
    const i = revealInfos.get(uid);
    if (!i) return null;
    return { kind: 'reveal', uid, blocked: myTurn ? i.blocked : notMyTurn(), enemyTargets: i.enemyTargets, allyTargets: i.allyTargets };
  };
  /** 起動のボタンの中身（自分の起動できるモンスター・パワー。起動・Lvアップ・忠誠+1／−K・表にする） */
  const activateButtons = (uid: string): ActivateButton[] => {
    const out: ActivateButton[] = activatesOf(uid).map((i) => ({
      cost: i.cost,
      blocked: myTurn ? i.blocked : notMyTurn(),
      ...(i.use ? { icon: i.use === 'level' ? USE_ICON.level : (i.label ?? USE_ICON[i.use]), title: i.use === 'level' ? 'Lvアップ' : `忠誠${i.label ?? ''}`, key: i.use } : {}),
      onTap: () => {
        if (drag.consumeClick()) return;
        tapActivate(uid, i.use);
      },
      onPointerDown: view.phase === 'main' ? (e) => drag.begin(e, 'board', () => activateDragSource(uid, i.use)) : undefined,
      dragging: drag.drag?.src.kind === 'activate' && drag.drag.src.uid === uid && drag.drag.src.use === i.use,
    }));
    const r = revealInfos.get(uid);
    if (r) {
      out.push({
        cost: r.cost,
        blocked: myTurn ? r.blocked : notMyTurn(),
        icon: BALANCE.battle.faceDownIcon,
        title: '表にする',
        key: 'reveal',
        onTap: () => {
          if (drag.consumeClick()) return;
          tapReveal(uid);
        },
        onPointerDown: view.phase === 'main' ? (e) => drag.begin(e, 'board', () => revealDragSource(uid)) : undefined,
        dragging: drag.drag?.src.kind === 'reveal' && drag.drag.src.uid === uid,
      });
    }
    return out;
  };
  const attackerSource = (m: battle.Monster): DragSource => ({
    kind: 'attacker',
    uid: m.uid,
    blocked: myTurn ? battle.attackBlockReason(view, m) : view.active !== me ? `${opponentLabel}のターンです` : '今は攻撃できません',
    targets: myTurn ? battle.attackTargets(view, m) : [],
  });

  /** 攻撃できない相手に落としたときの理由 */
  const attackMiss = (t: TargetRef): string => {
    if (t.kind === 'player') {
      if (t.player === me) return '自分は攻撃できません';
      return battle.targetableTaunts(view, opp).length ? '挑発のモンスターがいるので、先にそちらを攻撃します' : 'プレイヤーは攻撃できません';
    }
    const m = battle.findMonster(view, t.uid);
    if (!m) return 'そこは攻撃できません';
    if (m.controller === me) return '自分のモンスターは攻撃できません';
    if (m.stealth) return '隠密中のモンスターは攻撃できません';
    if (battle.targetableTaunts(view, opp).length) return '挑発のモンスターがいるので、先にそちらを攻撃します';
    return 'そのモンスターは攻撃できません';
  };

  const onDrop = (src: DragSource, key: string | null): DropResult => {
    const d = resolveDrop(src, parseSpot(key));
    const back = (text: string) => {
      toast({ text, kind: 'ng', duration: 2600 });
      return 'back' as const;
    };
    switch (d.t) {
      case 'cancel':
        return 'back';
      case 'invalid': {
        if (src.kind === 'attacker' && d.attempt?.target) return back(attackMiss(d.attempt.target));
        if (src.kind === 'card' && d.attempt?.enemy) {
          const i = infos.get(src.uid);
          if (i?.tauntLimited) return back(battle.NOTE_TAUNT_LIMITED);
          const t = d.attempt.enemy;
          const m = t.kind === 'monster' ? battle.findMonster(view, t.uid) : undefined;
          if (m && m.controller !== me) {
            if (m.stealth) return back('隠密中のモンスターは対象に選べません');
            if (battle.keywordFlags(view, m).hexproof) return back('呪禁のモンスターは、カードの対象に選べません');
          }
          if (t.kind === 'player' && t.player === opp && i && !i.enemyTargets.some((x) => x.kind === 'player')) return back('このカードはモンスターしか選べません');
        }
        return back(d.reason);
      }
      case 'noise':
        act({ type: 'removeNoise', player: me, cardUid: src.uid });
        return 'ok';
      case 'attack':
        tryAttack(src.uid, d.target);
        return 'ok';
      case 'play':
        void tryPlay(selOfSource(src, d.chosen));
        return 'ok';
      case 'pay':
        // 支払いのシート（MTG 要素 △ バッチB）：落とした場所を覚えてシートへ
        setAsk({ kind: 'pay', sel: selOfSource(src, d.chosen) as CardSel });
        return 'ok';
      case 'need':
        setSel(selOfSource(src, d.chosen));
        return 'ok';
      case 'pile': {
        if (src.kind !== 'card') return 'back';
        // 能力が複数（サイクリング・魂力・予見）なら選ぶ
        if (d.abilities.length > 1) setPileAsk({ uid: src.uid, abilities: d.abilities });
        else void tryHandAbility(src.uid, d.abilities[0]!);
        return 'ok';
      }
      case 'modes':
        // モード選択（MTG 要素 ○ バッチC2）：落とした場所を覚えてモードの選択シートへ
        setAsk({ kind: 'mode', sel: selOfSource(src, d.chosen) as CardSel });
        return 'ok';
      case 'setAside':
        // 待機ゾーン（MTG 要素 △ バッチC）：予顕・計画・待機（複数なら選ぶ）
        if (src.kind !== 'card') return 'back';
        void trySetAside(src.uid, d.kinds);
        return 'ok';
    }
  };

  /** ドラッグしたものと決まった対象から、選択の途中の形を作る */
  const selOfSource = (src: DragSource, chosen: battle.Chosen): TargetSel => {
    if (src.kind === 'activate') return { kind: 'activate', uid: src.uid, ...(src.use ? { use: src.use } : {}), ...chosen };
    if (src.kind === 'reveal') return { kind: 'reveal', uid: src.uid, ...chosen };
    if (src.kind === 'discardAbility') return { kind: 'discardAbility', uid: src.uid, ability: src.ability, ...chosen };
    const from = src.kind === 'card' && (src.from === 'discard' || src.from === 'waiting') ? src.from : undefined;
    return { kind: 'card', uid: src.uid, ...(from ? { from } : {}), ...chosen };
  };

  const drag = useBattleDrag({
    rootRef,
    onDrop,
    zoneSelector: '.battle__board',
    reduceMotion,
    // 捨て札の一覧からつかんだら、一覧を閉じて盤面を見せる
    onStart: (src) => {
      sfx('card.hover');
      if ((src.kind === 'card' && src.from === 'discard') || src.kind === 'discardAbility') setPile(null);
      if (src.kind === 'card' && src.from === 'waiting') setWaitingOpen(null);
      if (src.kind === 'activate') setPowersOpen(false);
    },
  });
  const dragging = drag.drag?.phase === 'drag' ? drag.drag : null;
  // ダメージの見込み（決定事項 #138）：落とし先の上で、離したらそのまま起きる行動を見えている状態で試す（落とし先が変わったときだけ）
  const previewAct = useMemo(() => (dragging && dragging.hover ? previewActionOf(dragging.src, parseSpot(dragging.hover), me) : null), [dragging, me]);
  const previewKey = previewAct ? JSON.stringify(previewAct) : '';
  const damagePreview = useMemo(() => {
    if (!previewAct || !myTurn) return null;
    try {
      const p = battle.previewAction(view, previewAct);
      return p && (p.hits.length > 0 || p.ends) ? p : null;
    } catch {
      return null;
    }
    // previewKey が同じなら同じ行動
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, view, myTurn]);
  const isMineRef = (t: TargetRef) => (t.kind === 'player' ? t.player === me : battle.findMonster(view, t.uid)?.controller === me);
  const dragTargets = useMemo(() => new Set(dragging ? dragging.plan.targets.map(targetKey) : []), [dragging]);
  /** 光らせる対象か（ドラッグ中はドラッグの候補、対象選択中はその候補） */
  const isLit = (t: TargetRef): boolean => (dragging ? dragTargets.has(targetKey(t)) : candidates.some((x) => sameRef(x, t)));
  const isHover = (t: TargetRef): boolean => !!dragging && dragging.hover === targetKey(t) && dragTargets.has(dragging.hover);
  /** 護法（MTG 要素 ○ バッチB）：この対象を選ぶと増えるコスト（ドラッグ中・対象選択中のカード・起動・魂力。エンジンの targetCosts から） */
  const costInfo: Pick<TargetInfo, 'cost' | 'targetCosts'> | undefined = dragging
    ? dragging.src.kind === 'card'
      ? pickInfos(dragging.src.from === 'hand' ? undefined : dragging.src.from).get(dragging.src.uid)
      : dragging.src.kind === 'activate'
        ? activateInfos.get(actKey(dragging.src.uid, dragging.src.use))
        : dragging.src.kind === 'reveal'
          ? revealInfos.get(dragging.src.uid)
          : undefined
    : (info ?? undefined);
  const extraCostOf = (t: TargetRef): number => {
    const c = costInfo?.targetCosts?.[t.kind === 'player' ? `player:${t.player}` : t.uid];
    return c !== undefined && costInfo ? Math.max(0, c - costInfo.cost) : 0;
  };

  // 状態が進んだら選択とドラッグを解く
  useEffect(() => {
    setSel(null);
    setHover(null);
    drag.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.log.length, view.turnIndex, view.phase]);

  // ---------------------------------------------------------------- タップ（詳細）
  const onMonsterTap = (m: battle.Monster) => {
    if (drag.consumeClick()) return;
    if (sel && onTarget({ kind: 'monster', uid: m.uid })) return;
    setDetail({ kind: 'monster', uid: m.uid });
  };

  const onHandTap = (card: battle.CardInst) => {
    if (drag.consumeClick()) return;
    setSel(null);
    setDetail({ kind: 'hand', uid: card.uid });
  };

  const endTurn = async () => {
    const left = [playableCount > 0 ? `使えるカードが${playableCount}枚` : '', readyAttackers.length > 0 ? `攻撃できるモンスターが${readyAttackers.length}体` : ''].filter(Boolean);
    if (left.length > 0 && !skipEndConfirm.current) {
      let dontAsk = false;
      const ok = await confirm({
        title: 'ターンを終了しますか？',
        message: (
          <>
            <p>{left.join('、')}残っています（エナジー {mine.energy}）。</p>
            <label className="check">
              <input type="checkbox" onChange={(e) => (dontAsk = e.target.checked)} />
              この対戦ではもう確認しない
            </label>
          </>
        ),
        okLabel: 'ターン終了',
        cancelLabel: '戻る',
      });
      if (!ok) return;
      if (dontAsk) skipEndConfirm.current = true;
    }
    act({ type: 'endTurn', player: me });
  };

  const concede = async () => {
    setMenuOpen(false);
    if (view.phase === 'ended') return;
    const ok = await confirm({ title: '降参しますか？', message: 'この対戦はあなたの負けになります。', okLabel: '降参する', danger: true });
    if (ok) act({ type: 'concede', player: me });
  };

  const hint = (() => {
    if (busy) return '送信中…';
    if (view.phase === 'mulligan') return mine.mulligan.done ? `${opponentLabel}が手札を決めています…` : '最初の手札を決めてください';
    if (view.phase === 'ended') {
      // 結果ダイアログを閉じたあとも、誰が勝ったかを操作バーに出す
      if (!view.result) return '対戦は終了しました';
      const r = resultTexts(view, me);
      return `${r.title}（${r.why}）`;
    }
    if (view.pending) return view.pending.player === me ? '選んでください' : `${opponentLabel}が選んでいます…`;
    if (view.active !== me) return `${opponentLabel}のターンです…`;
    if (attacker) return `「${view.cards[attacker.card.cardId]?.name}」の攻撃先を選んでください`;
    if (targetSel && selDef) {
      if (info?.blocked) return info.blocked;
      const fight = selDef.effects.some((e) => getEffect(e.id)?.targetRule === 'fight') ?? false;
      const modeNote =
        targetSel.kind === 'card' && targetSel.modes
          ? `（モード${targetSel.modes.map((m) => battle.modeName(m)).join('+')}）`
          : targetSel.kind === 'card' && targetSel.mode !== undefined
            ? `（モード${battle.modeName(targetSel.mode)}）`
            : '';
      const what =
        targetSel.kind === 'activate'
          ? `「${selDef.name}」の${targetSel.use === 'level' ? 'Lvアップ' : targetSel.use ? `忠誠${activateInfos.get(actKey(targetSel.uid, targetSel.use))?.label ?? ''}` : '起動'}`
          : targetSel.kind === 'reveal'
            ? `「${selDef.name}」を表にするとき`
          : targetSel.kind === 'channel'
            ? `「${selDef.name}」の${targetSel.ability === 'forecast' ? '予見' : '魂力'}`
            : targetSel.kind === 'discardAbility'
              ? `「${selDef.name}」の${discardAbilities.get(`${targetSel.uid}:${targetSel.ability}`)?.name ?? '能力'}`
              : `「${selDef.name}」${targetSel.kind === 'card' && targetSel.from === 'discard' ? '（捨て札から）' : targetSel.kind === 'card' && targetSel.from === 'waiting' ? '（待機ゾーンから）' : ''}${modeNote}`;
      if (needEnemy) return `${what}の${fight ? '戦わせる相手モンスター' : '対象'}を選んでください${info?.tauntLimited ? `（${battle.NOTE_TAUNT_LIMITED}）` : ''}`;
      if (needAlly) return `${what}${fight ? 'で戦わせる' : 'をかける'}自分のモンスターを選んでください`;
      return `${what}を使いますか？`;
    }
    if (nothingLeft) return 'できることはもうありません。ターンを終了しましょう';
    if (phone) return readyAttackers.length > 0 ? '緑に光るモンスターは相手へドラッグで攻撃・タップで詳細' : 'カードを上へドラッグで使用・タップで詳細';
    return 'カードを場へドラッグして使う・モンスターを相手へドラッグして攻撃（クリックで詳細）';
  })();

  const turnLabel =
    view.phase === 'mulligan'
      ? 'マリガン'
      : view.phase === 'ended'
        ? '対戦終了'
        : view.active === me
          ? `あなたの${mine.turnsTaken}ターン目`
          : `${opponentLabel}の${theirs.turnsTaken}ターン目`;
  // 見出しの札は「選択待ち」のときだけ（誰の番かは見出しの文言とパネルの光で分かる）
  const phaseLabel = view.phase === 'main' && view.pending ? (view.pending.player === me ? 'あなたが選択中' : '相手が選択中') : null;

  const targetLabel = (t: TargetRef): string => {
    if (t.kind === 'player') return t.player === me ? 'あなた' : `相手プレイヤー ❤${theirs.hp}`;
    const m = battle.findMonster(view, t.uid);
    const def = m ? view.cards[m.card.cardId] : undefined;
    return m ? `${iconText(def?.icon)}${def?.name ?? '？'} ⚔${battle.effectiveAttack(view, m)} ❤${m.hp}` : '？';
  };

  /** 場の並び：今のモンスターに、消える途中のモンスター（幽霊）を元の位置へ差し込む */
  const boardOf = (p: battle.PlayerId) => {
    const list: { m: battle.Monster; ghost: boolean }[] = view.players[p].board.map((m) => ({ m, ghost: false }));
    for (const g of replay.ghosts.values()) {
      if (g.m.controller !== p) continue;
      list.splice(Math.min(g.index, list.length), 0, { m: g.m, ghost: true });
    }
    return list;
  };

  const renderBoard = (p: battle.PlayerId) => {
    const isMine = p === me;
    const rows = boardOf(p);
    return (
      <div className={cx('board', isMine ? 'board--me' : 'board--opp', rows.length > 3 && 'board--many', rows.length > 6 && 'board--dense')} aria-label={isMine ? 'あなたの場' : '相手の場'}>
        {rows.length === 0 && <span className="board__empty">{isMine ? 'あなたの場：モンスターなし' : '相手の場：モンスターなし'}</span>}
        {rows.map(({ m, ghost }) => {
          const ref: TargetRef = { kind: 'monster', uid: m.uid };
          const ready = isMine && myTurn && !battle.attackBlockReason(view, m);
          return (
            <MonsterTile
              key={m.uid}
              m={m}
              def={view.cards[m.card.cardId]}
              ownerTurns={view.players[m.controller].turnsTaken}
              attackNow={battle.effectiveAttack(view, m)}
              defenseNow={battle.effectiveDefense(view, m)}
              isMine={isMine}
              ready={ready}
              blockLabel={isMine && myTurn ? shortBlock(battle.attackBlockReason(view, m)) : null}
              selected={sel?.kind === 'attacker' && sel.uid === m.uid}
              targetable={!ghost && isLit(ref)}
              extraCost={!ghost && isLit(ref) ? extraCostOf(ref) : 0}
              dropHover={!ghost && isHover(ref)}
              dragging={dragging?.src.kind === 'attacker' && dragging.src.uid === m.uid}
              flags={battle.keywordFlags(view, m)}
              onClick={() => (ghost ? undefined : onMonsterTap(m))}
              onDetail={ghost ? undefined : () => !drag.isActive() && !drag.consumeClick() && setDetail({ kind: 'monster', uid: m.uid })}
              onPointerDown={
                isMine && !ghost && view.phase === 'main'
                  ? (e) => {
                      // タッチでは攻撃できるモンスターだけつかめる（それ以外は場のスクロールに任せる）
                      if (e.pointerType !== 'mouse' && !ready) return;
                      drag.begin(e, 'board', () => attackerSource(m));
                    }
                  : undefined
              }
              flash={replay.flash[m.uid]}
              hidden={replay.hidden.has(m.uid)}
              dying={ghost && (replay.ghosts.get(m.uid)?.dying ?? false)}
              activate={isMine && !ghost ? activateButtons(m.uid) : null}
              realName={m.faceDown?.card ? view.cards[m.faceDown.card.cardId]?.name : undefined}
              compact={phone}
            />
          );
        })}
      </div>
    );
  };

  const oppRef: TargetRef = { kind: 'player', player: opp };
  const meRef: TargetRef = { kind: 'player', player: me };
  const dragSrc = drag.drag?.src;
  const dragFrom = dragSrc?.kind === 'card' && dragSrc.from !== 'hand' ? dragSrc.from : undefined;
  const dragCard = dragSrc?.kind === 'card' ? (dragFrom === 'discard' ? mine.discard : dragFrom === 'waiting' ? waitingCards : mine.hand).find((c) => c.uid === dragSrc.uid) : undefined;
  const dragInfo = dragCard ? pickInfos(dragFrom).get(dragCard.uid) : undefined;
  const dragActivate = dragSrc?.kind === 'activate' ? activateInfos.get(actKey(dragSrc.uid, dragSrc.use)) : dragSrc?.kind === 'reveal' ? revealInfos.get(dragSrc.uid) : undefined;

  /** 詳細シートの中身と操作 */
  const renderDetail = (): ReactNode => {
    if (!detail) return null;
    const close = () => setDetail(null);
    if (detail.kind === 'hand') {
      const card = mine.hand.find((c) => c.uid === detail.uid);
      if (!card) return null;
      const i = infos.get(card.uid)!;
      const def = view.cards[card.cardId];
      const src = cardSource(card);
      const playable = isPlayable(card);
      if (!def) {
        return (
          <CardDetailSheet
            title="ノイズ"
            onClose={close}
            actions={
              <>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={!playable}
                  onClick={() => {
                    close();
                    act({ type: 'removeNoise', player: me, cardUid: card.uid });
                  }}
                >
                  除外する（⚡{i.cost}）
                </button>
                {!playable && src.blocked && <span className="cdetail__why">{src.blocked}</span>}
              </>
            }
          >
            <NoiseDetailBody cost={i.cost} />
          </CardDetailSheet>
        );
      }
      const targeted = i.enemyTargets.length > 0 || i.allyTargets.length > 0;
      const usable = myTurn && !i.blocked;
      const blockedWhy = src.kind === 'card' ? src.blocked : null;
      const hand = handAbilities.get(card.uid) ?? [];
      return (
        <CardDetailSheet
          title={def.name}
          onClose={close}
          actions={
            <>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!usable}
                onClick={() => {
                  close();
                  // モード選択のカード（MTG 要素 ○ バッチC2）は、先にモードの選択シート
                  if (targeted && !i.modes) setSel({ kind: 'card', uid: card.uid });
                  else void tryPlay({ kind: 'card', uid: card.uid });
                }}
              >
                {i.modes ? 'モードを選んで使う' : targeted ? '対象を選んで使う' : '使う'}（⚡{i.cost}
                {i.kicker ? `・キッカー+${i.kicker.extra}` : ''}）
              </button>
              {/* 手札から使う能力（MTG 要素 ○ バッチC1）：サイクリング・魂力 */}
              {hand.map((h) => (
                <button
                  key={h.ability}
                  type="button"
                  className="btn"
                  disabled={!myTurn || !!h.blocked}
                  title={h.blocked ?? undefined}
                  onClick={() => {
                    close();
                    void tryHandAbility(card.uid, h.ability);
                  }}
                >
                  {HAND_ICON[h.ability]} {h.name}（⚡{h.cost}）
                </button>
              ))}
              {/* 待機させる（MTG 要素 △ バッチC：予顕・計画・待機） */}
              {(setAsides.get(card.uid) ?? []).map((x) => (
                <button
                  key={x.kind}
                  type="button"
                  className="btn"
                  disabled={!myTurn || !!x.blocked}
                  title={x.blocked ?? x.note}
                  onClick={() => {
                    close();
                    void trySetAside(card.uid, [x.kind]);
                  }}
                >
                  {abilityGlossary[`ability:${x.kind}`]?.icon ?? '⏳'} {x.name}（⚡{x.cost}）
                </button>
              ))}
              {!usable && blockedWhy && <span className="cdetail__why">{blockedWhy}</span>}
            </>
          }
        >
          <CardDetailBody
            def={grownDef(def, card.grow, card.perm)}
            extras={{
              cost: i.cost,
              notes: [
                ...(card.heisted ? [`${mechanicGlossary.heist!.icon} ${mechanicGlossary.heist!.short}`] : []),
                ...(setAsides.get(card.uid) ?? []).map((x) => `${x.name}：${x.note}${myTurn && x.blocked ? `（${x.blocked}）` : ''}`),
                ...(card.grow ? [`成長：この1枚のダメージ+${card.grow}（表示に含む）`] : []),
                ...(card.perm ? [`永久強化：攻撃力+${card.perm.attack}・体力+${card.perm.hp}（表示に含む）`] : []),
                ...(i.blocked === battle.WARN_ICED ? [i.blocked] : []),
                ...(myTurn ? [...costLines(i), ...i.warnings] : costLines(i)),
              ],
              where: '手札',
            }}
          />
        </CardDetailSheet>
      );
    }
    if (detail.kind === 'discard') {
      // 自分の捨て札のカード（捨て札から使う。MTG 要素 ○ バッチC1。捨て札のカードの能力：△ バッチB）
      const card = mine.discard.find((c) => c.uid === detail.uid);
      const def = card ? view.cards[card.cardId] : undefined;
      if (!card || !def) return null;
      const i = discardInfos.get(card.uid);
      const src = i ? discardSource(card) : null;
      const blocked = src?.kind === 'card' ? src.blocked : null;
      const targeted = !!i && (i.enemyTargets.length > 0 || i.allyTargets.length > 0);
      const abil = discardAbilitiesOf(card.uid);
      return (
        <CardDetailSheet
          title={def.name}
          onClose={close}
          actions={
            i || abil.length > 0 ? (
              <>
                {i && (
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={!!blocked}
                    onClick={() => {
                      close();
                      setPile(null);
                      if (targeted && !i.modes && !needsPaySheet(i, mine.energy)) setSel({ kind: 'card', uid: card.uid, from: 'discard' });
                      else void tryPlay({ kind: 'card', uid: card.uid, from: 'discard' });
                    }}
                  >
                    捨て札から使う（{i.fromDiscard?.name}・⚡{i.cost}）
                  </button>
                )}
                {abil.map((d) => (
                  <button
                    key={d.ability}
                    type="button"
                    className="btn"
                    disabled={!myTurn || !!d.blocked}
                    title={d.blocked ?? undefined}
                    onClick={() => {
                      close();
                      void tapDiscardAbility(card.uid, d.ability);
                    }}
                  >
                    {DISCARD_ICON[d.ability]} {d.name}
                    {d.cost > 0 ? `（⚡${d.cost}）` : ''}
                  </button>
                ))}
                {blocked && <span className="cdetail__why">{blocked}</span>}
                {!i && abil[0]?.blocked && myTurn && <span className="cdetail__why">{abil[0].blocked}</span>}
              </>
            ) : undefined
          }
        >
          <CardDetailBody def={def} extras={{ ...(i ? { cost: i.cost, notes: [...costLines(i), ...(myTurn ? i.warnings : [])] } : {}), where: 'あなたの捨て札' }} />
        </CardDetailSheet>
      );
    }
    if (detail.kind === 'monster') {
      const m = battle.findMonster(view, detail.uid);
      const def = m ? view.cards[m.card.cardId] : undefined;
      if (!m || !def) return null;
      const isMine = m.controller === me;
      const reason = isMine && myTurn ? battle.attackBlockReason(view, m) : null;
      const acts = isMine ? activatesOf(m.uid) : [];
      const rev = isMine ? revealInfos.get(m.uid) : undefined;
      const realDef = m.faceDown?.card ? view.cards[m.faceDown.card.cardId] : undefined;
      return (
        <CardDetailSheet
          title={def.name}
          onClose={close}
          actions={
            isMine && myTurn ? (
              <>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={!!reason}
                  onClick={() => {
                    close();
                    setSel({ kind: 'attacker', uid: m.uid });
                  }}
                >
                  <UiIcon name="gi:sword-clash" />
                  攻撃する
                </button>
                {reason && <span className="cdetail__why">{reason}</span>}
                {acts.map((a) => (
                  <ActivateAction key={a.use ?? 'act'} info={a} onUse={() => (close(), tapActivate(m.uid, a.use))} />
                ))}
                {rev && (
                  <>
                    <button type="button" className="btn" disabled={!!rev.blocked} onClick={() => (close(), tapReveal(m.uid))}>
                      {BALANCE.battle.faceDownIcon} 表にする（エナジー{rev.cost}）
                    </button>
                    {rev.blocked && <span className="cdetail__why">{rev.blocked}</span>}
                  </>
                )}
              </>
            ) : undefined
          }
        >
          <CardDetailBody
            def={def}
            extras={{
              monster: m,
              flags: battle.keywordFlags(view, m),
              ownerTurns: view.players[m.controller].turnsTaken,
              attackNow: battle.effectiveAttack(view, m),
              defenseNow: battle.effectiveDefense(view, m),
              where: isMine ? 'あなたの場' : `${opponentLabel}の場`,
              // 装備しているカード（MTG 要素 ○ バッチB。公開情報）
              equipment: (m.equipment ?? []).map((c) => view.cards[c.cardId]).filter((d): d is CardDef => !!d),
              ...(realDef ? { realDef } : {}),
            }}
          />
        </CardDetailSheet>
      );
    }
    if (detail.kind === 'power') {
      const ps = view.players[detail.player];
      const emblem = (ps.emblems ?? []).find((x) => x.uid === detail.uid);
      const pw = emblem ?? ps.powers.find((x) => x.uid === detail.uid);
      if (!pw) return null;
      const def = view.cards[pw.cardId];
      const acts = detail.player === me ? activatesOf(pw.uid) : [];
      return (
        <CardDetailSheet
          title={`${pw.name}（${emblem ? '紋章' : 'パワー'}）`}
          onClose={close}
          actions={
            acts.length > 0 && myTurn ? (
              <>
                {acts.map((a) => (
                  <ActivateAction key={a.use ?? 'act'} info={a} onUse={() => (close(), tapActivate(pw.uid, a.use))} />
                ))}
              </>
            ) : undefined
          }
        >
          {def ? (
            <CardDetailBody def={def} extras={{ power: pw, where: `${detail.player === me ? 'あなた' : opponentLabel}の${emblem ? '紋章' : 'パワー'}` }} />
          ) : (
            <p>{pw.name}</p>
          )}
        </CardDetailSheet>
      );
    }
    if (detail.kind === 'waiting') {
      // 待機ゾーンのカード（MTG 要素 △ バッチC）：自分のなら「待機ゾーンから使う」
      const w = (view.players[detail.player].waiting ?? []).find((x) => x.card.uid === detail.uid);
      const def = w ? view.cards[w.card.cardId] : undefined;
      if (!w || !def) return null;
      const i = detail.player === me ? waitingInfos.get(w.card.uid) : undefined;
      const src = i ? waitingSource(w.card) : null;
      const blocked = src?.kind === 'card' ? src.blocked : null;
      const targeted = !!i && (i.enemyTargets.length > 0 || i.allyTargets.length > 0);
      return (
        <CardDetailSheet
          title={def.name}
          onClose={close}
          actions={
            i ? (
              <>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={!!blocked}
                  onClick={() => {
                    close();
                    setWaitingOpen(null);
                    if (targeted && !i.modes && !needsPaySheet(i, mine.energy)) setSel({ kind: 'card', uid: w.card.uid, from: 'waiting' });
                    else void tryPlay({ kind: 'card', uid: w.card.uid, from: 'waiting' });
                  }}
                >
                  待機ゾーンから使う（⚡{i.cost}）
                </button>
                {blocked && <span className="cdetail__why">{blocked}</span>}
              </>
            ) : undefined
          }
        >
          <CardDetailBody
            def={def}
            extras={{
              ...(i ? { cost: i.cost } : {}),
              notes: [waitingNote(w, view.turnIndex), ...(i ? [...costLines(i), ...(myTurn ? i.warnings : [])] : [])],
              where: `${detail.player === me ? 'あなた' : opponentLabel}の待機ゾーン`,
            }}
          />
        </CardDetailSheet>
      );
    }
    const def = view.cards[(detail as { cardId: string }).cardId];
    if (!def) return null;
    return (
      <CardDetailSheet title={def.name} onClose={close}>
        <CardDetailBody def={def} />
      </CardDetailSheet>
    );
  };

  /** モードの選択・支払いのシート（MTG 要素 ○ バッチC1・C2・△ バッチB） */
  const renderAsk = (): ReactNode => {
    if (!ask) return null;
    const x = ask.sel;
    const pi = pickInfos(x.from).get(x.uid);
    const card = cardOf(x);
    const def = card ? view.cards[card.cardId] : undefined;
    if (!pi || !card || !def) return null;
    const cancel = () => setAsk(null);
    if (ask.kind === 'mode' && pi.modes) {
      return (
        <ModeDialog
          name={def.name}
          modes={pi.modes}
          {...(pi.modeCombos ? { combos: pi.modeCombos } : {})}
          energy={mine.energy}
          onPick={(mode, modes) => {
            setAsk(null);
            const m = modes ? pi.modeCombos?.find((y) => y.modes?.join() === modes.join()) : pi.modes!.find((y) => y.mode === mode);
            if (!m) return;
            // 落とした場所がこのモードの合法な対象ならそのまま、違えば対象選び（候補が1つなら自動）
            const d = resolveModeDrop({ ...m, enemyTargets: battle.payableEnemyTargets(m, mine.energy) }, chosenOf(x), def.stats ? x.uid : undefined);
            if (d.t === 'invalid') {
              toast({ text: d.reason, kind: 'ng' });
              return;
            }
            if (d.t === 'play' || d.t === 'need') {
              void tryPlay({ kind: 'card', uid: x.uid, ...(x.from ? { from: x.from } : {}), ...(modes ? { modes } : { mode }), ...(x.pay ? { pay: x.pay } : {}), ...chosenOf(d.chosen) });
            }
          }}
          onCancel={cancel}
        />
      );
    }
    return (
      <PaySheet
        view={view}
        me={me}
        card={card}
        def={def}
        info={pi}
        chosen={chosenOf(x)}
        {...(x.mode !== undefined ? { mode: x.mode } : {})}
        {...(x.modes ? { modes: x.modes } : {})}
        initial={x.pay ?? {}}
        onDone={(pay) => {
          setAsk(null);
          // 超過は対象を選ばない（落とした場所は使わない）
          const next: CardSel = { ...x, pay };
          if (pay.alt === 'overload') {
            delete next.enemy;
            delete next.ally;
          } else {
            // 選んだ使い方で合法でない対象は外す（対象選びからやり直す）
            const alt = pay.alt ? pi.pay?.alts?.find((a) => a.alt === pay.alt) : undefined;
            const t = alt ?? pi;
            if (next.enemy && !t.enemyTargets.some((y) => sameRef(y, next.enemy!))) delete next.enemy;
            if (next.ally && !t.allyTargets.includes(next.ally)) delete next.ally;
          }
          void tryPlay(next);
        }}
        onCancel={cancel}
      />
    );
  };

  // 操作バーの案内が大事なとき（対象選び・もうできることがない・対戦終了）。スマホの低い画面では、大事でない案内の代わりに直近の出来事を出す
  // 最初の2ターンは操作の案内（ドラッグ・緑のモンスター）を直近の出来事より優先する
  const hintKey = !!sel || nothingLeft || view.phase !== 'main' || !!view.pending || (myTurn && mine.turnsTaken <= 2);
  /** スマホの帯から開くプレイヤーの詳細（詰める前の全部入りのパネル） */
  const renderPlayerSheet = (): ReactNode => {
    if (playerOpen === null) return null;
    const p = playerOpen;
    const isMe = p === me;
    const ps = view.players[p];
    return (
      <Sheet open title={`${isMe ? 'あなた' : opponentLabel}の情報`} onClose={() => setPlayerOpen(null)} desktop="modal">
        <PlayerPanel
          ps={ps}
          isMe={isMe}
          tribes={tribesOf(p)}
          roleLabel={isMe ? 'あなた' : '相手'}
          portrait={isMe ? undefined : opponentPortrait}
          active={view.active === p && view.phase === 'main'}
          targetable={false}
          dropKey={`sheet:${p}`}
          onClick={() => undefined}
          // 捨て札・除外・待機ゾーンの一覧はこのシートの下に開いてしまうので、先にシートを閉じる
          onPile={(kind) => {
            setPlayerOpen(null);
            setPile({ player: p, kind });
          }}
          onPower={(pw) => setDetail({ kind: 'power', player: p, uid: pw.uid })}
          onWaiting={() => {
            setPlayerOpen(null);
            setWaitingOpen(p);
          }}
          hasCrown={view.crown === p}
          powerDef={(pw) => view.cards[pw.cardId]}
          powerFlash={replay.flash}
          {...(isMe
            ? {
                powerActivate: (pw: battle.PowerInst) => closingActivate(activateButtons(pw.uid), () => setPlayerOpen(null)),
                waitingUsable,
                discardUsable,
              }
            : {})}
        />
      </Sheet>
    );
  };

  const openCard = (cardId: string) => {
    if (view.cards[cardId]) setDetail({ kind: 'card', cardId });
  };
  const lastLog = view.log.length ? view.log[view.log.length - 1]! : null;

  return (
    <div
      ref={rootRef}
      className={cx(
        'battle',
        replay.playing && 'is-replaying',
        dragging && 'is-dragging',
        dragging && `is-dragging--${dragging.plan.mode}`,
        // スマホ：モンスターのいない場は細くして、もう一方の場に高さを回す
        boardOf(opp).length === 0 && 'is-bo-empty',
        boardOf(me).length === 0 && 'is-bm-empty',
      )}
      onPointerDownCapture={replay.playing ? replay.skip : undefined}
    >
      <header className="battle__head">
        <div className="battle__turn">
          <b>{turnLabel}</b>
          {phaseLabel && <span className={cx('badge', view.pending?.player === me ? 'badge--mine' : 'badge--enemy')}>{phaseLabel}</span>}
        </div>
        <MatchBand view={view} flash={replay.flash} />
        <div className="battle__status">{status}</div>
        <div className="battle__headbtns">
          {recap && <RecapButton onOpen={recapUi.open} />}
          <button type="button" className="btn btn--small btn--ghost battle__logbtn" aria-label="ログ" onClick={() => setLogOpen(true)}>
            <UiIcon name="gi:scroll-unfurled" />
            <span className="battle__logtext">ログ</span>
          </button>
          <button type="button" className="btn btn--small btn--ghost btn--icon" aria-label="メニュー" onClick={() => setMenuOpen(true)}>
            <UiIcon name="gi:cog" />
          </button>
        </div>
      </header>

      <div className="battle__pp battle__pp--opp">
        <PlayerPanel
          ps={theirs}
          isMe={false}
          tribes={tribesOf(opp)}
          roleLabel="相手"
          active={view.active === opp && view.phase === 'main'}
          targetable={isLit(oppRef)}
          dropHover={isHover(oppRef)}
          dropKey={targetKey(oppRef)}
          onClick={() => onTarget(oppRef)}
          onPile={(kind) => setPile({ player: opp, kind })}
          onPower={(pw) => setDetail({ kind: 'power', player: opp, uid: pw.uid })}
          onWaiting={() => setWaitingOpen(opp)}
          compact={phone}
          onOpen={() => setPlayerOpen(opp)}
          portrait={opponentPortrait}
          hasCrown={view.crown === opp}
          powerDef={(pw) => view.cards[pw.cardId]}
          powerFlash={replay.flash}
          flash={replay.flash[keyOf(oppRef)]}
          hpShown={replay.hp[opp]}
        />
      </div>
      <div className="battle__board battle__board--opp">{renderBoard(opp)}</div>
      <div className="battle__board battle__board--me">
        {renderBoard(me)}
      </div>
      <div className="battle__pp battle__pp--me">
        <PlayerPanel
          ps={mine}
          isMe
          tribes={tribesOf(me)}
          roleLabel="あなた"
          active={view.active === me && view.phase === 'main'}
          targetable={isLit(meRef)}
          dropHover={isHover(meRef)}
          dropKey={targetKey(meRef)}
          onClick={() => onTarget(meRef)}
          onPile={(kind) => setPile({ player: me, kind })}
          onPower={(pw) => setDetail({ kind: 'power', player: me, uid: pw.uid })}
          hasCrown={view.crown === me}
          powerDef={(pw) => view.cards[pw.cardId]}
          powerFlash={replay.flash}
          flash={replay.flash[keyOf(meRef)]}
          hpShown={replay.hp[me]}
          powerActivate={(pw) => activateButtons(pw.uid)}
          onWaiting={() => setWaitingOpen(me)}
          waitingUsable={waitingUsable}
          waitingLit={!!dragging?.plan.waiting}
          waitingHover={!!dragging?.plan.waiting && dragging.hover === 'waiting'}
          discardUsable={discardUsable}
          pileLit={!!dragging?.plan.pile}
          pileHover={!!dragging?.plan.pile && dragging.hover === 'pile'}
          compact={phone}
          onOpen={() => setPlayerOpen(me)}
          onPowers={() => setPowersOpen(true)}
        />
      </div>

      <div className={cx('battle__hand', !myTurn && 'is-dim')} data-drop="hand" data-fx="hand:me">
        <div className="hand__meta">
          <span>手札 {mine.hand.length}枚</span>
          {myTurn && <span className={cx('hand__usable', playableCount > 0 && 'is-some')}>使える：{playableCount}枚</span>}
          {!myTurn && view.phase === 'main' && <span className="hand__wait">{view.pending ? '選択待ち' : `${opponentLabel}のターン`}</span>}
          {dragging && <span className="hand__drop">手札に戻すと取り消し</span>}
        </div>
        <div className="hand" role="list" aria-label="手札（押すと詳細、場へドラッグで使う）">
          {/* 1枚ずつの枠（PC のマウスでは、入りきらないとき枠が縮んでカードが重なり、乗せたカードが手前に出る。スマホは枠が無いのと同じ） */}
          {mine.hand.map((c) => (
            <div key={c.uid} className="hand__slot" role="listitem">
              <HandCard
                card={c}
                def={view.cards[c.cardId]}
                info={infos.get(c.uid)!}
                energy={mine.energy}
                playable={isPlayable(c)}
                selected={sel?.kind === 'card' && sel.uid === c.uid}
                dim={!myTurn}
                fresh={freshHand.has(c.uid)}
                dragging={drag.drag?.src.kind === 'card' && drag.drag.src.uid === c.uid ? drag.drag.plan.mode : null}
                onClick={() => onHandTap(c)}
                onDetail={() => {
                  // 長押しの判定中にドラッグが始まっていたら詳細は開かない
                  if (drag.isActive() || drag.consumeClick()) return;
                  setDetail({ kind: 'hand', uid: c.uid });
                }}
                onPointerDown={view.phase === 'main' ? (e) => drag.begin(e, 'hand', () => cardSource(c)) : undefined}
                onHover={canHover ? (el) => setHover(el && view.cards[c.cardId] ? { el, def: view.cards[c.cardId]! } : null) : undefined}
              />
            </div>
          ))}
          {mine.hand.length === 0 && (
            <span className="board__empty hand__empty">
              {view.phase === 'main' && view.active !== me ? `${opponentLabel}のターン中です。次のあなたのターンに5枚引きます` : '手札なし'}
            </span>
          )}
        </div>
      </div>

      <aside className="battle__log" aria-label="ログ">
        <h2>ログ</h2>
        {!phone && recap && <RecapLogButton onOpen={recapUi.open} />}
        {!phone && <LogPanel log={view.log} me={me} names={names} onCard={openCard} />}
      </aside>

      <div className={cx('battle-bar', hintKey && 'has-key-hint')}>
        {/* 相手のターンのまとめ（決定事項 #126）：自分のターンの始めに、直近の出来事の行に数秒だけ出して畳む（場には重ねない）。畳んだあとは見出しの「まとめ」 */}
        {recap && recapUi.mode === 'auto' && recapReady ? (
          <RecapStrip recap={recap} className="battle-bar__ticker" onOpen={recapUi.open} onClose={recapUi.close} onShown={recapUi.shown} />
        ) : (
          <button type="button" className="battle-bar__ticker" onClick={() => setLogOpen(true)} aria-live="polite" aria-label="直近の出来事（タップでログ）">
            <span className="battle-bar__tickicon" aria-hidden="true">
              <UiIcon name="gi:scroll-unfurled" />
            </span>
            <span className="battle-bar__ticktext">
              <ReplayTicker store={replay.overlay} fallback={lastLog?.text ?? ''} names={names} me={me} />
            </span>
          </button>
        )}
        {candidates.length > 0 && (
          <div className="battle-bar__cands" role="group" aria-label="対象の候補">
            {candidates.map((t) => (
              <button key={keyOf(t)} type="button" className="btn btn--small cand" onClick={() => onTarget(t)}>
                {targetLabel(t)}
              </button>
            ))}
          </div>
        )}
        <div className="battle-bar__row">
          <div className={cx('battle-bar__hint', nothingLeft && !sel && 'is-ok', hintKey && 'is-key')} aria-live="polite">
            {hint}
          </div>
          <div className={cx('battle-bar__btns', view.phase === 'ended' && 'battle-bar__btns--ended')}>
            {targetSel?.kind === 'card' && needAlly && !needEnemy && info?.allyTargets.includes(targetSel.uid) && (
              <button type="button" className="btn btn--primary" onClick={() => void tryPlay({ ...targetSel, ally: targetSel.uid })}>
                このモンスター自身
              </button>
            )}
            {sel && (
              <button type="button" className="btn" onClick={() => setSel(null)}>
                やめる
              </button>
            )}
            {view.phase === 'ended' ? (
              <>
                {endActions}
                <button type="button" className={cx('btn', !endPrimary && 'btn--primary')} onClick={() => setResultHidden(false)}>
                  結果<span className="battle-bar__more">を見る</span>
                </button>
                {endPrimary}
              </>
            ) : (
              !sel && (
                <button type="button" className={cx('btn btn--primary btn--end battle-bar__end', nothingLeft && 'is-pulse')} disabled={!myTurn} onClick={() => void endTurn()}>
                  ターン終了
                  {myTurn && (
                    <span className="battle-bar__energy" role="img" aria-label={`エナジー${mine.energy}`}>
                      <EnergyGem n={mine.energy} size="btn" />
                    </span>
                  )}
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* 演出のオーバーレイ（飾りは演出の層 FxLayer、見出しとカードの提示は React） */}
      <FxLayer rootRef={rootRef} env={fxEnv} level={fx.level} directorRef={fxRef} />
      <ReplayOverlays store={replay.overlay} cards={view.cards} opponentLabel={opponentLabel} fxRef={fxRef} />
      {recap && recapUi.mode === 'open' && <RecapPanel recap={recap} onClose={recapUi.close} onCard={openCard} />}
      {hover && canHover && !sel && !drag.drag && !detail && <HoverPreview anchor={hover.el} def={hover.def} />}
      {drag.drag && (
        <DragLayer
          drag={drag.drag}
          subscribe={drag.subscribe}
          getPos={drag.getPos}
          rootRef={rootRef}
          ghost={
            dragCard && dragInfo ? (
              <HandCard
                card={dragCard}
                def={view.cards[dragCard.cardId]}
                info={dragInfo}
                energy={mine.energy}
                playable={!dragInfo.blocked}
                selected={false}
                dim={false}
                onClick={() => undefined}
                ghost
              />
            ) : dragActivate ? (
              <span className="act-ghost">
                ⚡{dragActivate.cost} {dragActivate.name}
                {dragSrc?.kind === 'reveal' ? '（表にする）' : dragSrc?.kind === 'activate' && dragSrc.use ? `（${dragSrc.use === 'level' ? 'Lvアップ' : `忠誠${(dragActivate as battle.ActivateInfo).label ?? ''}`}）` : ''}
              </span>
            ) : null
          }
        />
      )}
      {dragging && <DamagePreview preview={damagePreview} me={me} isMine={isMineRef} rootRef={rootRef} />}

      {view.phase === 'mulligan' && !mine.mulligan.done && !busy && <MulliganDialog view={view} me={me} onAction={act} timeLeft={timeLeft} />}
      {view.pending && view.pending.player === me && !busy && <ChoiceDialog view={view} me={me} onAction={act} timeLeft={timeLeft} />}
      {ended && resultReady && !resultHidden && (
        <ResultDialog view={view} me={me} onHide={() => setResultHidden(true)}>
          {resultButtons}
          <FeedbackButton onClick={() => setFeedbackFrom('result')} />
        </ResultDialog>
      )}
      {renderDetail()}
      {feedbackFrom && (
        <FeedbackSheet
          source={feedbackFrom}
          onClose={() => setFeedbackFrom(null)}
          cards={matchCards(view)}
          context={() => ({ v: 1, match: matchContext(view, me, feedbackExtra) })}
          contextLabel="この対戦の記録（ログとこの対戦のカード）を添える"
        />
      )}
      {pile && pile.player === me && pile.kind === 'discard' ? (
        // 自分の捨て札（MTG 要素 ○ バッチC1）：捨て札から使えるカードは光り、盤面へドラッグして使う（押すと詳細と「捨て札から使う」）
        <Sheet open title={`あなたの捨て札（${mine.discard.length}枚）`} onClose={() => setPile(null)} desktop="modal">
          {discardUsable > 0 && <p className="hint pile-hint">{phone ? '光っているカードは横へドラッグして盤面で離すと使えます（押すと詳細）' : '光っているカードは盤面へドラッグすると使えます（押すと詳細）'}</p>}
          <div className="crow-list">
            {/* 捨て札から使えるカードを上に、ほかは新しい順 */}
            {[...mine.discard]
              .reverse()
              .sort((a, b) => Number(discardInfos.has(b.uid) || discardAbilitiesOf(b.uid).length > 0) - Number(discardInfos.has(a.uid) || discardAbilitiesOf(a.uid).length > 0))
              .map((c) => {
              const def = view.cards[c.cardId];
              const i = discardInfos.get(c.uid);
              const abil = discardAbilitiesOf(c.uid);
              const usable = myTurn && ((!!i && !i.blocked) || abil.some((d) => !d.blocked));
              const grab = !!i || abil.length > 0;
              return (
                <div
                  key={c.uid}
                  className={cx('pile-row', grab && 'pile-row--fd', usable && 'is-usable', c.discardedTurn === view.turnIndex && 'is-recent')}
                  data-pile-card={c.uid}
                  onPointerDown={grab && view.phase === 'main' ? (e) => drag.begin(e, 'list', () => discardSource(c)) : undefined}
                >
                  <CardRow
                    def={def}
                    label={battle.cardName(view, c.cardId)}
                    picked={false}
                    mark=""
                    onToggle={() => {
                      if (drag.consumeClick()) return;
                      if (grab) setDetail({ kind: 'discard', uid: c.uid });
                      else if (def) setZoom(def);
                    }}
                    onZoom={setZoom}
                  />
                  {/* このターン手札から捨てたカード（大混乱で使える。MTG 要素 △ バッチB） */}
                  {c.discardedTurn === view.turnIndex && <span className="pile-row__tag pile-row__tag--recent">このターン捨てた</span>}
                  {i && (
                    <span className={cx('pile-row__tag', myTurn && !i.blocked && 'is-ok')}>
                      {i.fromDiscard?.name}・⚡{i.cost}
                      {myTurn && i.blocked ? `（${i.blocked}）` : ''}
                    </span>
                  )}
                  {/* 捨て札のカードの能力（MTG 要素 △ バッチB）：押すと使う（対象が要れば対象選び） */}
                  {abil.length > 0 && (
                    <span className="pile-row__btns">
                      {abil.map((d) => (
                        <button
                          key={d.ability}
                          type="button"
                          className={cx('btn btn--small', myTurn && !d.blocked && 'btn--primary')}
                          disabled={!myTurn || !!d.blocked}
                          title={d.blocked ?? undefined}
                          onClick={() => void tapDiscardAbility(c.uid, d.ability)}
                        >
                          {DISCARD_ICON[d.ability]} {d.name}
                          {d.cost > 0 ? ` ⚡${d.cost}` : ''}
                        </button>
                      ))}
                      {myTurn && abil.every((d) => d.blocked) && <small className="pile-row__tag">（{abil[0]!.blocked}）</small>}
                    </span>
                  )}
                </div>
              );
            })}
            {mine.discard.length === 0 && <p className="hint">なし</p>}
          </div>
        </Sheet>
      ) : (
        pile && (
          <Modal title={`${pile.player === me ? 'あなた' : opponentLabel}の${pile.kind === 'discard' ? '捨て札' : '除外'}（${view.players[pile.player][pile.kind].length}枚）`} onClose={() => setPile(null)}>
            <div className="crow-list">
              {view.players[pile.player][pile.kind].map((c) => {
                const def = view.cards[c.cardId];
                return <CardRow key={c.uid} def={def} label={battle.cardName(view, c.cardId)} picked={false} mark="" onToggle={() => def && setZoom(def)} onZoom={setZoom} />;
              })}
              {view.players[pile.player][pile.kind].length === 0 && <p className="hint">なし</p>}
            </div>
          </Modal>
        )
      )}
      {ask && renderAsk()}
      {enlistAsk &&
        (() => {
          const m = battle.findMonster(view, enlistAsk.uid);
          if (!m) return null;
          return (
            <EnlistSheet
              view={view}
              attacker={m}
              options={battle.enlistOptions(view, m)}
              onPick={(helper) => {
                setEnlistAsk(null);
                act({ type: 'attack', player: me, attackerUid: enlistAsk.uid, target: enlistAsk.target, ...(helper ? { enlistUid: helper } : {}) });
              }}
              onCancel={() => setEnlistAsk(null)}
            />
          );
        })()}
      {pileAsk && (
        <AbilityChoiceSheet
          title="手札から使う能力を選ぶ"
          items={pileAsk.abilities.map((k) => {
            const h = handAbilities.get(pileAsk.uid)?.find((x) => x.ability === k);
            return { id: k, label: `${HAND_ICON[k]} ${h?.name ?? k}（⚡${h?.cost ?? 0}）`, blocked: h?.blocked ?? null };
          })}
          onPick={(id) => {
            const uid = pileAsk.uid;
            setPileAsk(null);
            void tryHandAbility(uid, id as battle.HandAbilityKind);
          }}
          onCancel={() => setPileAsk(null)}
        />
      )}
      {asideAsk && (
        <AbilityChoiceSheet
          title="待機させ方を選ぶ"
          items={asideAsk.kinds.map((k) => {
            const x = setAsides.get(asideAsk.uid)?.find((y) => y.kind === k);
            return { id: k, label: `${abilityGlossary[`ability:${k}`]?.icon ?? '⏳'} ${x?.name ?? k}（⚡${x?.cost ?? 0}）：${x?.note ?? ''}`, blocked: x?.blocked ?? null };
          })}
          onPick={(id) => {
            const uid = asideAsk.uid;
            setAsideAsk(null);
            void trySetAside(uid, [id as battle.SetAsideKind]);
          }}
          onCancel={() => setAsideAsk(null)}
        />
      )}
      {waitingOpen !== null && (
        // 待機ゾーン（MTG 要素 △ バッチC）：自分のは使えるカードが光り、盤面へドラッグして使う（押すと詳細）。相手の予顕は裏向き
        <Sheet open title={`${waitingOpen === me ? 'あなた' : opponentLabel}の待機ゾーン（${(view.players[waitingOpen].waiting ?? []).length}/${BALANCE.battle.maxWaiting}）`} onClose={() => setWaitingOpen(null)} desktop="modal">
          <p className="hint pile-hint">{mechanicGlossary.waiting!.short}</p>
          <div className="crow-list">
            {(view.players[waitingOpen].waiting ?? []).map((w) => {
              const def = view.cards[w.card.cardId];
              const i = waitingOpen === me ? waitingInfos.get(w.card.uid) : undefined;
              const usable = myTurn && !!i && !i.blocked;
              return (
                <div
                  key={w.card.uid}
                  className={cx('pile-row', i && 'pile-row--fd', usable && 'is-usable')}
                  data-waiting-card={w.card.uid}
                  onPointerDown={i && view.phase === 'main' ? (e) => drag.begin(e, 'list', () => waitingSource(w.card)) : undefined}
                >
                  {def ? (
                    <CardRow
                      def={def}
                      label={battle.cardName(view, w.card.cardId)}
                      picked={false}
                      mark=""
                      onToggle={() => {
                        if (drag.consumeClick()) return;
                        setDetail({ kind: 'waiting', player: waitingOpen, uid: w.card.uid });
                      }}
                      onZoom={setZoom}
                    />
                  ) : (
                    // 相手の予顕のカードは裏向き（中身は見えない）
                    <div className="pile-row__hidden">{BALANCE.battle.faceDownIcon} 裏向きのカード</div>
                  )}
                  <span className={cx('pile-row__tag', usable && 'is-ok')}>
                    {waitingNote(w, view.turnIndex)}
                    {i ? `・⚡${i.cost}` : ''}
                    {/* 置いたターンの「使えない」は説明と重なるので出さない */}
                    {myTurn && i?.blocked && w.since < view.turnIndex ? `（${i.blocked}）` : ''}
                  </span>
                </div>
              );
            })}
            {(view.players[waitingOpen].waiting ?? []).length === 0 && <p className="hint">なし</p>}
          </div>
        </Sheet>
      )}
      {renderPlayerSheet()}
      {powersOpen && (
        <Sheet open title={`あなたのパワー（${mine.powers.length}/${BALANCE.battle.maxPowers}）`} onClose={() => setPowersOpen(false)} desktop="modal">
          <PowersList
            ps={mine}
            powerDef={(pw) => view.cards[pw.cardId]}
            powerActivate={(pw) => closingActivate(activateButtons(pw.uid), () => setPowersOpen(false))}
            onPower={(pw) => setDetail({ kind: 'power', player: me, uid: pw.uid })}
            powerFlash={replay.flash}
          />
        </Sheet>
      )}
      <ZoomModal def={zoom} onClose={() => setZoom(null)} />
      {phone && (
        <Sheet open={logOpen} title="ログ" onClose={() => setLogOpen(false)}>
          {recap && (
            <RecapLogButton
              onOpen={() => {
                setLogOpen(false);
                recapUi.open();
              }}
            />
          )}
          <LogPanel log={view.log} me={me} names={names} onCard={openCard} />
        </Sheet>
      )}
      <Sheet open={menuOpen} title="メニュー" onClose={() => setMenuOpen(false)} desktop="modal">
        <div className="menu-list">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setMenuOpen(false);
              navigate('/rules');
            }}
          >
            <UiIcon name="gi:rule-book" />
            ルールを見る
          </button>
          {menuItems}
          {/* 報告・要望（決定事項 #129）：対戦の途中ならバグ、決着後なら結果の画面と同じ */}
          <button
            type="button"
            className="btn"
            onClick={() => {
              setMenuOpen(false);
              setFeedbackFrom(view.phase === 'ended' ? 'result' : 'battle');
            }}
          >
            <UiIcon name="scroll-quill" />
            <span className="menu-list__text">
              報告・要望を送る
              <small>バグ・バランス（強すぎ・OTK など）・ご要望</small>
            </span>
          </button>
          {/* 設定（文字の大きさ・演出・効果音と BGM）：上の帯の歯車と同じ中身 */}
          <SettingsPanel />
          <button type="button" className="btn btn--danger" disabled={view.phase === 'ended'} onClick={() => void concede()}>
            <UiIcon name="gi:flying-flag" />
            降参する
          </button>
        </div>
      </Sheet>
    </div>
  );
}

/** シートの中の起動のボタン：押したら先にシートを閉じる（対象選びは盤面で） */
function closingActivate(list: ActivateButton[], close: () => void): ActivateButton[] {
  return list.map((a) => ({
    ...a,
    onTap: () => {
      close();
      a.onTap();
    },
  }));
}

/** 手札から使う能力のアイコン（サイクリング・魂力・予見） */
const HAND_ICON: Record<battle.HandAbilityKind, string> = { cycling: '♻', channel: '🌀', forecast: '🔮' };
/** 捨て札のカードの能力のアイコン（相続・発掘・不朽） */
const DISCARD_ICON: Record<battle.DiscardAbilityKind, string> = { renew: '🏺', dredge: '🪣', embalm: '⚱' };

/** 待機ゾーンのカードの短い説明（種類と、いつ使えるか） */
function waitingNote(w: battle.WaitingCard, turnIndex: number): string {
  const name = battle.WAITING_LABEL[w.kind];
  if (w.kind === 'suspend') return `${name}：あと${w.time ?? 1}ターンで無料で使われる`;
  const later = w.since >= turnIndex ? '（次の自分のターンから）' : '';
  if (w.kind === 'foretell') return `${name}：後のターンに安く使える${later}`;
  if (w.kind === 'plot') return `${name}：後のターンに無料で使える${later}`;
  return `${name}：後のターンに出せる${later}`;
}

/** コストの内訳の行（詳細に出す。MTG 要素 ○ バッチC1） */
function costLines(i: battle.PlayInfo): string[] {
  const steps = i.breakdown?.steps ?? [];
  const out: string[] = [];
  if (steps.length > 0) out.push(`コスト${i.printedCost ?? ''} → ${i.cost}（${battle.costNotes(i.breakdown!)}）`);
  if (i.kicker) out.push(`キッカー：追加でエナジー${i.kicker.extra}（${i.kicker.payable ? '払える' : '今は払えない'}）`);
  if (i.fromDiscard?.exileCount) out.push(`${i.fromDiscard.name}：他の捨て札を${i.fromDiscard.exileCount}枚除外して使う`);
  if (i.fromDiscard?.discardChoices) out.push(`${i.fromDiscard.name}：手札を1枚捨てて使う`);
  // MTG 要素 △ バッチB：支払いのシートで選べるもの
  const p = i.pay;
  if (p) {
    for (const a of p.alts ?? []) out.push(`${a.name}：${a.note}（⚡${a.cost}${a.blocked ? `・${a.blocked}` : ''}）`);
    if (p.extra) out.push(`${p.extra.name}：1回+${p.extra.unit}⚡（${p.extra.max}回まで）`);
    if (p.sacrifice) out.push(`${p.sacrifice.name}：差し出せるもの${p.sacrifice.options.length}つ`);
    if (p.tap) out.push(`${p.tap.name}：休ませられるモンスター${p.tap.options.length}体`);
    if (p.delve) out.push(`探査：捨て札を${p.delve.max}枚まで除外して安く`);
    if (p.pitch) out.push(`代替コスト：同じ種類の手札${p.pitch.options.length}枚から除外できる`);
    if (p.lifePay) out.push(`血の支払い：HP${p.lifePay.hpPer}ずつで${p.lifePay.max}つまで`);
    if (p.minCost < i.cost) out.push(`払い方しだいで⚡${p.minCost}まで下がる`);
  }
  if (i.villain) out.push('最悪の二択：モードは相手が選ぶ');
  return out;
}

/** 詳細の「⚡ 起動」ボタン（Lvアップ・忠誠+1／−K も。使えなければ理由） */
function ActivateAction({ info, onUse }: { info: battle.ActivateInfo; onUse: () => void }) {
  return (
    <>
      <button type="button" className="btn" disabled={!!info.blocked} onClick={onUse}>
        {info.use === 'level' ? `⬆ Lvアップ（${info.label ?? ''}` : info.use ? `💠 忠誠${info.label ?? ''}（` : '⚡ 起動（'}エナジー{info.cost}）
      </button>
      {info.blocked && <span className="cdetail__why">{info.blocked}</span>}
    </>
  );
}

/** PC でカードにマウスを乗せたとき、手札の上に全文のカードを出す */
function HoverPreview({ anchor, def }: { anchor: HTMLElement; def: CardDef }) {
  const r = anchor.getBoundingClientRect();
  // 大きいカード（cardFrame.css の .tcg--lg：240×336 と、はみ出す宝石・紋章）
  const W = 250;
  const H = 356;
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, r.left + r.width / 2 - W / 2));
  const top = Math.max(8, r.top - H - 10);
  return (
    <div className="hand-preview" style={{ left, top }} aria-hidden="true">
      <CardView card={def} />
    </div>
  );
}

/** 相手が使ったカードの提示。出たときに1回だけ、演出の層に動かしてもらう（飛んで来る → 照準 → 対象へ） */
function RevealOverlay({ children, onMount }: { children: ReactNode; onMount: (el: HTMLElement) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useRef(onMount);
  mounted.current = onMount;
  useLayoutEffect(() => {
    if (ref.current) mounted.current(ref.current);
  }, []);
  return (
    <div className="fx-reveal" aria-hidden="true" ref={ref}>
      <div className="fx-reveal__fly">{children}</div>
    </div>
  );
}

/** 見出しとカードの提示（演出の1件ごとに変わる。盤面を描き直さないよう、ここだけが読む） */
function ReplayOverlays({ store, cards, opponentLabel, fxRef }: { store: OverlayStore; cards: Record<string, CardDef>; opponentLabel: string; fxRef: { current: FxDirector | null } }) {
  const { banner, reveal } = useOverlay(store);
  const def = reveal ? cards[reveal.cardId] : undefined;
  return (
    <>
      {banner && (
        <div className={cx('fx-banner', `fx-banner--${banner.tone}`, banner.big && 'fx-banner--big')} aria-hidden="true">
          {banner.gi && <UiIcon name={`gi:${banner.gi}`} className="fx-banner__gi" />}
          {banner.text}
        </div>
      )}
      {reveal && def && (
        <RevealOverlay key={reveal.id} onMount={(el) => fxRef.current?.revealCard(el, reveal.show, reveal.ms)}>
          <div className="fx-reveal__card">
            <CardView card={def} />
          </div>
          <div className="fx-reveal__text">
            {opponentLabel}が「{def.name}」を使った
            {reveal.show.abilityId && abilityGlossary[reveal.show.abilityId] ? `（${abilityGlossary[reveal.show.abilityId]!.name}）` : ''}
          </div>
        </RevealOverlay>
      )}
    </>
  );
}

/** 操作バーの直近の出来事（演出中はその1件、終わったら最後のログ） */
function ReplayTicker({ store, fallback, names, me }: { store: OverlayStore; fallback: string; names: ReturnType<typeof logNamesOf>; me: battle.PlayerId }) {
  const { ticker } = useOverlay(store);
  return <LogText text={ticker || fallback} names={names} me={me} />;
}
