/** 対戦画面の部品：プレイヤー情報、モンスター、手札、ログ、状態異常の札（説明はポップオーバー） */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { BALANCE, battle, CARD_TYPE_LABEL, analyzeCard, describeEffect, getEffect, TIMINGS, TRIBE_LABEL, type CardDef } from '../../engine/index.ts';
import { Popover, type PopoverCard } from '../components/Popover.tsx';
import { glossary, keywordGlossary, mechanicGlossary, type GlossaryEntry } from '../glossary.ts';
import { cx } from '../util.ts';
import { logIcon, tokenizeLog, type LogNames } from './logFormat.ts';
import type { Float } from './useReplay.ts';
import { monsterForecasts, summarizeCard } from './summary.ts';

type Statuses = battle.Statuses;
type PlayerId = battle.PlayerId;

export interface Chip {
  id: string;
  label: string;
  tone: 'bad' | 'good' | 'info' | 'kw' | 'power';
  card: PopoverCard;
}

const chipOf = (g: GlossaryEntry, value: string, lines: ReactNode[] = []): Omit<Chip, 'id'> => ({
  label: `${g.icon}${value}`,
  tone: g.tone,
  card: { title: `${g.icon} ${g.name}${value ? ` ${value}` : ''}`, description: g.short, lines },
});

/** 状態異常・持続効果を小さな札にする。説明文は用語集（glossary.ts）と共通 */
export function statusChips(s: Statuses, isPlayer: boolean): Chip[] {
  const G = glossary;
  const out: Chip[] = [];
  const add = (id: string, cond: unknown, chip: Omit<Chip, 'id'>) => cond && out.push({ id, ...chip });
  add('poison', s.poison, chipOf(G.poison, String(s.poison), [`次の自分のターン開始時に${s.poison}ダメージ → そのあと${Math.floor(s.poison / 2)}に`]));
  add('doom', s.doom, chipOf(G.doom, String(s.doom ?? 0), [`自分のターン開始時に毎回${s.doom ?? 0}ダメージ（減らない。浄化で消える）`]));
  // MTG 要素 △ バッチA：放射能
  add('rad', s.rad, chipOf(G.rad, String(s.rad ?? 0), [`次の自分のターン開始時に山札の上${s.rad ?? 0}枚を捨て札へ（モンスター以外1枚ごとに${BALANCE.battle.radDamage}ダメージ）`]));
  add('burn', s.burn, chipOf(G.burn, `${s.burn}T`, [`残り${s.burn}ターン`]));
  add('weak', s.weak, chipOf(G.weak, `${s.weak}T`, [`残り${s.weak}ターン`]));
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

/** passive：札を押せない飾りにする（モンスターの札。押すとタイルの詳細が開き、説明はそこにまとめて出る） */
export function Chips({ chips, className, passive }: { chips: Chip[]; className?: string; passive?: boolean }) {
  if (chips.length === 0) return null;
  if (passive) {
    return (
      <div className={cx('chips-row', className)}>
        {chips.map((c) => (
          <span key={c.id} className={`st st--${c.tone}`} title={typeof c.card.title === 'string' ? c.card.title : undefined}>
            {c.label}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className={cx('chips-row', className)}>
      {chips.map((c) => (
        <Popover key={c.id} content={c.card} placement="top">
          <span className={`st st--${c.tone}`}>{c.label}</span>
        </Popover>
      ))}
    </div>
  );
}

/** 浮かぶ数字（ダメージ・回復・状態異常） */
export function Floats({ items }: { items: Float[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <span className="fx-floats" aria-hidden="true">
      {items.map((f, i) => (
        <span key={f.id} className={`fx-float fx-float--${f.tone}`} style={{ '--i': i } as CSSProperties}>
          {f.text}
        </span>
      ))}
    </span>
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
  floats?: Float[];
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
  powerActivate?: (pw: battle.PowerInst) => ActivateButton | null;
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
}

/** 起動の ⚡ ボタン（モンスター・パワー）。使えないときは灰色で、押すと理由を出す */
export interface ActivateButton {
  cost: number;
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
      className={cx('act-btn', a.blocked && 'is-blocked', a.dragging && 'is-dragging', className)}
      aria-label={`「${name}」を起動（エナジー${a.cost}）${a.blocked ? `：${a.blocked}` : ''}`}
      aria-disabled={a.blocked ? true : undefined}
      data-activate={name}
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
      ⚡{a.cost}
    </button>
  );
  if (!a.blocked) return btn;
  return (
    <Popover content={{ title: `⚡ 起動（エナジー${a.cost}）`, description: a.blocked }} placement="top" hover={false}>
      {btn}
    </Popover>
  );
}

export function PlayerPanel({
  ps,
  isMe,
  active,
  targetable,
  onClick,
  onPile,
  floats,
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
}: PlayerPanelProps) {
  const hp = hpShown ?? ps.hp;
  const pct = Math.max(0, Math.min(100, (hp / ps.maxHp) * 100));
  const next = [
    ps.next.energy ? `次のエナジー${ps.next.energy > 0 ? '+' : ''}${ps.next.energy}` : '',
    ps.next.draw ? `次のドロー${ps.next.draw > 0 ? '+' : ''}${ps.next.draw}` : '',
    ps.discount ? `次のカード−${ps.discount}` : '',
  ].filter(Boolean);
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
        <span className="pp__role">{roleLabel}</span>
        <b className="pp__name">{ps.name}</b>
        {hasCrown && (
          <Popover content={{ title: `${mechanicGlossary.crown!.icon} 王冠`, description: mechanicGlossary.crown!.short }} placement="bottom">
            <span className="pp__crown" data-fx={`crown:${isMe ? 'me' : 'opp'}`} aria-label="王冠を持っている">
              {mechanicGlossary.crown!.icon}
            </span>
          </Popover>
        )}
        {targetable && <span className="pp__target">対象</span>}
        <span className="pp__energy" aria-label={`エナジー${ps.energy}`}>
          ⚡{ps.energy}
        </span>
      </div>
      <div className="pp__hp">
        <span className="pp__hpnum">
          <span className="pp__hpicon" aria-hidden="true">
            ❤
          </span>
          {hp}
          <small>/{ps.maxHp}</small>
        </span>
        <div className="hpbar" aria-hidden="true">
          <div className="hpbar__fill" style={{ width: `${pct}%` }} />
        </div>
        {ps.shield > 0 && (
          <Popover content={{ title: `🛡 シールド ${ps.shield}`, description: glossary.shield.short }} placement="top">
            <span className="pp__shield">🛡{ps.shield}</span>
          </Popover>
        )}
      </div>
      <div className="pp__meta">
        <Popover content={{ title: `📚 山札 ${ps.deck.length}枚`, description: '引く順番は非公開。尽きたら捨て札をシャッフルして山札にする' }} placement="top">
          <span className="pile">📚{ps.deck.length}</span>
        </Popover>
        <button
          type="button"
          className={cx('pile pile--btn', isMe && 'pile--drop', pileLit && 'is-lit', pileHover && 'is-drop-hover')}
          onClick={(e) => (e.stopPropagation(), onPile('discard'))}
          aria-label={`捨て札${ps.discard.length}枚を見る${discardUsable > 0 ? `（捨て札から使えるカード${discardUsable}枚）` : ''}`}
          data-drop={isMe ? 'pile' : undefined}
          data-fx={isMe ? 'pile' : undefined}
        >
          🗑{ps.discard.length}
          {discardUsable > 0 && <span className="pile__usable">使える{discardUsable}</span>}
        </button>
        <button type="button" className="pile pile--btn" onClick={(e) => (e.stopPropagation(), onPile('exile'))} aria-label={`除外${ps.exile.length}枚を見る`}>
          ⛔{ps.exile.length}
        </button>
        {!isMe && (
          <Popover content={{ title: `🂠 手札 ${ps.hand.length}枚`, description: '相手の手札の中身は見えない' }} placement="top">
            <span className="pile">🂠{ps.hand.length}</span>
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
            <span className="pp__next pp__powers">
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
              {mechanicGlossary.quash!.icon}封殺（{QUASH_KIND[ps.quash.kind] ?? 'カード'}）
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
        {ps.powers.map((pw) => {
          const act = powerActivate?.(pw) ?? null;
          const meter = powerMeter(pw, powerDef?.(pw), ps.turnsTaken);
          return (
            <span key={pw.uid} className={cx('pw-chip', act && 'pw-chip--act', powerFlash?.[pw.uid])} data-fx={pw.uid}>
              <button
                type="button"
                className="st st--power st--btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onPower?.(pw);
                }}
                aria-label={`パワー「${pw.name}」の詳細`}
              >
                ✦{pw.name}
                {pw.life !== undefined && <span className="st__life">{` ${mechanicGlossary.lifespan!.icon}${pw.life}`}</span>}
                {meter && <span className="st__meter">{` ${meter}`}</span>}
              </button>
              {act && <ActivateBtn a={act} name={pw.name} />}
            </span>
          );
        })}
      </div>
      <Floats items={floats} />
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
        {g.icon}
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
 * パワーの札に添える短い表示：英雄譚「📖2/3」・蓄積「🔋1/3」（MTG 要素 ○ バッチC2）、罠「🪤」・プラン「📜」・休眠中「💤」・累加維持費「⏫2」
 * （MTG 要素 △ バッチA。休眠は持ち主の turnsTaken を渡したときだけ）
 */
export function powerMeter(pw: battle.PowerInst, def: CardDef | undefined, ownerTurns?: number): string | null {
  const M = mechanicGlossary;
  const parts: string[] = [];
  if (pw.chapter !== undefined) parts.push(`${M.saga!.icon}${pw.chapter}/${battle.lastChapter(def) || pw.chapter}`);
  const charge = def?.abilities?.find((a) => a.id === 'charge');
  if (charge) parts.push(`${charge.once ? M.plan!.icon : ''}${M.charge!.icon}${pw.charge ?? 0}/${charge.value ?? ''}`);
  if (def?.abilities?.some((a) => a.id === 'trap')) parts.push(M.trap!.icon);
  if (ownerTurns !== undefined && pw.dormantFrom !== undefined && (ownerTurns - pw.dormantFrom) % 2 === 1) parts.push(`${M.dormant!.icon}休眠中`);
  if (pw.age) parts.push(`${M.cumulativeUpkeep!.icon}${pw.age}`);
  return parts.length > 0 ? parts.join(' ') : null;
}

export function powerLines(pw: battle.PowerInst, def?: CardDef): ReactNode[] {
  const effects = pw.effects.filter((x) => !x.removed).map((x) => `${TIMINGS[x.effect.timing]?.label ?? ''}：${getEffect(x.effect.id)?.name ?? x.effect.id}`);
  const life = pw.life !== undefined ? [`${mechanicGlossary.lifespan!.icon} 寿命：残り${pw.life}（持ち主のターン終了時に1減り、0で消える）`] : [];
  // 英雄譚：いまの章と、次の章の効果。蓄積：たまった数
  const extra: string[] = [];
  if (pw.chapter !== undefined) {
    const last = battle.lastChapter(def) || pw.chapter;
    const next = pw.chapter < last ? (def?.effects ?? []).filter((e) => e.timing === `chapter${pw.chapter! + 1}`).map((e) => describeEffect(e, def, { noTiming: true })) : [];
    extra.push(`${mechanicGlossary.saga!.icon} 英雄譚：第${pw.chapter}章／全${last}章${pw.chapter >= last ? '（この章で終わる）' : ''}`);
    if (next.length > 0) extra.push(`次の自分のターン開始時に第${pw.chapter + 1}章：${next.join('')}`);
  }
  const charge = def?.abilities?.find((a) => a.id === 'charge');
  if (charge) extra.push(`${mechanicGlossary.charge!.icon} 蓄積：${pw.charge ?? 0}/${charge.value ?? ''}${charge.once ? `（${mechanicGlossary.plan!.short}）` : ''}`);
  // MTG 要素 △ バッチA：罠・休眠・累加維持費
  if (def?.abilities?.some((a) => a.id === 'trap')) extra.push(`${mechanicGlossary.trap!.icon} ${mechanicGlossary.trap!.short}`);
  if (pw.dormantFrom !== undefined) extra.push(`${mechanicGlossary.dormant!.icon} ${mechanicGlossary.dormant!.short}`);
  if (pw.age) extra.push(`${mechanicGlossary.cumulativeUpkeep!.icon} 累加維持費：場にあるターン数 ${pw.age}`);
  return [...extra, ...effects, ...pw.drawbacks.map((d) => `☠ デメリット（${d.timing ? TIMINGS[d.timing].label : ''}）`), ...life];
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
  floats?: Float[];
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
  /** 起動の ⚡ ボタン（自分のモンスターで起動の能力があるとき。MTG 要素 ○ バッチC1） */
  activate?: ActivateButton | null;
  /** 対象にするとき増えるコスト（護法。MTG 要素 ○ バッチB）。0 なら出さない */
  extraCost?: number;
}

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
): Chip[] {
  const kws: Chip[] = (def?.keywords ?? []).map((k) => {
    const g = keywordGlossary[k.id];
    return {
      id: `kw:${k.id}`,
      label: g ? `${g.icon}${g.name}${k.value !== undefined ? k.value : ''}` : k.id,
      tone: 'kw',
      card: { title: g ? `${g.icon} ${g.name}` : k.id, description: g?.short ?? '' },
    };
  });
  const extra: Chip[] = [];
  if (m.sealed) extra.push({ id: 'sealed', label: `${glossary.seal.icon}封印`, tone: 'bad', card: { title: '🔒 封印', description: glossary.seal.short } });
  if (m.stealth) extra.push({ id: 'stealth', label: `${glossary.stealth.icon}隠密中`, tone: 'info', card: { title: '👤 隠密', description: glossary.stealth.short } });
  if (m.betraying) extra.push({ id: 'betraying', label: `${glossary.betrayal.icon}裏切り`, tone: 'bad', card: { title: '🗡 裏切り', description: glossary.betrayal.short } });
  const M = mechanicGlossary;
  if (m.card.token) extra.push({ id: 'token', label: `${M.token!.icon}トークン`, tone: 'info', card: { title: `${M.token!.icon} ${M.token!.name}`, description: M.token!.short } });
  if (!m.sealed) {
    for (const id of m.granted ?? []) {
      const g = keywordGlossary[id];
      extra.push({
        id: `gr:${id}`,
        label: `${M.granted!.icon}${g?.icon ?? ''}${g?.name ?? id}`,
        tone: 'kw',
        card: { title: `${M.granted!.icon} 付与：${g?.name ?? id}`, description: g?.short ?? '', lines: [M.granted!.short] },
      });
    }
  }
  if (m.tempAttack) {
    extra.push({
      id: 'temp',
      label: `${M.tempAttack!.icon}攻撃+${m.tempAttack}`,
      tone: 'good',
      card: { title: `${M.tempAttack!.icon} 一時強化 +${m.tempAttack}`, description: M.tempAttack!.short, lines: [`もとの攻撃力 ${m.attack} → このターン ${attackOf(m, attackNow)}`] },
    });
  }
  if (flags.divineShield && m.shieldUsed) {
    extra.push({ id: 'shieldUsed', label: `${keywordGlossary.divineShield?.icon ?? ''}聖盾 使用済み`, tone: 'info', card: { title: '聖盾（使用済み）', description: 'このモンスターの聖盾はもう使った。キーワード付与で聖盾を与え直すと戻る' } });
  }
  const life = m.counters.life;
  if (life !== undefined && life > 0) {
    extra.push({ id: 'life', label: `${M.lifespan!.icon}寿命${life}`, tone: 'bad', card: { title: `${M.lifespan!.icon} 寿命 残り${life}`, description: M.lifespan!.short, lines: [life === 1 ? 'このモンスターの持ち主のターン終了時に破壊される' : `あと${life}回、持ち主のターン終了時を迎えると破壊される`] } });
  }
  // MTG 要素 ○ バッチA：消耗（次の持ち主のターンは攻撃できない）・攻撃した回数（条件「このモンスターが3回以上攻撃した」のカードだけ）
  const exertTurn = m.counters.exertTurn;
  if (exertTurn !== undefined && ownerTurns !== undefined && exertTurn >= ownerTurns) {
    const now = exertTurn === ownerTurns;
    extra.push({
      id: 'exert',
      label: `${M.exert!.icon}消耗${now ? '中' : ''}`,
      tone: 'bad',
      card: { title: `${M.exert!.icon} ${M.exert!.name}`, description: M.exert!.short, lines: [now ? 'このターンは攻撃できない' : '次の持ち主のターンは攻撃できない'] },
    });
  }
  const attacksTotal = m.counters.attacksTotal ?? 0;
  if (attacksTotal > 0 && def?.effects.some((e) => e.condition === 'veteran')) {
    extra.push({ id: 'attacksTotal', label: `⚔攻撃した回数 ${attacksTotal}`, tone: 'info', card: { title: `攻撃した回数 ${attacksTotal}`, description: '場に出てから攻撃した回数（場を離れると0から）' } });
  }
  // MTG 要素 ○ バッチB：複写・応召・軍団、装備、借用、懸賞、分身を使った
  if (m.card.token?.copy) extra.push({ id: 'copy', label: `${M.copyToken!.icon}コピー`, tone: 'info', card: { title: `${M.copyToken!.icon} ${M.copyToken!.name}`, description: M.copyToken!.short } });
  if (m.card.token?.temp) extra.push({ id: 'temp-token', label: `${M.tempToken!.icon}応召`, tone: 'info', card: { title: `${M.tempToken!.icon} ${M.tempToken!.name}`, description: M.tempToken!.short } });
  if (m.card.cardId === battle.ARMY_CARD_ID) extra.push({ id: 'army', label: `${M.army!.icon}${M.army!.name}`, tone: 'info', card: { title: `${M.army!.icon} ${M.army!.name}`, description: M.army!.short } });
  if ((m.equipment?.length ?? 0) > 0) {
    const n = m.equipment!.length;
    extra.push({ id: 'equip', label: `${M.equip!.icon}装備${n > 1 ? `×${n}` : ''}`, tone: 'good', card: { title: `${M.equip!.icon} 装備（${n}枚）`, description: M.equip!.short } });
  }
  if (m.counters.borrowLeft !== undefined) {
    extra.push({ id: 'borrow', label: `${M.borrow!.icon}借用 残り${m.counters.borrowLeft}`, tone: 'info', card: { title: `${M.borrow!.icon} 借用（残り${m.counters.borrowLeft}ターン）`, description: M.borrow!.short } });
  }
  if ((m.bounty?.length ?? 0) > 0) {
    const draw = m.bounty!.reduce((n, b) => n + b.draw, 0);
    extra.push({ id: 'bounty', label: `${M.bounty!.icon}懸賞`, tone: 'info', card: { title: `${M.bounty!.icon} 懸賞（破壊されたら${draw}枚）`, description: M.bounty!.short } });
  }
  // MTG 要素 △ バッチA：卵・落とし子・消滅の印・容疑・守護・賛助のキーワード・休眠・累加維持費・萎縮・永久強化
  const egg = m.card.token?.egg;
  if (egg) {
    const left = ownerTurns !== undefined ? Math.max(0, egg.hatchAt - ownerTurns) : undefined;
    extra.push({
      id: 'egg',
      label: `${M.egg!.icon}卵${left !== undefined ? ` あと${left}` : ''}`,
      tone: 'info',
      card: { title: `${M.egg!.icon} ${M.egg!.name}（孵化すると攻撃力+${egg.attack}）`, description: M.egg!.short, lines: left !== undefined ? [`孵化まで、持ち主のターン開始あと${left}回`] : [] },
    });
  }
  if (m.card.token?.spawn) extra.push({ id: 'spawn', label: `${M.spawn!.icon}落とし子`, tone: 'info', card: { title: `${M.spawn!.icon} ${M.spawn!.name}`, description: M.spawn!.short } });
  if (m.finality) extra.push({ id: 'finality', label: `${M.finality!.icon}消滅の印`, tone: 'bad', card: { title: `${M.finality!.icon} ${M.finality!.name}`, description: M.finality!.short } });
  if (m.suspected) extra.push({ id: 'suspected', label: `${M.suspected!.icon}容疑`, tone: 'info', card: { title: `${M.suspected!.icon} ${M.suspected!.name}`, description: M.suspected!.short } });
  if (m.guard) {
    const gd = M[m.guard.kind]!;
    extra.push({ id: 'guard', label: `${gd.icon}${gd.name}`, tone: 'good', card: { title: `${gd.icon} 守護：${gd.name}`, description: gd.short } });
  }
  if (!m.sealed) {
    for (const id of m.tempGranted ?? []) {
      const g = keywordGlossary[id];
      extra.push({
        id: `tg:${id}`,
        label: `${M.tempGranted!.icon}${g?.icon ?? ''}${g?.name ?? id}`,
        tone: 'kw',
        card: { title: `${M.tempGranted!.icon} このターンだけ：${g?.name ?? id}`, description: g?.short ?? '', lines: [M.tempGranted!.short] },
      });
    }
  }
  const dormantFrom = m.counters.dormantFrom;
  if (dormantFrom !== undefined && ownerTurns !== undefined && (ownerTurns - dormantFrom) % 2 === 1) {
    extra.push({ id: 'dormant', label: `${M.dormant!.icon}休眠中`, tone: 'bad', card: { title: `${M.dormant!.icon} 休眠中`, description: M.dormant!.short } });
  }
  if (m.counters.age) {
    extra.push({ id: 'age', label: `${M.cumulativeUpkeep!.icon}累加${m.counters.age}`, tone: 'bad', card: { title: `${M.cumulativeUpkeep!.icon} 累加維持費（場にあるターン数 ${m.counters.age}）`, description: M.cumulativeUpkeep!.short } });
  }
  if (m.counters.withered) {
    extra.push({ id: 'withered', label: `${M.withered!.icon}萎縮−${m.counters.withered}`, tone: 'bad', card: { title: `${M.withered!.icon} 萎縮：最大体力−${m.counters.withered}`, description: M.withered!.short } });
  }
  if (m.card.perm && !m.card.token) {
    const p = m.card.perm;
    extra.push({ id: 'perm', label: `${M.perpetual!.icon}永久+${p.attack}/+${p.hp}`, tone: 'good', card: { title: `${M.perpetual!.icon} 永久強化 攻撃力+${p.attack}・体力+${p.hp}`, description: M.perpetual!.short } });
  }
  // MTG 要素 △ バッチB：試作版・解鎖・一時蘇生（公開の印）
  if (m.prototype) extra.push({ id: 'prototype', label: `${M.prototype!.icon}試作`, tone: 'info', card: { title: `${M.prototype!.icon} ${M.prototype!.name}`, description: M.prototype!.short } });
  if (m.unleashed) extra.push({ id: 'unleashed', label: `${M.unleashed!.icon}解鎖`, tone: 'info', card: { title: `${M.unleashed!.icon} ${M.unleashed!.name}`, description: M.unleashed!.short } });
  if (m.unearthed) extra.push({ id: 'unearthed', label: `${M.unearthed!.icon}一時`, tone: 'bad', card: { title: `${M.unearthed!.icon} ${M.unearthed!.name}`, description: M.unearthed!.short } });
  if (m.card.lostKeywords?.includes('doubleTeam')) {
    extra.push({ id: 'dt-used', label: `${keywordGlossary.doubleTeam?.icon ?? ''}分身 使用済み`, tone: 'info', card: { title: '分身（使用済み）', description: keywordGlossary.doubleTeam?.short ?? '' } });
  }
  for (const f of monsterForecasts(def, m)) extra.push({ id: `fc:${f.title}`, label: f.label, tone: f.tone, card: { title: f.title, description: f.description } });
  if ((flags.attacksPerTurn ?? 1) > 1 && m.attacksUsed > 0) {
    extra.push({ id: 'attacks', label: `攻撃${m.attacksUsed}/${flags.attacksPerTurn}`, tone: 'info', card: { title: 'このターンの攻撃回数', description: `${flags.attacksPerTurn}回まで攻撃できる` } });
  }
  return [...(m.sealed ? [] : kws), ...extra, ...statusChips(m.status, false)];
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
  floats,
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
}: MonsterTileProps) {
  const press = useLongPress(onDetail);
  const chips = monsterChips(def, m, flags, ownerTurns, attackNow);
  const label = def?.name ?? '？';
  // 護法（MTG 要素 ○ バッチB）：対象にすると増えるエナジーを「対象」の札に添える
  const state = targetable ? (extraCost > 0 ? `対象 護法+${extraCost}⚡` : '対象') : selected ? '選択中' : ready ? '攻撃できる' : blockLabel ?? null;
  return (
    <div
      className={cx(
        'mt',
        isMine ? 'mt--me' : 'mt--opp',
        `frame--${def?.rarity ?? 'common'}`,
        def && analyzeCard(def).isCurse && 'mt--curse',
        ready && 'is-ready',
        selected && 'is-selected',
        targetable && 'is-targetable',
        dropHover && 'is-drop-hover',
        dragging && 'is-dragging',
        m.sealed && 'is-sealed',
        m.stealth && 'is-stealth',
        hidden && 'is-hidden',
        dying && 'is-dying',
        flash,
      )}
      role="button"
      tabIndex={dying ? -1 : 0}
      aria-label={`${label}（攻撃力${attackOf(m, attackNow)}・体力${m.hp}・守備力${m.defense}）${state ? `・${state}` : ''}${targetable && extraCost > 0 ? `・護法でエナジー+${extraCost}` : ''}。押すと詳細`}
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
      {state && <span className={cx('mt__state', targetable && 'mt__state--target', targetable && extraCost > 0 && 'mt__state--ward', selected && 'mt__state--sel', ready && !targetable && !selected && 'mt__state--ready')}>{state}</span>}
      <span className="mt__icon" aria-hidden="true">
        {def?.icon ?? '？'}
      </span>
      <span className="mt__name">{label}</span>
      {def?.tribe && (
        <span className="mt__tribe" title={`種族：${TRIBE_LABEL[def.tribe]}`}>
          {TRIBE_LABEL[def.tribe]}
        </span>
      )}
      <span className="mt__stats" aria-hidden="true">
        <span className={cx('mt__stat', attackOf(m, attackNow) > m.attack ? 'is-buffed' : undefined)}>
          <small>⚔</small>
          {attackOf(m, attackNow)}
        </span>
        <span className={cx('mt__stat', m.hp < m.maxHp && 'is-hurt')}>
          <small>❤</small>
          {m.hp}
        </span>
        <span className={cx('mt__stat', m.defense === 0 && 'is-zero')}>
          <small>🛡</small>
          {m.defense}
        </span>
      </span>
      <Chips chips={chips} className="mt__chips" passive />
      {activate && !dying && <ActivateBtn a={activate} name={label} className="mt__act" />}
      <Floats items={floats} />
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
}

export function HandCard({ card, def, info, energy, playable, selected, dim, onClick, onDetail, onHover, onPointerDown, dragging, ghost, fresh }: HandCardProps) {
  const press = useLongPress(ghost ? undefined : onDetail);
  const ref = useRef<HTMLDivElement>(null);
  const cost = info.cost;
  const interactive = ghost
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
      <div ref={ref} className={cx('hc', 'hc--noise', selected && 'is-selected', dim && 'is-dim', playable && 'is-playable', dragCls, fresh && 'is-fresh')} aria-label={`ノイズ（除外にエナジー${cost}）。押すと詳細`} {...interactive}>
        <span className={cx('hc__cost', cost > energy && 'is-short')}>{cost}</span>
        <span className="hc__icon" aria-hidden="true">
          📛
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
    <span className={cx('hc__cost', discounted && 'is-down', taxed && 'is-up', short && 'is-short')}>
      {cost}
      {info.kicker && <small className="hc__kick">(+{info.kicker.extra})</small>}
    </span>
  );
  return (
    <div
      ref={ref}
      className={cx(
        'hc',
        `frame--${def.rarity}`,
        a.isCurse && 'hc--curse',
        playable && 'is-playable',
        selected && 'is-selected',
        dim && 'is-dim',
        short && 'is-short',
        dragCls,
        ghost && 'hc--ghost',
        fresh && 'is-fresh',
        iced && 'is-iced',
      )}
      aria-label={ghost ? undefined : `${def.name}（コスト${cost}）${grown > 0 ? `・成長+${grown}` : ''}${badge ? `・${badge}` : ''}${selected ? '・選択中' : ''}。押すと詳細${playable ? '、場へドラッグで使う' : ''}`}
      aria-pressed={!ghost && selected ? true : undefined}
      onMouseEnter={onHover ? () => onHover(ref.current) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      onFocus={onHover ? () => onHover(ref.current) : undefined}
      onBlur={onHover ? () => onHover(null) : undefined}
      {...interactive}
    >
      {ghost ? (
        <span className="hc__costwrap">{costEl}</span>
      ) : (
        <Popover content={{ title: `コスト ${cost}`, lines: costNotes }} placement="top" hover={false} className="hc__costwrap">
          {costEl}
        </Popover>
      )}
      {badge && <span className={cx('hc__badge', (quashed || iced) && 'hc__badge--quash')}>{badge}</span>}
      {abil && (
        <span className="hc__abil" aria-hidden="true" title={abil.title}>
          {abil.icon}
        </span>
      )}
      <span className="hc__icon" aria-hidden="true">
        {def.icon}
      </span>
      <span className="hc__name">{def.name}</span>
      <span className="hc__type">
        {CARD_TYPE_LABEL[a.cardType]}
        {card.copy ? '・コピー' : ''}
        {grown > 0 && <span className="hc__grow">成長+{grown}</span>}
      </span>
      <span className="hc__text">{summarizeCard(grownDef(def, grown))}</span>
      {def.stats && (
        <span className={cx('hc__stats', card.perm && 'is-perm')} aria-hidden="true">
          {/* 永久強化（MTG 要素 △ バッチA）は数値に足して表示 */}
          <span>⚔{def.stats.attack + (card.perm?.attack ?? 0)}</span>
          <span>❤{def.stats.hp + (card.perm?.hp ?? 0)}</span>
          <span>🛡{def.stats.defense}</span>
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
function useLongPress(onLong?: () => void) {
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
  const segs = tokenizeLog(text, names, preferId);
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
                const icon = logIcon(e.ev?.kind, e.kind, e.ev?.status ?? e.ev?.damageKind);
                const depth = Math.min(e.depth, 4);
                return (
                  <div
                    key={i}
                    className={cx('log__row', `log__row--${e.kind}`, e.ev && `log__row--ev-${e.ev.kind}`, depth > 0 && 'log__row--nested', e.private === me && 'log__row--private', rowTone(e, g.owner))}
                    style={{ '--depth': depth } as CSSProperties}
                  >
                    <span className="log__mark" aria-hidden="true">
                      {icon}
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
