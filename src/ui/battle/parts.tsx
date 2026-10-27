/** 対戦画面の部品：プレイヤー情報、モンスター、手札、ログ、状態異常の札（説明はポップオーバー） */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { BALANCE, battle, CARD_TYPE_LABEL, CONDITIONS, analyzeCard, describeEffect, getEffect, LEADERS, TIMINGS, toLeaderId, TRIBE_LABEL, type CardDef } from '../../engine/index.ts';
import { CardArt, NOISE_ART } from '../components/CardArt.tsx';
import { CostGem, Emblem, frameClasses, nameFit } from '../components/cardParts.tsx';
import { Popover, type PopoverCard } from '../components/Popover.tsx';
import { glossary, keywordGlossary, mechanicGlossary, type GlossaryEntry } from '../glossary.ts';
import { cx } from '../util.ts';
import { UiIcon } from '../components/UiIcon.tsx';
import { logGi, stripOptionIcons, tokenizeLog, type LogNames } from './logFormat.ts';
import { monsterForecasts, summarizeCard } from './summary.ts';
import { dayNightBand, fieldBand } from './matchOptions.ts';
import { briefFace, briefLabel, HAND_BADGE_ICON, isTauntChip, overflowItems, tileChipOrder } from './compact.ts';

type Statuses = battle.Statuses;
type PlayerId = battle.PlayerId;


/** 数が増えたら ms の間だけ true（捨て札の山を光らせる） */
function useBump(n: number, ms = 1500): boolean {
  const prev = useRef(n);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const grew = n > prev.current;
    prev.current = n;
    if (!grew) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [n, ms]);
  return on;
}

export interface Chip {
  id: string;
  /** 札の文字（絵文字つき。読み上げ・title・詳細の一覧に使う） */
  label: string;
  tone: 'bad' | 'good' | 'info' | 'kw' | 'power';
  card: PopoverCard;
  /** 札に描く形（game-icons。UI2：絵文字の代わり。無ければ label の絵文字のまま） */
  gi?: string;
  /** 形のあとに添える文字（gi があるとき。label から絵文字を外したもの） */
  text?: string;
}

const chipOf = (g: GlossaryEntry, value: string, lines: ReactNode[] = []): Omit<Chip, 'id'> => ({
  label: `${g.name}${value}`,
  tone: g.tone,
  card: { title: `${g.name}${value ? ` ${value}` : ''}`, description: g.short, lines },
  ...(g.gi ? { gi: g.gi, text: value } : {}),
});

/**
 * 仕組みの札（モンスターのタイル・詳細）。形は用語集の gi、文字は text、見出しは名前だけ（絵文字を使わない。UI2 の統合）。
 * 形が無い用語は、読み上げの label の文字だけの札になる（tests/battle/ui2Battle.test.ts が「全部に形がある」を確かめる）
 */
export function glossChip(id: string, g: GlossaryEntry, text: string, tone: Chip['tone'], card: Partial<PopoverCard> = {}): Chip {
  return { id, label: text, tone, ...(g.gi ? { gi: g.gi, text } : {}), card: { title: card.title ?? g.name, description: card.description ?? g.short, ...(card.lines ? { lines: card.lines } : {}) } };
}

/** 札の見出し（形があれば形＋名前） */
export function ChipTitle({ c }: { c: Pick<Chip, 'gi' | 'card'> }) {
  return (
    <>
      {c.gi && <ChipIcon gi={c.gi} />}
      {c.card.title}
    </>
  );
}

/** 形の色：毒は緑・やけどは橙（色の意味は絵文字のときのまま）、休眠・一時蘇生は濃い赤（細い形が札の大きさで沈まないように）。ほかは札の文字の色 */
const GI_TONE: Record<string, string> = { 'poison-bottle': 'poison', flame: 'fire', 'death-zone': 'poison', 'night-sleep': 'alert', 'raise-zombie': 'alert' };

/** 札の形（状態異常・キーワード）。大きさは文字の 1.15 倍 */
export function ChipIcon({ gi }: { gi: string }) {
  return <UiIcon name={`gi:${gi}`} className={cx('u-sticon', GI_TONE[gi] && `u-sticon--${GI_TONE[gi]}`)} />;
}

/** 札の中身：形があれば形＋文字、無ければ絵文字つきの文字のまま */
export function ChipFace({ c }: { c: Pick<Chip, 'label' | 'gi' | 'text'> }) {
  if (!c.gi) return <>{c.label}</>;
  return (
    <>
      <ChipIcon gi={c.gi} />
      {c.text}
    </>
  );
}

/** 状態異常・持続効果を小さな札にする。説明文は用語集（glossary.ts）と共通 */
export function statusChips(s: Statuses, isPlayer: boolean): Chip[] {
  const G = glossary;
  const out: Chip[] = [];
  const add = (id: string, cond: unknown, chip: Omit<Chip, 'id'>) => cond && out.push({ id, ...chip });
  add('poison', s.poison, chipOf(G.poison, String(s.poison), [`次の自分のターン開始時に${s.poison}ダメージ → そのあと${Math.floor(s.poison / 2)}に`]));
  add('doom', s.doom, chipOf(G.doom, String(s.doom ?? 0), [`自分のターン開始時に毎回${s.doom ?? 0}ダメージ（減らない。浄化で消える）`]));
  // MTG 要素 △ バッチA：放射能
  add('rad', s.rad, chipOf(G.rad, String(s.rad ?? 0), [`次の自分のターン開始時に山札の上${s.rad ?? 0}枚を捨て札へ（モンスター以外1枚ごとに${BALANCE.battle.radDamage}ダメージ）`]));
  add('burn', s.burn, chipOf(G.burn, `${s.burn}T`, [`残り${s.burn}ターン（与えるダメージが半分）`]));
  add('weak', s.weak, chipOf(G.weak, String(s.weak), [`残り${s.weak}つ（与えるダメージが1発${BALANCE.battle.exhaustCap}まで）`]));
  add('vulnerable', s.vulnerable, chipOf(G.vulnerable, `${s.vulnerable}T`, [`残り${s.vulnerable}ターン`]));
  add('bleed', s.bleed, chipOf(G.bleed, String(s.bleed), [`次に受けるダメージに+${s.bleed}`]));
  add('freezeP', s.freezePending, chipOf(G.freeze, '次', ['次の自分のターンに発効']));
  add('freezeA', s.freezeActive, chipOf(G.freeze, '中', ['このターン発効中']));
  add('confuseP', s.confusePending, chipOf(G.confuse, '次', ['次の持ち主のターンに発効']));
  add('confuseA', s.confuseActive, chipOf(G.confuse, '中', ['このターンは自動で攻撃した']));
  if (isPlayer) {
    add('strength', s.strength, chipOf(G.strength, String(s.strength), [`アタックの最初の1発に+${s.strength}`]));
    add('focus', s.focus, chipOf(G.focus, String(s.focus), ['ターン終了時に消える']));
    add('counter', s.counter, chipOf(G.counter, String(s.counter), ['次の自分のターン開始時まで']));
    add('nullify', s.nullify, chipOf(G.nullify, String(s.nullify), [`あと${s.nullify}回`]));
    add('regen', s.regen, chipOf(G.regen, String(s.regen), [`次の自分のターン開始時に${s.regen}回復 → そのあと${Math.floor(s.regen / 2)}に`]));
  }
  return out;
}

export function Chips({ chips, className }: { chips: Chip[]; className?: string }) {
  if (chips.length === 0) return null;
  return (
    <div className={cx('chips-row', className)}>
      {chips.map((c) => (
        <Popover key={c.id} content={{ ...c.card, title: <ChipTitle c={c} /> }} placement="top">
          <span className={`st st--${c.tone}`} aria-label={c.gi ? c.label : undefined}>
            <ChipFace c={c} />
          </span>
        </Popover>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- プレイヤー

interface PlayerPanelProps {
  ps: battle.PlayerState;
  isMe: boolean;
  active: boolean;
  targetable: boolean;
  /** 対象として選ばれている（あなたのターン中、攻撃・効果の対象候補） */
  onClick: () => void;
  onPile: (pile: 'discard' | 'exile') => void;
  flash?: string;
  /** 演出中の HP（なければ実際の値） */
  hpShown?: number;
  /** 見出しに添える短いラベル（「あなた」「相手」） */
  roleLabel: string;
  /** ドラッグの落とし先の鍵（p:0 / p:1） */
  dropKey: string;
  /** ドラッグ中、この上で離すと決まる */
  dropHover?: boolean;
  /** パワーを押したとき（詳細を開く） */
  onPower?: (pw: battle.PowerInst) => void;
  // ---- MTG 要素 ○ バッチC1
  /** パワーの起動の ⚡ ボタン（起動の能力があるパワーだけ） */
  powerActivate?: (pw: battle.PowerInst) => ActivateButton[];
  /** 捨て札から使えるカードの数（捨て札の山にバッジ） */
  discardUsable?: number;
  /** ドラッグ中、捨て札の山に落とせる（サイクリング・魂力） */
  pileLit?: boolean;
  /** ドラッグ中、捨て札の山の上で離すと決まる */
  pileHover?: boolean;
  // ---- MTG 要素 ○ バッチC2
  /** 王冠を持っている（GameState.crown がこのプレイヤー） */
  hasCrown?: boolean;
  /** パワーのカード定義（英雄譚の全章数・蓄積の必要数の表示） */
  powerDef?: (pw: battle.PowerInst) => CardDef | undefined;
  /** 演出中のパワーの札の光（キーはパワーの uid。起動・英雄譚の章・蓄積） */
  powerFlash?: Record<string, string>;
  // ---- MTG 要素 △ バッチC
  /** 待機ゾーンを押したとき（一覧を開く） */
  onWaiting?: () => void;
  /** ドラッグ中、待機ゾーンに落とせる（予顕・計画・待機） */
  waitingLit?: boolean;
  /** ドラッグ中、待機ゾーンの上で離すと決まる */
  waitingHover?: boolean;
  /** 待機ゾーンから使えるカードの数（バッジ） */
  waitingUsable?: number;
  // ---- スマホの詰めた表示（1行の帯。細かい情報は onOpen の詳細へ）
  compact?: boolean;
  /** 帯を押したとき（対象選び中でなければ）：プレイヤーの詳細を開く */
  onOpen?: () => void;
  /** 帯の「✦N」を押したとき：パワーの一覧を開く（自分） */
  onPowers?: () => void;
  /** PC の銘板の肖像（game-icons の名前。CPU は強さで形が変わる。リーダーがいればリーダーの絵。UI2） */
  portrait?: string;
}

/** 起動の ⚡ ボタン（モンスター・パワー）。使えないときは灰色で、押すと理由を出す */
export interface ActivateButton {
  cost: number;
  /** ボタンの印（省略は ⚡。MTG 要素 △ バッチC：Lvアップ ⬆・忠誠 +1／−K・表にする 🂠） */
  icon?: string;
  /** 何をするか（読み上げ・理由の見出し。省略は「起動」） */
  title?: string;
  /** 区別のための鍵（同じカードに複数あるとき） */
  key?: string;
  blocked: string | null;
  /** 押したとき（対象が要らなければ起動、要るなら対象選びへ） */
  onTap: () => void;
  /** つかんだとき（対象へドラッグ） */
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  /** ドラッグ中（元のボタンを強調） */
  dragging?: boolean;
}

/** 起動の ⚡ ボタン（MTG 要素 ○ バッチC1） */
export function ActivateBtn({ a, name, className }: { a: ActivateButton; name: string; className?: string }) {
  const btn = (
    <button
      type="button"
      className={cx('act-btn', a.blocked && 'is-blocked', a.dragging && 'is-dragging', a.icon && 'act-btn--use', className)}
      aria-label={`「${name}」の${a.title ?? '起動'}（エナジー${a.cost}）${a.blocked ? `：${a.blocked}` : ''}`}
      aria-disabled={a.blocked ? true : undefined}
      data-activate={a.key ? `${name}:${a.key}` : name}
      onClick={(e) => {
        e.stopPropagation();
        if (!a.blocked) a.onTap();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        a.onPointerDown?.(e);
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {a.icon ?? '⚡'}
      {a.icon ? <small>⚡{a.cost}</small> : a.cost}
    </button>
  );
  if (!a.blocked) return btn;
  return (
    <Popover content={{ title: `${a.icon ?? '⚡'} ${a.title ?? '起動'}（エナジー${a.cost}）`, description: a.blocked }} placement="top" hover={false}>
      {btn}
    </Popover>
  );
}

/** HP：カードの体力の紋章と同じハート＋数（UI2）。max を渡すと「/最大」を小さく添える */
export function HpHeart({ hp, max, className, zone }: { hp: number; max?: number; className?: string; zone?: string }) {
  return (
    <span className={cx('u-hp', className)} data-fx-zone={zone}>
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <use href="#emb-hp" />
      </svg>
      <b>{hp}</b>
      {max !== undefined && <small>/{max}</small>}
    </span>
  );
}

/** エナジー：カードのコストと同じ六角の宝石（UI2。読み上げは呼び出し側の aria-label） */
export function EnergyGem({ n, size, className, zone }: { n: number; size?: 'lg' | 'btn' | 'sm'; className?: string; zone?: string }) {
  return (
    <span className={cx('cgem u-egem', size && `u-egem--${size}`, className)} aria-hidden="true" data-fx-zone={zone}>
      <i>{n}</i>
    </span>
  );
}

/** 数の井戸の中身：形（18px 以上）＋数 */
function CntFace({ gi, n, rest }: { gi: string; n: ReactNode; rest?: ReactNode }) {
  return (
    <>
      <UiIcon name={`gi:${gi}`} />
      <b>{n}</b>
      {rest}
    </>
  );
}

export function PlayerPanel({
  ps,
  isMe,
  active,
  targetable,
  onClick,
  onPile,
  flash,
  hpShown,
  roleLabel,
  dropKey,
  dropHover,
  onPower,
  powerActivate,
  discardUsable = 0,
  pileLit,
  pileHover,
  hasCrown,
  powerDef,
  powerFlash,
  onWaiting,
  waitingLit,
  waitingHover,
  waitingUsable = 0,
  compact,
  onOpen,
  onPowers,
  portrait,
}: PlayerPanelProps) {
  const waiting = ps.waiting ?? [];
  // 手札から捨てられたカード（MTG 要素 △ バッチA：捨てられたとき。B：大混乱）が捨て札に入ったら、捨て札の山を少しの間光らせる
  const pileFresh = useBump(ps.discard.filter((c) => c.discardedTurn !== undefined).length);
  const hp = hpShown ?? ps.hp;
  const pct = Math.max(0, Math.min(100, (hp / ps.maxHp) * 100));
  const next = [
    ps.next.energy ? `次のエナジー${ps.next.energy > 0 ? '+' : ''}${ps.next.energy}` : '',
    ps.next.draw ? `次のドロー${ps.next.draw > 0 ? '+' : ''}${ps.next.draw}` : '',
    ps.discount ? `次のカード−${ps.discount}` : '',
  ].filter(Boolean);
  if (compact) {
    // スマホ：1行の帯（名前・HP・エナジー・小さな数字）。状態異常などは大事なものから2つ（自分は1つ）＋「+N」、残りは詳細（onOpen）
    const M = mechanicGlossary;
    const badges: { id: string; label: string; gi?: string; tone: Chip['tone']; title: string }[] = [];
    if (hasCrown) badges.push({ id: 'crown', label: '', gi: M.crown!.gi, tone: 'good', title: '王冠' });
    if (ps.extraTurnPending) badges.push({ id: 'extra', label: M.extraTurn!.icon, tone: 'good', title: '追加ターン' });
    if (ps.quash) badges.push({ id: 'quash', label: '', gi: M.quash!.gi, tone: 'bad', title: `封殺（${QUASH_KIND[ps.quash.kind] ?? 'カード'}）` });
    if ((ps.fatigue ?? 0) > 0) badges.push({ id: 'fatigue', label: `${M.fatigue!.icon}${ps.fatigue}`, tone: 'bad', title: `疲労${ps.fatigue}` });
    for (const c of statusChips(ps.status, true)) {
      const f = briefFace(c);
      badges.push({ id: c.id, label: c.gi ? f.text : briefLabel(c.label), gi: f.gi, tone: c.tone, title: typeof c.card.title === 'string' ? c.card.title : c.label });
    }
    if ((ps.ice ?? 0) > 0) badges.push({ id: 'ice', label: `${M.ice!.icon}${ps.ice}`, tone: 'bad', title: `氷結${ps.ice}` });
    // リーダーはいちばん後ろ（空きがあれば出る）
    const leaderId = toLeaderId(ps.leader);
    if (leaderId !== 'none') badges.push({ id: 'leader', label: '', gi: LEADERS[leaderId].art.replace(/^gi:/, ''), tone: 'info', title: `リーダー：${LEADERS[leaderId].name}` });
    // 帯に出さないもの（詳細だけ）も「+N」に数える
    const hiddenExtras =
      (ps.emblems?.length ?? 0) +
      next.length +
      ((ps.delayed?.length ?? 0) > 0 ? 1 : 0) +
      ((ps.status.boonUses ?? 0) > 0 ? 1 : 0) +
      ((ps.energyBonus ?? 0) > 0 ? 1 : 0) +
      ((ps.exp ?? 0) > 0 ? 1 : 0) +
      ((ps.speed ?? 0) > 0 ? 1 : 0) +
      (!isMe && waiting.length > 0 ? 1 : 0);
    // 札は相手2つ・自分1つ。狭い画面（〜379px）は1つ減らす（最後の札を隠して「+N」を1つ増やした方を出す。battle.css）
    const { shown, more } = overflowItems(badges, isMe ? 1 : 2);
    const moreN = more + hiddenExtras;
    const moreNarrow = moreN + (shown.length > 0 ? 1 : 0);
    const pwFlash = ps.powers.map((pw) => powerFlash?.[pw.uid]).find(Boolean);
    const open = targetable ? onClick : onOpen;
    return (
      <div
        className={cx('pp', 'pp--compact', isMe ? 'pp--me' : 'pp--opp', active && 'is-active', targetable && 'is-targetable', dropHover && 'is-drop-hover', flash)}
        onClick={open}
        onKeyDown={open ? (e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), open()) : undefined}
        role="button"
        tabIndex={0}
        aria-label={
          targetable
            ? `${ps.name}を対象にする`
            : `${roleLabel}：${ps.name}、HP${hp}/${ps.maxHp}${ps.shield > 0 ? `、シールド${ps.shield}` : ''}、エナジー${ps.energy}。押すと詳細`
        }
        data-fx={isMe ? 'me' : 'opp'}
        data-drop={dropKey}
      >
        {targetable && <span className="pp__target">対象</span>}
        {/* CPU の名前の「（デッキ名）」は詳細で */}
        <b className="ppc__name">{ps.name.replace(/（[^（）]*）$/, '') || ps.name}</b>
        <HpHeart hp={hp} className="ppc__hp" zone="hp" />
        {ps.shield > 0 && (
          <span className="ppc__shield" aria-hidden="true">
            <ChipIcon gi={glossary.shield.gi!} />
            {ps.shield}
          </span>
        )}
        <EnergyGem n={ps.energy} className="ppc__energy" zone="energy" />
        <span className="ppc__cnt ppc__hand" aria-label={`手札${ps.hand.length}枚`} data-fx-zone="hand">
          <CntFace gi="hand" n={ps.hand.length} />
        </span>
        <span className="ppc__cnt ppc__deck" aria-label={`山札${ps.deck.length}枚`} data-fx-zone="deck">
          <CntFace gi="stack" n={ps.deck.length} />
        </span>
        {isMe && (
          <button
            type="button"
            className={cx('ppc__cnt ppc__cnt--btn', discardUsable > 0 && 'is-usable', pileLit && 'is-lit', pileHover && 'is-drop-hover', pileFresh && 'is-fresh')}
            onClick={(e) => (e.stopPropagation(), onPile('discard'))}
            aria-label={`捨て札${ps.discard.length}枚を見る${discardUsable > 0 ? `（捨て札から使えるカード${discardUsable}枚）` : ''}`}
            data-drop="pile"
            data-fx="pile"
            data-fx-zone="discard"
          >
            <CntFace gi="card-discard" n={ps.discard.length} />
          </button>
        )}
        {isMe && (
          <button
            type="button"
            className={cx('ppc__cnt ppc__cnt--btn', waitingUsable > 0 && 'is-usable', waitingLit && 'is-lit', waitingHover && 'is-drop-hover')}
            onClick={(e) => (e.stopPropagation(), onWaiting?.())}
            aria-label={`待機ゾーン${waiting.length}枚を見る${waitingUsable > 0 ? `（使えるカード${waitingUsable}枚）` : ''}`}
            data-drop="waiting"
            data-fx="waiting:me"
          >
            <CntFace gi="hourglass" n={waiting.length} />
          </button>
        )}
        {ps.powers.length > 0 &&
          (isMe && onPowers ? (
            <button
              type="button"
              className={cx('ppc__cnt ppc__cnt--btn ppc__powers', ps.powers.some((pw) => (powerActivate?.(pw) ?? []).some((a) => !a.blocked)) && 'is-usable', pwFlash)}
              data-fx-zone="powers"
              onClick={(e) => (e.stopPropagation(), onPowers())}
              aria-label={`パワー${ps.powers.length}つ（${ps.powers.map((pw) => pw.name).join('・')}）を見る`}
            >
              <CntFace gi="magic-swirl" n={ps.powers.length} />
            </button>
          ) : (
            <span className={cx('ppc__cnt ppc__powers', pwFlash)} aria-label={`パワー${ps.powers.length}つ`} data-fx-zone="powers">
              <CntFace gi="magic-swirl" n={ps.powers.length} />
            </span>
          ))}
        {shown.map((b, i) => (
          <span key={b.id} className={cx('st', `st--${b.tone}`, 'ppc__badge', i === shown.length - 1 && 'ppc__badge--last')} title={b.title} aria-label={b.title}>
            {b.gi && <ChipIcon gi={b.gi} />}
            {b.label}
          </span>
        ))}
        {moreN > 0 && (
          <span className="ppc__more ppc__more--wide" aria-label={`ほか${moreN}件（押すと詳細）`}>
            +{moreN}
          </span>
        )}
        {moreNarrow > 0 && (
          <span className="ppc__more ppc__more--narrow" aria-label={`ほか${moreNarrow}件（押すと詳細）`}>
            +{moreNarrow}
          </span>
        )}
        <span className="ppc__bar" aria-hidden="true">
          <span className="hpbar__fill" style={{ width: `${pct}%` }} />
        </span>
      </div>
    );
  }
  return (
    <div
      className={cx('pp', isMe ? 'pp--me' : 'pp--opp', active && 'is-active', targetable && 'is-targetable', dropHover && 'is-drop-hover', flash)}
      onClick={targetable ? onClick : undefined}
      onKeyDown={targetable ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      role={targetable ? 'button' : undefined}
      tabIndex={targetable ? 0 : undefined}
      aria-label={targetable ? `${ps.name}を対象にする` : undefined}
      data-fx={isMe ? 'me' : 'opp'}
      data-drop={dropKey}
    >
      <div className="pp__row">
        {toLeaderId(ps.leader) !== 'none' ? (
          <LeaderChip leader={toLeaderId(ps.leader)} portrait />
        ) : (
          <span className="pp__portrait" aria-hidden="true">
            <UiIcon name={`gi:${portrait ?? (isMe ? 'visored-helm' : 'robot-golem')}`} />
          </span>
        )}
        <span className="pp__role">{roleLabel}</span>
        <b className="pp__name">{ps.name}</b>
        {hasCrown && (
          <Popover content={{ title: `${mechanicGlossary.crown!.icon} 王冠`, description: mechanicGlossary.crown!.short }} placement="bottom">
            <span className="pp__crown" data-fx={`crown:${isMe ? 'me' : 'opp'}`} aria-label="王冠を持っている">
              <UiIcon name={`gi:${mechanicGlossary.crown!.gi!}`} />
            </span>
          </Popover>
        )}
        {targetable && <span className="pp__target">対象</span>}
        <span className="pp__energy" role="img" aria-label={`エナジー${ps.energy}`}>
          <EnergyGem n={ps.energy} size="lg" zone="energy" />
        </span>
      </div>
      <div className="pp__hp">
        <span className="pp__hpnum" role="img" aria-label={`HP${hp}／${ps.maxHp}`}>
          <HpHeart hp={hp} max={ps.maxHp} zone="hp" />
        </span>
        <div className="hpbar" aria-hidden="true">
          <div className="hpbar__fill" style={{ width: `${pct}%` }} />
        </div>
        {ps.shield > 0 && (
          <Popover content={{ title: `🛡 シールド ${ps.shield}`, description: glossary.shield.short }} placement="top">
            <span className="pp__shield">
              <ChipIcon gi={glossary.shield.gi!} />
              {ps.shield}
            </span>
          </Popover>
        )}
      </div>
      <div className="pp__meta">
        <Popover
          content={{
            title: `📚 山札 ${ps.deck.length}枚`,
            description: '引く順番は非公開。尽きたら捨て札をシャッフルして山札にする',
            // 疲労（山札切れ。決定事項 #102）：もう起きた・山札も捨て札も無いときは、次の1枚のダメージ
            lines:
              (ps.fatigue ?? 0) > 0 || ps.deck.length + ps.discard.length === 0
                ? [`${mechanicGlossary.fatigue!.icon}疲労：山札も捨て札も無いと、引けない1枚ごとにダメージ（これまで${ps.fatigue ?? 0}枚、次は${battle.nextFatigueDamage(ps)}）`]
                : undefined,
          }}
          placement="top"
        >
          <span className="pile" aria-label={`山札${ps.deck.length}枚`} data-fx-zone="deck">
            <CntFace gi="stack" n={ps.deck.length} />
            {(ps.fatigue ?? 0) > 0 && <span className="pile__usable pile__fatigue">疲労{ps.fatigue}</span>}
          </span>
        </Popover>
        <button
          type="button"
          className={cx('pile pile--btn', isMe && 'pile--drop', pileLit && 'is-lit', pileHover && 'is-drop-hover', pileFresh && 'is-fresh')}
          onClick={(e) => (e.stopPropagation(), onPile('discard'))}
          aria-label={`捨て札${ps.discard.length}枚を見る${discardUsable > 0 ? `（捨て札から使えるカード${discardUsable}枚）` : ''}`}
          data-drop={isMe ? 'pile' : undefined}
          data-fx={isMe ? 'pile' : undefined}
          data-fx-zone="discard"
        >
          <CntFace gi="card-discard" n={ps.discard.length} />
          {discardUsable > 0 && <span className="pile__usable">使える{discardUsable}</span>}
        </button>
        <button type="button" className="pile pile--btn" onClick={(e) => (e.stopPropagation(), onPile('exile'))} aria-label={`除外${ps.exile.length}枚を見る`}>
          <CntFace gi="vortex" n={ps.exile.length} />
        </button>
        {/* 待機ゾーン（MTG 要素 △ バッチC）：自分のは常に出す（ドラッグの落とし先）。相手のはカードがあるときだけ */}
        {(isMe || waiting.length > 0) && (
          <button
            type="button"
            className={cx('pile pile--btn pile--waiting', isMe && 'pile--drop', waitingLit && 'is-lit', waitingHover && 'is-drop-hover')}
            onClick={(e) => (e.stopPropagation(), onWaiting?.())}
            aria-label={`待機ゾーン${waiting.length}枚を見る${waitingUsable > 0 ? `（使えるカード${waitingUsable}枚）` : ''}`}
            data-drop={isMe ? 'waiting' : undefined}
            data-fx={isMe ? 'waiting:me' : 'waiting:opp'}
          >
            <CntFace gi="hourglass" n={`${waiting.length}/${BALANCE.battle.maxWaiting}`} />
            {waitingUsable > 0 && <span className="pile__usable">使える{waitingUsable}</span>}
          </button>
        )}
        {/* 追加ターン（MTG 要素 △ バッチC）：このターンのあとにもう一度 */}
        {ps.extraTurnPending && (
          <Popover content={{ title: `${mechanicGlossary.extraTurn!.icon} 追加ターン`, description: mechanicGlossary.extraTurn!.short }} placement="top">
            <span className="pp__next pp__extra">{mechanicGlossary.extraTurn!.icon}追加ターン</span>
          </Popover>
        )}
        {!isMe && (
          <Popover content={{ title: `🂠 手札 ${ps.hand.length}枚`, description: '相手の手札の中身は見えない' }} placement="top">
            <span className="pile" aria-label={`手札${ps.hand.length}枚`} data-fx-zone="hand">
              <CntFace gi="hand" n={ps.hand.length} />
            </span>
          </Popover>
        )}
        {next.map((t) => (
          <span key={t} className="pp__next">
            {t}
          </span>
        ))}
        {ps.powers.length > 0 && (
          <Popover
            content={{
              title: `✦ パワー ${ps.powers.length}/${BALANCE.battle.maxPowers}`,
              description: `パワーは1人${BALANCE.battle.maxPowers}つまで。${BALANCE.battle.maxPowers + 1}つ目を使うと、いちばん古いパワーが消える`,
            }}
            placement="top"
          >
            <span className="pp__next pp__powers" data-fx-zone="powers">
              パワー {ps.powers.length}/{BALANCE.battle.maxPowers}
            </span>
          </Popover>
        )}
        {(ps.delayed?.length ?? 0) > 0 && (
          <Popover
            content={{
              title: `${mechanicGlossary.delayed!.icon} 予約 ${ps.delayed!.length}/${BALANCE.battle.maxDelayedPerPlayer}`,
              description: mechanicGlossary.delayed!.short,
              lines: ps.delayed!.map((d) => d.label),
            }}
            placement="top"
          >
            <span className="pp__next">
              {mechanicGlossary.delayed!.icon}予約 {ps.delayed!.length}
            </span>
          </Popover>
        )}
        {/* MTG 要素 ○ バッチB：封殺・恩恵・最大エナジー増加 */}
        {ps.quash && (
          <Popover content={{ title: `${mechanicGlossary.quash!.icon} 封殺（${QUASH_KIND[ps.quash.kind] ?? 'カード'}）`, description: mechanicGlossary.quash!.short }} placement="top">
            <span className="pp__next pp__quash">
              <ChipIcon gi={mechanicGlossary.quash!.gi!} />
              封殺（{QUASH_KIND[ps.quash.kind] ?? 'カード'}）
            </span>
          </Popover>
        )}
        {(ps.status.boonUses ?? 0) > 0 && (
          <Popover content={{ title: `${mechanicGlossary.boon!.icon} 恩恵 +${ps.status.boon}×${ps.status.boonUses}`, description: mechanicGlossary.boon!.short }} placement="top">
            <span className="pp__next">
              {mechanicGlossary.boon!.icon}恩恵 +{ps.status.boon}×{ps.status.boonUses}
            </span>
          </Popover>
        )}
        {(ps.energyBonus ?? 0) > 0 && (
          <Popover content={{ title: `${mechanicGlossary.ramp!.icon} 最大エナジー+${ps.energyBonus}`, description: mechanicGlossary.ramp!.short }} placement="top">
            <span className="pp__next">
              {mechanicGlossary.ramp!.icon}+{ps.energyBonus}
            </span>
          </Popover>
        )}
        {/* MTG 要素 ○ バッチC2：速度ゲージ（ゲージがあるときだけ） */}
        {(ps.speed ?? 0) > 0 && <SpeedGauge speed={ps.speed!} />}
        {/* MTG 要素 △ バッチA：経験・氷結（次のターンに凍る手札） */}
        {(ps.exp ?? 0) > 0 && (
          <Popover content={{ title: `${mechanicGlossary.exp!.icon} 経験 ${ps.exp}`, description: mechanicGlossary.exp!.short }} placement="top">
            <span className="pp__next">
              {mechanicGlossary.exp!.icon}経験{ps.exp}
            </span>
          </Popover>
        )}
        {(ps.ice ?? 0) > 0 && (
          <Popover content={{ title: `${mechanicGlossary.ice!.icon} 氷結 ${ps.ice}`, description: mechanicGlossary.ice!.short }} placement="top">
            <span className="pp__next pp__quash">
              {mechanicGlossary.ice!.icon}氷結{ps.ice}
            </span>
          </Popover>
        )}
        <Chips chips={statusChips(ps.status, true)} />
        {/* 紋章（MTG 要素 △ バッチC）：パワーの上限に数えない */}
        {(ps.emblems ?? []).map((pw) => {
          const meter = powerMeter(pw, powerDef?.(pw), ps.turnsTaken);
          return (
            <span key={pw.uid} className={cx('pw-chip pw-chip--emblem', powerFlash?.[pw.uid])} data-fx={pw.uid}>
              <button
                type="button"
                className="st st--power st--btn st--emblem"
                onClick={(e) => {
                  e.stopPropagation();
                  onPower?.(pw);
                }}
                aria-label={`紋章「${pw.name}」の詳細`}
              >
                {mechanicGlossary.emblem!.icon}
                {pw.name}
                {meter && <span className="st__meter">{` ${meter}`}</span>}
              </button>
            </span>
          );
        })}
        {ps.powers.map((pw) => {
          const acts = powerActivate?.(pw) ?? [];
          const act = acts.length > 0;
          const meter = powerMeter(pw, powerDef?.(pw), ps.turnsTaken);
          // 休眠中（MTG 要素 △ バッチA）のパワーは半透明（効果が出ない）
          const dormant = pw.dormantFrom !== undefined && (ps.turnsTaken - pw.dormantFrom) % 2 === 1;
          return (
            <span key={pw.uid} className={cx('pw-chip', act && 'pw-chip--act', dormant && 'is-dormant', powerFlash?.[pw.uid])} data-fx={pw.uid}>
              <button
                type="button"
                className="st st--power st--btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onPower?.(pw);
                }}
                aria-label={`パワー「${pw.name}」の詳細`}
              >
                <UiIcon name="gi:magic-swirl" className="st__gi" />
                {pw.name}
                {pw.life !== undefined && <span className="st__life">{` ${mechanicGlossary.lifespan!.icon}${pw.life}`}</span>}
                {meter && <span className="st__meter">{` ${meter}`}</span>}
              </button>
              {acts.map((a) => (
                <ActivateBtn key={a.key ?? 'act'} a={a} name={pw.name} />
              ))}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** パワーの一覧（スマホの帯の「✦N」から開く）：1行に名前・章などの表示・起動のボタン。名前を押すと詳細 */
export function PowersList({
  ps,
  powerDef,
  powerActivate,
  onPower,
  powerFlash,
}: {
  ps: battle.PlayerState;
  powerDef?: (pw: battle.PowerInst) => CardDef | undefined;
  powerActivate?: (pw: battle.PowerInst) => ActivateButton[];
  onPower?: (pw: battle.PowerInst) => void;
  powerFlash?: Record<string, string>;
}) {
  const all = [...(ps.emblems ?? []).map((pw) => ({ pw, emblem: true })), ...ps.powers.map((pw) => ({ pw, emblem: false }))];
  if (all.length === 0) return <p className="hint">パワーはありません</p>;
  return (
    <ul className="pw-list">
      {all.map(({ pw, emblem }) => {
        const def = powerDef?.(pw);
        const meter = powerMeter(pw, def, ps.turnsTaken);
        const acts = emblem ? [] : (powerActivate?.(pw) ?? []);
        const dormant = pw.dormantFrom !== undefined && (ps.turnsTaken - pw.dormantFrom) % 2 === 1;
        return (
          <li key={pw.uid} className={cx('pw-list__row', 'pw-chip', def && frameClasses(def.rarity, 'power', analyzeCard(def).isCurse), dormant && 'is-dormant', powerFlash?.[pw.uid])}>
            <button type="button" className="pw-list__main" onClick={() => onPower?.(pw)} aria-label={`${emblem ? '紋章' : 'パワー'}「${pw.name}」の詳細`}>
              <span className="pw-list__icon" aria-hidden="true">
                {emblem ? mechanicGlossary.emblem!.icon : def ? <CardArt icon={def.icon} rarity={def.rarity} cardType="power" curse={analyzeCard(def).isCurse} /> : '✦'}
              </span>
              <span className="pw-list__text">
                <b>{pw.name}</b>
                {def && <span className="pw-list__sum">{summarizeCard(def)}</span>}
                {(meter || pw.life !== undefined) && (
                  <small>
                    {pw.life !== undefined ? `${mechanicGlossary.lifespan!.icon}寿命${pw.life} ` : ''}
                    {meter ?? ''}
                  </small>
                )}
              </span>
            </button>
            {acts.map((a) => (
              <ActivateBtn key={a.key ?? 'act'} a={a} name={pw.name} className="pw-list__act" />
            ))}
          </li>
        );
      })}
    </ul>
  );
}

/** リーダー（MTG 要素 △ バッチD）の札：アイコンだけ。タップで名前と説明 */
function LeaderChip({ leader, portrait }: { leader: ReturnType<typeof toLeaderId>; portrait?: boolean }) {
  const l = LEADERS[leader];
  return (
    <Popover content={{ title: `${l.icon} リーダー：${l.name}`, description: l.description }} placement="bottom">
      <span className={cx('pp__leader', portrait && 'pp__portrait pp__portrait--leader')} aria-label={`リーダー：${l.name}`}>
        <CardArt icon={l.art} rarity="legend" size={portrait ? '34px' : '1.35em'} />
      </span>
    </Popover>
  );
}

/**
 * フィールドと昼と夜（MTG 要素 △ バッチD）の札。見出しの行に出す（どちらも無ければ何も出さない）。
 * data-fx はイベント再生で光らせる目印
 */
export function MatchBand({ view, flash = {} }: { view: battle.GameState; flash?: Record<string, string> }) {
  const f = fieldBand(view);
  const d = dayNightBand(view);
  if (!f && !d) return null;
  return (
    <div className="match-band">
      {f && (
        <Popover content={{ title: `${f.icon} フィールド：${f.name}`, description: `${f.description}（両者に効く。${f.note}）` }} placement="bottom">
          <span className={cx('match-band__chip', 'match-band__field', flash.field)} data-fx="field" aria-label={`フィールド：${f.name}`}>
            <CardArt icon={f.art} rarity="epic" size="1.5em" />
            <span className="match-band__name">{f.name}</span>
          </span>
        </Popover>
      )}
      {d && (
        <Popover content={{ title: `${d.icon} ${d.name}`, description: d.description }} placement="bottom">
          <span className={cx('match-band__chip', 'match-band__daynight', `is-${view.dayNight}`, flash.dayNight)} data-fx="dayNight" aria-label={d.name}>
            <UiIcon name={view.dayNight === 'day' ? 'gi:sun' : 'gi:moon'} className="match-band__gi" />
          </span>
        </Popover>
      )}
    </div>
  );
}

/** 速度ゲージ（MTG 要素 ○ バッチC2）：最大までの目盛り */
export function SpeedGauge({ speed }: { speed: number }) {
  const max = BALANCE.speed.max;
  const g = mechanicGlossary.speed!;
  return (
    <Popover content={{ title: `${g.icon} 速度 ${speed}/${max}${speed >= max ? '（最高速度）' : ''}`, description: g.short }} placement="top">
      <span className={cx('speed', speed >= max && 'is-max')} aria-label={`速度${speed}/${max}`}>
        <ChipIcon gi={g.gi!} />
        <span className="speed__bar" aria-hidden="true">
          {Array.from({ length: max }, (_, i) => (
            <i key={i} className={cx('speed__tick', i < speed && 'is-on')} />
          ))}
        </span>
      </span>
    </Popover>
  );
}

/**
 * パワーの札に添える短い表示（文字だけ。絵文字は使わない：UI2 の統合）：英雄譚「第2/3章」・蓄積「蓄積1/3」（MTG 要素 ○ バッチC2）、
 * 罠「罠」・プラン「プラン」・休眠中・累加維持費「累加2」（MTG 要素 △ バッチA。休眠は持ち主の turnsTaken を渡したときだけ）
 */
export function powerMeter(pw: battle.PowerInst, def: CardDef | undefined, ownerTurns?: number): string | null {
  const parts: string[] = [];
  if (pw.chapter !== undefined) parts.push(`第${pw.chapter}/${battle.lastChapter(def) || pw.chapter}章`);
  const charge = def?.abilities?.find((a) => a.id === 'charge');
  if (charge) parts.push(`${charge.once ? 'プラン' : '蓄積'}${pw.charge ?? 0}/${charge.value ?? ''}`);
  if (def?.abilities?.some((a) => a.id === 'trap')) parts.push('罠');
  if (ownerTurns !== undefined && pw.dormantFrom !== undefined && (ownerTurns - pw.dormantFrom) % 2 === 1) parts.push('休眠中');
  if (pw.age) parts.push(`累加${pw.age}`);
  // MTG 要素 △ バッチC：忠誠・Lv・達成・特殊勝利の進み
  if (pw.loyalty !== undefined) parts.push(`忠誠${pw.loyalty}`);
  if (def?.abilities?.some((a) => a.id === 'levelUp')) parts.push(`Lv${pw.level ?? 1}`);
  if (pw.achieved) parts.push('達成');
  const goal = battle.altWinGoalOf(def);
  if (goal) parts.push(`勝利${pw.progress ?? 0}/${battle.altWinTarget(goal)}`);
  return parts.length > 0 ? parts.join(' ') : null;
}

export function powerLines(pw: battle.PowerInst, def?: CardDef): ReactNode[] {
  const effects = pw.effects.filter((x) => !x.removed).map((x) => `${TIMINGS[x.effect.timing]?.label ?? ''}：${getEffect(x.effect.id)?.name ?? x.effect.id}`);
  const life = pw.life !== undefined ? [`寿命：残り${pw.life}（持ち主のターン終了時に1減り、0で消える）`] : [];
  // 英雄譚：いまの章と、次の章の効果。蓄積：たまった数
  const extra: string[] = [];
  if (pw.chapter !== undefined) {
    const last = battle.lastChapter(def) || pw.chapter;
    const next = pw.chapter < last ? (def?.effects ?? []).filter((e) => e.timing === `chapter${pw.chapter! + 1}`).map((e) => describeEffect(e, def, { noTiming: true })) : [];
    extra.push(`英雄譚：第${pw.chapter}章／全${last}章${pw.chapter >= last ? '（この章で終わる）' : ''}`);
    if (next.length > 0) extra.push(`次の自分のターン開始時に第${pw.chapter + 1}章：${next.join('')}`);
  }
  const charge = def?.abilities?.find((a) => a.id === 'charge');
  if (charge) extra.push(`蓄積：${pw.charge ?? 0}/${charge.value ?? ''}${charge.once ? `（${mechanicGlossary.plan!.short}）` : ''}`);
  // MTG 要素 △ バッチA：罠・休眠・累加維持費
  if (def?.abilities?.some((a) => a.id === 'trap')) extra.push(`${mechanicGlossary.trap!.short}`);
  if (pw.dormantFrom !== undefined) extra.push(`${mechanicGlossary.dormant!.short}`);
  if (pw.age) extra.push(`累加維持費：場にあるターン数 ${pw.age}`);
  // MTG 要素 △ バッチC
  const G = mechanicGlossary;
  if (pw.loyalty !== undefined) extra.push(`忠誠：${pw.loyalty}（最大${BALANCE.battle.loyaltyMax}。0で消える）`);
  if (def?.abilities?.some((a) => a.id === 'levelUp')) extra.push(`Lv${pw.level ?? 1}／${BALANCE.battle.maxLevel}`);
  const ach = battle.achieveOf(def);
  if (ach) extra.push(`${pw.achieved ? '達成した' : 'まだ達成していない'}（達成条件：${(ach.a.condition ? CONDITIONS[ach.a.condition]?.label : undefined) ?? '？'}）`);
  const goal = battle.altWinGoalOf(def);
  if (goal) extra.push(`特殊勝利：${ALT_WIN_TEXT[goal]} ${pw.progress ?? 0}/${battle.altWinTarget(goal)}`);
  if (battle.isEmblemCard(def)) extra.push(`${G.emblem!.short}`);
  return [...extra, ...effects, ...pw.drawbacks.map((d) => `デメリット（${d.timing ? TIMINGS[d.timing].label : ''}）`), ...life];
}

// ---------------------------------------------------------------- モンスター

interface MonsterTileProps {
  m: battle.Monster;
  def: CardDef | undefined;
  ready: boolean;
  /** 自分のターンで攻撃できないときの理由（短く表示） */
  blockLabel?: string | null;
  selected: boolean;
  targetable: boolean;
  flags: ReturnType<typeof battle.keywordFlags>;
  /** タップ（クリック）：詳細を開く・対象選択中なら対象にする */
  onClick: () => void;
  /** 長押し（スマホ）で詳細 */
  onDetail?: () => void;
  /** ドラッグの始まり（攻撃） */
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  flash?: string;
  /** まだ出現の演出をしていない（見えない） */
  hidden?: boolean;
  /** 破壊されて消えていく途中 */
  dying?: boolean;
  isMine: boolean;
  /** ドラッグ中、この上で離すと決まる */
  dropHover?: boolean;
  /** つかんで動かしている */
  dragging?: boolean;
  /** 今の持ち主が自分のターンを迎えた回数（消耗の表示） */
  ownerTurns?: number;
  /** 実効攻撃力（激励を含む。battle.effectiveAttack(view, m)。省略すると攻撃力＋一時強化） */
  attackNow?: number;
  /** 起動の ⚡ ボタン（自分のモンスターで起動の能力があるとき。MTG 要素 ○ バッチC1。△ バッチC：Lvアップ・表にする） */
  activate?: ActivateButton[] | null;
  /** 対象にするとき増えるコスト（護法。MTG 要素 ○ バッチB）。0 なら出さない */
  extraCost?: number;
  /** 裏向きの自分のモンスターの正体の名前（MTG 要素 △ バッチC。持ち主にだけ） */
  realName?: string;
  /** スマホの詰めた表示：アイコンと名前を1行、札はアイコンだけ3つまで＋「+N」（種族・正体は詳細へ） */
  compact?: boolean;
}

/** 特殊勝利の目標の言い方（MTG 要素 △ バッチC） */
const ALT_WIN_TEXT: Record<NonNullable<ReturnType<typeof battle.altWinGoalOf>>, string> = { cards: 'カードを使った数', turns: '自分のターン数', board: '場のモンスターの数' };

/** 実効攻撃力（激励は盤面が要るので、呼び出し側が渡す。無ければ攻撃力＋一時強化） */
export const attackOf = (m: battle.Monster, attackNow?: number): number => attackNow ?? m.attack + (m.tempAttack ?? 0);

/** 封殺の種類の呼び方 */
const QUASH_KIND: Record<string, string> = { any: 'すべて', attack: 'アタック', skill: 'スキル', monster: 'モンスター', power: 'パワー' };

/** モンスターの札（キーワード・封印・隠密・裏切り・予告・攻撃回数・状態異常）。タイルと詳細で共用 */
export function monsterChips(
  def: CardDef | undefined,
  m: battle.Monster,
  flags: ReturnType<typeof battle.keywordFlags>,
  /** 今の持ち主が自分のターンを迎えた回数（消耗の表示に使う。省略すると消耗を出さない） */
  ownerTurns?: number,
  /** 実効攻撃力（激励を含む） */
  attackNow?: number,
  /** 裏向きのモンスターの正体の名前（持ち主にだけ。MTG 要素 △ バッチC） */
  realName?: string,
): Chip[] {
  const kws: Chip[] = (def?.keywords ?? []).map((k) => {
    const g = keywordGlossary[k.id];
    return {
      id: `kw:${k.id}`,
      label: g ? `${g.name}${k.value !== undefined ? k.value : ''}` : k.id,
      tone: 'kw',
      card: { title: g ? g.name : k.id, description: g?.short ?? '' },
      ...(g?.gi ? { gi: g.gi, text: `${g.name}${k.value !== undefined ? k.value : ''}` } : {}),
    };
  });
  const extra: Chip[] = [];
  const M = mechanicGlossary;
  /** 仕組みの札（形は用語集の gi。見出しは名前だけ：絵文字は使わない） */
  const add = (id: string, g: GlossaryEntry, text: string, tone: Chip['tone'], card: Partial<PopoverCard> = {}) =>
    extra.push(glossChip(id, g, text, tone, card));
  if (m.sealed) add('sealed', glossary.seal, '封印', 'bad');
  if (m.stealth) add('stealth', glossary.stealth, '隠密中', 'info');
  if (m.betraying) add('betraying', glossary.betrayal, '裏切り', 'bad');
  if (m.card.token && !m.siege) add('token', M.token!, 'トークン', 'info');
  if (!m.sealed) {
    for (const id of m.granted ?? []) {
      const g = keywordGlossary[id];
      // 形の札では付与の印は「+」（詳細のポップオーバーに「付与」と出る）
      extra.push({ id: `gr:${id}`, label: `付与：${g?.name ?? id}`, tone: 'kw', gi: g?.gi ?? M.tempAttack!.gi, text: `+${g?.name ?? id}`, card: { title: `付与：${g?.name ?? id}`, description: g?.short ?? '', lines: [M.granted!.short] } });
    }
  }
  if (m.tempAttack) {
    add('temp', M.tempAttack!, `攻撃+${m.tempAttack}`, 'good', { title: `一時強化 +${m.tempAttack}`, lines: [`もとの攻撃力 ${m.attack} → このターン ${attackOf(m, attackNow)}`] });
  }
  if (flags.divineShield && m.shieldUsed && keywordGlossary.divineShield) {
    add('shieldUsed', keywordGlossary.divineShield, '聖盾 使用済み', 'info', { title: '聖盾（使用済み）', description: 'このモンスターの聖盾はもう使った。キーワード付与で聖盾を与え直すと戻る' });
  }
  const life = m.counters.life;
  if (life !== undefined && life > 0) {
    add('life', M.lifespan!, `寿命${life}`, 'bad', { title: `寿命 残り${life}`, lines: [life === 1 ? 'このモンスターの持ち主のターン終了時に破壊される' : `あと${life}回、持ち主のターン終了時を迎えると破壊される`] });
  }
  // MTG 要素 ○ バッチA：消耗（次の持ち主のターンは攻撃できない）・攻撃した回数（条件「このモンスターが3回以上攻撃した」のカードだけ）
  const exertTurn = m.counters.exertTurn;
  if (exertTurn !== undefined && ownerTurns !== undefined && exertTurn >= ownerTurns) {
    const now = exertTurn === ownerTurns;
    add('exert', M.exert!, `消耗${now ? '中' : ''}`, 'bad', { lines: [now ? 'このターンは攻撃できない' : '次の持ち主のターンは攻撃できない'] });
  }
  const attacksTotal = m.counters.attacksTotal ?? 0;
  if (attacksTotal > 0 && def?.effects.some((e) => e.condition === 'veteran')) {
    add('attacksTotal', glossary.retaliation, `攻撃した回数 ${attacksTotal}`, 'info', { title: `攻撃した回数 ${attacksTotal}`, description: '場に出てから攻撃した回数（場を離れると0から）' });
  }
  // MTG 要素 ○ バッチB：複写・応召・軍団、装備、借用、懸賞、分身を使った
  if (m.card.token?.copy) add('copy', M.copyToken!, 'コピー', 'info');
  if (m.card.token?.temp) add('temp-token', M.tempToken!, '応召', 'info');
  if (m.card.cardId === battle.ARMY_CARD_ID) add('army', M.army!, M.army!.name, 'info');
  if ((m.equipment?.length ?? 0) > 0) {
    const n = m.equipment!.length;
    add('equip', M.equip!, `装備${n > 1 ? `×${n}` : ''}`, 'good', { title: `装備（${n}枚）` });
  }
  if (m.counters.borrowLeft !== undefined) {
    add('borrow', M.borrow!, `借用 残り${m.counters.borrowLeft}`, 'info', { title: `借用（残り${m.counters.borrowLeft}ターン）` });
  }
  if ((m.bounty?.length ?? 0) > 0) {
    const draw = m.bounty!.reduce((n, b) => n + b.draw, 0);
    add('bounty', M.bounty!, '懸賞', 'info', { title: `懸賞（破壊されたら${draw}枚）` });
  }
  // MTG 要素 △ バッチA：卵・落とし子・消滅の印・容疑・守護・賛助のキーワード・休眠・累加維持費・萎縮・永久強化
  const egg = m.card.token?.egg;
  if (egg) {
    const left = ownerTurns !== undefined ? Math.max(0, egg.hatchAt - ownerTurns) : undefined;
    add('egg', M.egg!, `卵${left !== undefined ? ` あと${left}` : ''}`, 'info', { title: `${M.egg!.name}（孵化すると攻撃力+${egg.attack}）`, lines: left !== undefined ? [`孵化まで、持ち主のターン開始あと${left}回`] : [] });
  }
  if (m.card.token?.spawn) add('spawn', M.spawn!, '落とし子', 'info');
  if (m.finality) add('finality', M.finality!, '消滅の印', 'bad');
  if (m.suspected) add('suspected', M.suspected!, '容疑', 'info');
  if (m.guard) {
    const gd = M[m.guard.kind]!;
    add('guard', gd, gd.name, 'good', { title: `守護：${gd.name}` });
  }
  if (!m.sealed) {
    for (const id of m.tempGranted ?? []) {
      const g = keywordGlossary[id];
      // 形の札では付与と同じく「+」（「このターンだけ」は詳細のポップオーバーに出る）
      extra.push({ id: `tg:${id}`, label: `このターンだけ：${g?.name ?? id}`, tone: 'kw', gi: g?.gi ?? M.tempAttack!.gi, text: `+${g?.name ?? id}`, card: { title: `このターンだけ：${g?.name ?? id}`, description: g?.short ?? '', lines: [M.tempGranted!.short] } });
    }
  }
  const dormantFrom = m.counters.dormantFrom;
  if (dormantFrom !== undefined && ownerTurns !== undefined && (ownerTurns - dormantFrom) % 2 === 1) add('dormant', M.dormant!, '休眠中', 'bad', { title: '休眠中' });
  if (m.counters.age) add('age', M.cumulativeUpkeep!, `累加${m.counters.age}`, 'bad', { title: `累加維持費（場にあるターン数 ${m.counters.age}）` });
  if (m.counters.withered) add('withered', M.withered!, `萎縮−${m.counters.withered}`, 'bad', { title: `萎縮：最大体力−${m.counters.withered}` });
  if (m.card.perm && !m.card.token) {
    const p = m.card.perm;
    add('perm', M.perpetual!, `永久+${p.attack}/+${p.hp}`, 'good', { title: `永久強化 攻撃力+${p.attack}・体力+${p.hp}` });
  }
  // MTG 要素 △ バッチB：試作版・解鎖・一時蘇生（公開の印）
  if (m.prototype) add('prototype', M.prototype!, '試作', 'info');
  if (m.unleashed) add('unleashed', M.unleashed!, '解鎖', 'info');
  if (m.unearthed) add('unearthed', M.unearthed!, '一時', 'bad');
  if (m.card.lostKeywords?.includes('doubleTeam') && keywordGlossary.doubleTeam) {
    add('dt-used', keywordGlossary.doubleTeam, '分身 使用済み', 'info', { title: '分身（使用済み）' });
  }
  // MTG 要素 △ バッチC：裏向き（正体は持ち主にだけ）・進化・Lv・ワープ・砦
  if (m.faceDown) {
    const real = m.faceDown.card;
    const cost = m.faceDown.revealCost;
    add('faceDown', M.faceDown!, '裏向き', 'info', {
      title: `${M.faceDown!.name}（${m.faceDown.kind === 'disguise' ? '変装' : '予示'}）`,
      lines: real ? [`正体：「${realName ?? '？'}」`, cost === null ? '表にできない（モンスターでない）' : `エナジー${cost}で表にできる`] : [],
    });
  }
  if (m.achieved) add('achieved', M.achieve!, '進化', 'good', { title: '進化した' });
  if (def?.abilities?.some((a) => a.id === 'levelUp')) {
    const lv = m.counters.level ?? 1;
    add('level', M.level!, `Lv${lv}`, 'good', { title: `Lv${lv}／${BALANCE.battle.maxLevel}` });
  }
  if (m.warped) extra.push({ id: 'warped', label: 'ワープ', gi: 'portal', text: 'ワープ', tone: 'info', card: { title: 'ワープ', description: 'ワープで出たモンスター。持ち主のターン終了時に待機ゾーンへ移り、後の自分のターンに出し直せる' } });
  if (m.siege) add('siege', M.siege!, M.siege!.name, 'info');
  for (const f of monsterForecasts(def, m)) extra.push({ id: `fc:${f.title}`, label: f.label, tone: f.tone, card: { title: f.title, description: f.description }, ...(f.title === '裏切り' ? { gi: glossary.betrayal.gi, text: f.label } : {}) });
  if ((flags.attacksPerTurn ?? 1) > 1 && m.attacksUsed > 0) {
    add('attacks', glossary.retaliation, `攻撃${m.attacksUsed}/${flags.attacksPerTurn}`, 'info', { title: 'このターンの攻撃回数', description: `${flags.attacksPerTurn}回まで攻撃できる` });
  }
  return [...(m.sealed ? [] : kws), ...extra, ...statusChips(m.status, false)];
}

/** スマホの札の中身：形（あれば）と数字だけ（compact.ts の briefFace） */
function BriefFace({ c }: { c: Chip }) {
  const f = briefFace(c);
  return (
    <>
      {f.gi && <ChipIcon gi={f.gi} />}
      {f.text}
    </>
  );
}

/**
 * 札をアイコンだけで並べ、残りを「+N」にする（スマホのモンスターのタイル。押すとタイルの詳細）。
 * ふつうは2つ＋「+N」、狭いタイルは1つ＋「+N」、場に余裕があって大きく出すタイルは4つ＋「+N」（どれを出すかは battle.css のコンテナクエリ）
 */
function BriefChips({ chips }: { chips: Chip[] }) {
  if (chips.length === 0) return null;
  const { shown } = overflowItems(chips, 4);
  return (
    <span className="mt__brief" aria-hidden="true">
      {shown.map((c, i) => (
        <span key={c.id} className={cx('st', `st--${c.tone}`, 'mt__bchip', i >= 1 && 'mt__bchip--2nd', i >= 2 && 'mt__bchip--late', isTauntChip(c.id) && 'mt__bchip--taunt')} title={typeof c.card.title === 'string' ? c.card.title : undefined}>
          <BriefFace c={c} />
        </span>
      ))}
      {chips.length > 1 && <span className="mt__bmore mt__bmore--1">+{chips.length - 1}</span>}
      {chips.length > 2 && <span className="mt__bmore mt__bmore--2">+{chips.length - 2}</span>}
      {chips.length > 4 && <span className="mt__bmore mt__bmore--4">+{chips.length - 4}</span>}
    </span>
  );
}

/** PC のタイルの札は2行まで（それより多いとタイルが場からはみ出し、下の角の紋章が切れる）。低い場は1行（battle.css の --tile-chip-lines） */
const TILE_CHIP_LINES = 2;

/**
 * PC のタイルの札：入るだけ出して、残りは「+N」（押すとタイルの詳細にすべて出る）。
 * 札の幅は文字で変わるので、並べてみて行数を測り、2行に収まるまで1つずつ減らす（札・幅が変わったら測り直す）
 */
function TileChips({ chips }: { chips: Chip[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = chips.map((c) => c.id + c.label).join('|');
  const [width, setWidth] = useState(0);
  const [fit, setFit] = useState<{ key: string; width: number; n: number } | null>(null);
  const n = fit && fit.key === key && fit.width === width ? fit.n : chips.length;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((es) => setWidth(Math.round(es[0]?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || n === 0) return;
    const tops: number[] = [];
    for (const k of Array.from(el.children) as HTMLElement[]) {
      if (!tops.some((t) => Math.abs(t - k.offsetTop) < 3)) tops.push(k.offsetTop);
    }
    // 低い場（PC の狭い高さ）は battle.css が --tile-chip-lines で1行にする
    const lines = parseInt(getComputedStyle(el).getPropertyValue('--tile-chip-lines'), 10) || TILE_CHIP_LINES;
    if (tops.length > lines) setFit({ key, width, n: n - 1 });
  });
  if (chips.length === 0) return null;
  const { shown, more } = overflowItems(chips, n);
  return (
    <div ref={ref} className="chips-row mt__chips">
      {shown.map((c) => (
        <span key={c.id} className={cx('st', `st--${c.tone}`, isTauntChip(c.id) && 'st--taunt')} title={typeof c.card.title === 'string' ? c.card.title : undefined}>
          <ChipFace c={c} />
        </span>
      ))}
      {more > 0 && (
        <span className="mt__cmore" title={chips.slice(n).map((c) => c.label).join('・')}>
          +{more}
        </span>
      )}
    </div>
  );
}

export function MonsterTile({
  m,
  def,
  ready,
  blockLabel,
  selected,
  targetable,
  flags,
  onClick,
  onDetail,
  onPointerDown,
  flash,
  hidden,
  dying,
  isMine,
  dropHover,
  dragging,
  ownerTurns,
  attackNow,
  activate,
  extraCost = 0,
  realName,
  compact,
}: MonsterTileProps) {
  const press = useLongPress(onDetail);
  // 裏向き：銘板が「裏向き」、絵は「？」の紋なので、「裏向き」の札は出さない（詳細には出る）
  const chips = monsterChips(def, m, flags, ownerTurns, attackNow, realName).filter((c) => !(m.faceDown && c.id === 'faceDown'));
  // スマホ：挑発を先頭に、守備力（0でなければ）はステータスの行から札へ移す（狭いタイルで数字がくっつかないように）
  const briefChips = compact
    ? tileChipOrder(chips, m.defense !== 0 ? { id: 'def', label: `🛡${m.defense}`, gi: 'shield', text: String(m.defense), tone: 'info', card: { title: `守備力 ${m.defense}`, description: '受けるダメージをこの数だけ減らす（最低ダメージあり）' } } : undefined)
    : [];
  // 挑発：城壁の狭間（上の縁の石の凸凹）と石の縁（カードデザイン案A）
  const taunt = chips.some((c) => isTauntChip(c.id));
  const label = m.faceDown ? '裏向き' : def?.name ?? '？';
  // 護法（MTG 要素 ○ バッチB）：対象にすると増えるエナジーを「対象」の札に添える
  const state = targetable ? '対象' : selected ? '選択中' : ready ? '攻撃できる' : blockLabel ?? null;
  // 休眠中（MTG 要素 △ バッチA）は半透明。一時蘇生・ワープ（△ バッチB・C）はターン終了時に場を離れるので点線の枠で薄く
  const dormant = m.counters.dormantFrom !== undefined && ownerTurns !== undefined && (ownerTurns - m.counters.dormantFrom) % 2 === 1;
  const fleeting = m.unearthed === true || m.warped === true;
  const curse = def ? analyzeCard(def).isCurse : false;
  const atk = attackOf(m, attackNow);
  const hurt = m.hp < m.maxHp;
  return (
    <div
      className={cx(
        'mt',
        compact && 'mt--compact',
        taunt && 'mt--taunt',
        isMine ? 'mt--me' : 'mt--opp',
        frameClasses(def?.rarity, 'monster', curse),
        m.faceDown && 'is-facedown',
        m.card.token && 'is-token',
        ready && 'is-ready',
        selected && 'is-selected',
        targetable && 'is-targetable',
        dropHover && 'is-drop-hover',
        dragging && 'is-dragging',
        m.sealed && 'is-sealed',
        m.stealth && 'is-stealth',
        dormant && 'is-dormant',
        fleeting && 'is-fleeting',
        hidden && 'is-hidden',
        dying && 'is-dying',
        flash,
      )}
      role="button"
      tabIndex={dying ? -1 : 0}
      aria-label={`${label}（攻撃力${atk}・体力${m.hp}${hurt ? `／${m.maxHp}` : ''}・守備力${m.defense}）${state ? `・${state}` : ''}${targetable && extraCost > 0 ? `・護法でエナジー+${extraCost}` : ''}${compact && chips.length > 0 ? `・${chips.map((c) => c.label).join('・')}` : ''}。押すと詳細`}
      aria-pressed={selected || undefined}
      data-fx={m.uid}
      data-drop={dying ? undefined : `m:${m.uid}`}
      onClick={() => {
        if (press.consumed()) return;
        onClick();
      }}
      onKeyDown={(e) => handleKey(e, onClick)}
      {...press.handlers}
      onPointerDown={(e) => {
        press.handlers.onPointerDown?.(e);
        onPointerDown?.(e);
      }}
    >
      {state && (
        <span className={cx('mt__state', targetable && 'mt__state--target', targetable && extraCost > 0 && 'mt__state--ward', selected && 'mt__state--sel', ready && !targetable && !selected && 'mt__state--ready')}>
          <span className="mt__stxt">{state}</span>
          {targetable && extraCost > 0 && <em>護法+{extraCost}⚡</em>}
        </span>
      )}
      <span className="mt__icon" aria-hidden="true">
        {m.faceDown ? (
          <span className="mt__back">
            <b>?</b>
          </span>
        ) : (
          <CardArt icon={def?.icon} rarity={def?.rarity} cardType="monster" curse={curse} />
        )}
      </span>
      <span className={cx('mt__name', nameFit(label))}>{label}</span>
      {realName && !compact && <span className="mt__real">（{realName}）</span>}
      {def?.tribe && !compact && (
        <span className="mt__tribe" title={`種族：${TRIBE_LABEL[def.tribe]}`}>
          {TRIBE_LABEL[def.tribe]}
        </span>
      )}
      <span className="mt__stats" aria-hidden="true">
        <Emblem kind="atk" value={atk} buffed={atk > m.attack} className="mt__stat" srLabel={false} mini={compact} />
        <Emblem kind="hp" value={m.hp} hurt={hurt} className="mt__stat" srLabel={false} />
        {!compact && m.defense !== 0 && <Emblem kind="def" value={m.defense} className="mt__stat" srLabel={false} />}
      </span>
      {hurt && (
        <span className="mt__hpbar" aria-hidden="true">
          <i style={{ width: `${Math.max(0, Math.min(100, Math.round((m.hp / Math.max(1, m.maxHp)) * 100)))}%` }} />
        </span>
      )}
      {compact ? <BriefChips chips={briefChips} /> : <TileChips chips={chips} />}
      {activate && activate.length > 0 && !dying && (
        <span className="mt__acts">
          {activate.map((a) => (
            <ActivateBtn key={a.key ?? 'act'} a={a} name={label} className="mt__act" />
          ))}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 手札

interface HandCardProps {
  card: battle.CardInst;
  def: CardDef | undefined;
  info: battle.PlayInfo;
  energy: number;
  playable: boolean;
  selected: boolean;
  /** 相手のターンなど、今は使えない時間 */
  dim: boolean;
  /** タップ（クリック）・Enter：詳細を開く */
  onClick: () => void;
  onDetail?: () => void;
  onHover?: (el: HTMLElement | null) => void;
  /** ドラッグの始まり（使う） */
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  /** つかんで動かしている（元の場所は薄く・持ち上げて表示） */
  dragging?: 'ghost' | 'arrow' | null;
  /** ドラッグのゴーストとして描く（操作を受けない） */
  ghost?: boolean;
  /** いま手札に入ったばかり（少しの間光らせる） */
  fresh?: boolean;
  /** 絵としてだけ描く（操作は外側の部品が受ける。マリガン・選択の CardPickGrid。UI2） */
  still?: boolean;
}

export function HandCard({ card, def, info, energy, playable, selected, dim, onClick, onDetail, onHover, onPointerDown, dragging, ghost, fresh, still }: HandCardProps) {
  const press = useLongPress(ghost || still ? undefined : onDetail);
  const ref = useRef<HTMLDivElement>(null);
  const cost = info.cost;
  const interactive = ghost || still
    ? { 'aria-hidden': true as const }
    : {
        role: 'button',
        tabIndex: 0,
        onClick: () => {
          if (press.consumed()) return;
          onClick();
        },
        onKeyDown: (e: KeyboardEvent) => handleKey(e, onClick),
        ...press.handlers,
        onPointerDown: (e: PointerEvent<HTMLElement>) => {
          press.handlers.onPointerDown?.(e);
          onPointerDown?.(e);
        },
      };
  const dragCls = dragging === 'ghost' ? 'is-drag-src' : dragging === 'arrow' ? 'is-drag-aim' : null;
  if (!def) {
    return (
      <div ref={ref} className={cx('hc', 'hc--noise', frameClasses('common', undefined, true), selected && 'is-selected', dim && 'is-dim', playable && 'is-playable', cost > energy && 'is-short', dragCls, fresh && 'is-fresh')} aria-label={`ノイズ（除外にエナジー${cost}）。押すと詳細`} {...interactive}>
        <span className="hc__costwrap">
          <CostGem cost={cost} tone={cost > energy ? 'short' : null} className="hc__cost" label={false} />
        </span>
        <span className="hc__icon" aria-hidden="true">
          <CardArt icon={NOISE_ART} curse />
        </span>
        <span className="hc__name">ノイズ</span>
        <span className="hc__type">何もしない</span>
        <span className="hc__text">エナジー{cost}で除外できる</span>
      </div>
    );
  }
  const a = analyzeCard(def);
  const discounted = cost < def.cost;
  const taxed = cost > def.cost;
  const short = cost > energy;
  // 封殺（MTG 要素 ○ バッチB）で無効になるカードは、他の注意より先に「封殺」の札（使う前の確認ダイアログもある）
  const quashed = info.warnings.includes(battle.WARN_QUASH);
  // 氷結（MTG 要素 △ バッチA）で凍った手札は、ほかの札より先に「氷結」
  const iced = info.blocked === battle.WARN_ICED;
  const warn = info.warnings[0];
  const badge = iced ? '氷結' : quashed ? '封殺' : warn ? (battle.isPowerCapWarning(warn) ? 'パワー入替' : warn.startsWith('条件') ? '条件未達' : '対象なし') : null;
  // 成長（MTG 要素 ○ バッチB）：この1枚で増えたダメージ
  const grown = card.grow ?? 0;
  // コストの内訳（MTG 要素 ○ バッチC1：親和・条件付き軽減・凍結・軽減効果）とキッカー
  const steps = info.breakdown?.steps ?? [];
  const costNotes = [
    short ? `エナジーが足りません（必要${cost}・残り${energy}）` : `必要なエナジー ${cost}（残り${energy}）`,
    steps.length > 0 ? `元のコスト${def.cost}：${steps.map((x) => `${x.label}${x.delta > 0 ? '+' : '−'}${Math.abs(x.delta)}`).join('、')}` : '',
    info.kicker ? `キッカー：追加でエナジー${info.kicker.extra}（${info.kicker.payable ? '払える' : '今は払えない'}）` : '',
    ...handAbilityNotes(def),
    // モード選択（MTG 要素 ○ バッチC2）：モードごとのコスト
    info.modes ? `モード選択：${info.modes.map((m) => `${m.mode === 0 ? '全' : m.label} ⚡${m.cost}${m.blocked ? '（不可）' : ''}`).join('・')}（場に落とすと選ぶ）` : '',
    // MTG 要素 △ バッチB：払い方しだいで下がるコスト
    info.pay && info.pay.minCost < cost ? `払い方しだいで ⚡${info.pay.minCost} まで下がる（場に落とすと支払いのシート）` : '',
  ].filter(Boolean);
  // サイクリング・魂力の印（捨て札の山へドラッグで使える）
  const kinds = battle.handAbilityKinds(def);
  const marks = [
    ...kinds.map((k) => ({ icon: k === 'cycling' ? '♻' : k === 'forecast' ? '🔮' : '🌀', title: battle.handAbilityOf(def, k)!.name })),
    ...(info.modes ? [{ icon: mechanicGlossary.modes!.icon, title: 'モード選択' }] : []),
    // 支払いのシートで選ぶもの（MTG 要素 △ バッチB）
    ...(info.pay ? [{ icon: mechanicGlossary.payment!.icon, title: '支払いのシートで選べる（場に落とすと出る）' }] : []),
  ];
  const abil = marks.length > 0 ? { icon: marks.map((m) => m.icon).join(''), title: marks.map((m) => m.title).join('・') } : null;
  const costEl = (
    <CostGem cost={cost} tone={short ? 'short' : discounted ? 'down' : taxed ? 'up' : null} className="hc__cost" label={false}>
      {info.kicker && <small className="hc__kick">+{info.kicker.extra}</small>}
    </CostGem>
  );
  const permAtk = def.stats ? def.stats.attack + (card.perm?.attack ?? 0) : 0;
  const permHp = def.stats ? def.stats.hp + (card.perm?.hp ?? 0) : 0;
  return (
    <div
      ref={ref}
      className={cx(
        'hc',
        frameClasses(def.rarity, a.cardType, a.isCurse),
        // 種類（スマホは種類の文字を出さないので、上の縁の色で見分ける）
        `hc--t-${a.cardType}`,
        a.isCurse && 'hc--curse',
        def.stats && 'hc--monster',
        quashed && 'is-quashed',
        playable && 'is-playable',
        selected && 'is-selected',
        dim && 'is-dim',
        short && 'is-short',
        dragCls,
        ghost && 'hc--ghost',
        fresh && 'is-fresh',
        iced && 'is-iced',
      )}
      aria-label={ghost || still ? undefined : `${def.name}（コスト${cost}${def.stats ? `・攻撃力${permAtk}・体力${permHp}` : ''}）${grown > 0 ? `・成長+${grown}` : ''}${badge ? `・${badge}` : ''}${selected ? '・選択中' : ''}。押すと詳細${playable ? '、場へドラッグで使う' : ''}`}
      aria-pressed={!ghost && !still && selected ? true : undefined}
      onMouseEnter={onHover ? () => onHover(ref.current) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      onFocus={onHover ? () => onHover(ref.current) : undefined}
      onBlur={onHover ? () => onHover(null) : undefined}
      {...interactive}
    >
      {ghost || still ? (
        <span className="hc__costwrap">{costEl}</span>
      ) : (
        <Popover content={{ title: `コスト ${cost}`, lines: costNotes }} placement="top" hover={false} className="hc__costwrap">
          {costEl}
        </Popover>
      )}
      {badge && (
        <span className={cx('hc__badge', iced ? 'hc__badge--ice' : quashed && 'hc__badge--quash')} title={badge}>
          <span className="hc__badgetext">{badge}</span>
          <span className="hc__badgeicon" aria-hidden="true">
            {HAND_BADGE_ICON[badge] ?? '!'}
          </span>
        </span>
      )}
      {abil && (
        <span className="hc__abil" aria-hidden="true" title={abil.title}>
          {abil.icon}
        </span>
      )}
      <span className="hc__icon" aria-hidden="true">
        <CardArt icon={def.icon} rarity={def.rarity} cardType={a.cardType} curse={a.isCurse} />
      </span>
      <span className={cx('hc__name', nameFit(def.name))}>{def.name}</span>
      <span className="hc__type">
        {CARD_TYPE_LABEL[a.cardType]}
        {card.copy ? '・コピー' : ''}
        {grown > 0 && <span className="hc__grow">成長+{grown}</span>}
      </span>
      <span className="hc__text">{summarizeCard(grownDef(def, grown))}</span>
      {def.stats && (
        <span className={cx('hc__stats', card.perm && 'is-perm')} aria-hidden="true">
          {/* 永久強化（MTG 要素 △ バッチA）は数値に足して表示（明るい緑）。守備力は詳細で */}
          <Emblem kind="atk" value={permAtk} buffed={(card.perm?.attack ?? 0) > 0} srLabel={false} />
          <Emblem kind="hp" value={permHp} buffed={(card.perm?.hp ?? 0) > 0} srLabel={false} />
        </span>
      )}
    </div>
  );
}

/**
 * 成長（MTG 要素 ○ バッチB）した1枚の表示用の定義：使用時のダメージ・連撃の数値に grow を足す
 * （エンジンの queue.ts の grownStep と同じ。保存はしない）
 */
export function grownDef(def: CardDef, grow: number | undefined, perm?: { attack: number; hp: number }): CardDef {
  // 永久強化（MTG 要素 △ バッチA）：ステータスに足す
  const base = perm && def.stats ? { ...def, stats: { ...def.stats, attack: def.stats.attack + perm.attack, hp: def.stats.hp + perm.hp } } : def;
  if (!grow) return base;
  return { ...base, effects: base.effects.map((e) => (e.timing === 'play' && getEffect(e.id)?.isDamage ? { ...e, value: (e.value ?? 0) + grow } : e)) };
}

/** 手札から使う能力（サイクリング・魂力。MTG 要素 ○ バッチC1）の案内 */
function handAbilityNotes(def: CardDef): string[] {
  return battle.handAbilityKinds(def).map((k) => {
    const h = battle.handAbilityOf(def, k)!;
    return `${h.name}：エナジー${h.cost}で捨てて${k === 'cycling' ? '1枚引く' : '魂力の効果'}（捨て札の山へドラッグ）`;
  });
}

// ---------------------------------------------------------------- 入力の小道具

function handleKey(e: KeyboardEvent, action: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    action();
  }
}

/** 長押しをやめる移動量（px）。ドラッグを始める量（dragLogic）より小さくして、ドラッグ中に詳細が開かないようにする */
const LONG_PRESS_SLOP = 5;

interface PressHandlers {
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  onPointerMove?: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
  onPointerLeave?: () => void;
  onContextMenu?: (e: { preventDefault(): void }) => void;
}

/** 長押し（450ms）で onLong。長押しが成立したら直後の click は無視する */
export function useLongPress(onLong?: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const handlers: PressHandlers = onLong
    ? {
        onPointerDown: (e) => {
          if (e.button !== 0) return;
          fired.current = false;
          start.current = { x: e.clientX, y: e.clientY };
          clear();
          timer.current = setTimeout(() => {
            fired.current = true;
            onLong();
          }, 450);
        },
        onPointerMove: (e) => {
          if (!start.current) return;
          if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > LONG_PRESS_SLOP) clear();
        },
        onPointerUp: clear,
        onPointerCancel: clear,
        onPointerLeave: clear,
        onContextMenu: (e) => e.preventDefault(),
      }
    : {};
  return {
    handlers,
    /** 直前の長押しで click を消費したか */
    consumed: () => {
      const f = fired.current;
      fired.current = false;
      return f;
    },
  };
}

// ---------------------------------------------------------------- ログ

interface LogGroup {
  key: string;
  head: battle.LogEntry | null;
  owner: PlayerId | null;
  rows: { e: battle.LogEntry; i: number }[];
}

function groupLog(log: battle.LogEntry[]): LogGroup[] {
  const groups: LogGroup[] = [];
  let cur: LogGroup = { key: 'start', head: null, owner: null, rows: [] };
  log.forEach((e, i) => {
    if (e.kind === 'turn') {
      if (cur.rows.length || cur.head) groups.push(cur);
      cur = { key: `t${i}`, head: e, owner: e.ev?.player ?? null, rows: [] };
      return;
    }
    cur.rows.push({ e, i });
  });
  groups.push(cur);
  return groups;
}

/** ログ1行の文（カード名は黄色で押すと詳細、プレイヤー名は自分／相手の色、ダメージは赤、回復は緑） */
export function LogText({ text, names, me, preferId, onCard }: { text: string; names: LogNames; me: PlayerId; preferId?: string; onCard?: (cardId: string) => void }) {
  const segs = tokenizeLog(stripOptionIcons(text), names, preferId);
  return (
    <>
      {segs.map((s, i) => {
        switch (s.t) {
          case 'card':
            return onCard ? (
              <button key={i} type="button" className="lt-card" onClick={(e) => (e.stopPropagation(), onCard(s.cardId))} aria-label={`${s.text}の詳細`}>
                {s.text}
              </button>
            ) : (
              <b key={i} className="lt-card">
                {s.text}
              </b>
            );
          case 'player':
            return (
              <span key={i} className={s.player === me ? 'lt-mine' : 'lt-enemy'}>
                {s.text}
              </span>
            );
          case 'num':
            return s.tone === 'plain' ? (
              <span key={i}>{s.text}</span>
            ) : (
              <b key={i} className={s.tone === 'damage' ? 'lt-dmg' : 'lt-heal'}>
                {s.text}
              </b>
            );
          default:
            return <span key={i}>{s.text}</span>;
        }
      })}
    </>
  );
}

export function LogPanel({ log, me, names, onCard, compact = false }: { log: battle.LogEntry[]; me: PlayerId; names: LogNames; onCard?: (cardId: string) => void; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const groups = groupLog(log);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);
  const last = groups[groups.length - 1]?.key;
  const rowTone = (e: battle.LogEntry, owner: PlayerId | null): string => {
    const ev = e.ev;
    const who = ev?.player ?? (ev?.target?.kind === 'player' ? ev.target.player : null) ?? owner;
    if (who === null) return '';
    return who === me ? 'log__row--mine' : 'log__row--enemy';
  };
  return (
    <div className={cx('log', compact && 'log--compact')} ref={ref}>
      {groups.map((g, gi) => {
        const isOpen = open[g.key] ?? (gi >= groups.length - 2);
        const mine = g.owner === me;
        return (
          <section key={g.key} className={cx('log__group', g.owner !== null && (mine ? 'log__group--mine' : 'log__group--enemy'), g.key === last && 'is-last')}>
            {g.head ? (
              <button type="button" className="log__head" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [g.key]: !isOpen }))}>
                <span className="log__chev" aria-hidden="true">
                  {isOpen ? '▾' : '▸'}
                </span>
                <span className="log__headtext">{g.head.text.replace(/^── |──$/g, '').trim()}</span>
                <span className="log__count">{g.rows.length}件</span>
              </button>
            ) : (
              <div className="log__head log__head--static">対戦開始</div>
            )}
            {isOpen &&
              g.rows.map(({ e, i }) => {
                const gi = logGi(e.ev?.kind, e.kind, e.ev?.status ?? e.ev?.damageKind);
                const depth = Math.min(e.depth, 4);
                return (
                  <div
                    key={i}
                    className={cx('log__row', `log__row--${e.kind}`, e.ev && `log__row--ev-${e.ev.kind}`, depth > 0 && 'log__row--nested', e.private === me && 'log__row--private', rowTone(e, g.owner))}
                    style={{ '--depth': depth } as CSSProperties}
                  >
                    <span className="log__mark" aria-hidden="true">
                      {/* 形の無い出来事は小さな鉄の菱形（絵文字は使わない） */}
                      {gi ? <UiIcon name={`gi:${gi.gi}`} className={gi.tone && `gi--${gi.tone}`} /> : <i className="log__dot" />}
                    </span>
                    <span className="log__text">
                      <LogText text={e.text} names={names} me={me} preferId={e.ev?.cardId} onCard={onCard} />
                    </span>
                  </div>
                );
              })}
          </section>
        );
      })}
    </div>
  );
}
