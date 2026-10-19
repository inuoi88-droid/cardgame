/** 対戦画面の部品：プレイヤー情報、モンスター、手札、ログ、状態異常の札（説明はポップオーバー） */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { BALANCE, battle, CARD_TYPE_LABEL, analyzeCard, getEffect, TIMINGS, type CardDef } from '../../engine/index.ts';
import { Popover, type PopoverCard } from '../components/Popover.tsx';
import { glossary, keywordGlossary, type GlossaryEntry } from '../glossary.ts';
import { cx } from '../util.ts';
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

export function Chips({ chips, className }: { chips: Chip[]; className?: string }) {
  if (chips.length === 0) return null;
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
}

export function PlayerPanel({ ps, isMe, active, targetable, onClick, onPile, floats, flash, hpShown, roleLabel }: PlayerPanelProps) {
  const hp = hpShown ?? ps.hp;
  const pct = Math.max(0, Math.min(100, (hp / ps.maxHp) * 100));
  const next = [
    ps.next.energy ? `次のエナジー${ps.next.energy > 0 ? '+' : ''}${ps.next.energy}` : '',
    ps.next.draw ? `次のドロー${ps.next.draw > 0 ? '+' : ''}${ps.next.draw}` : '',
    ps.discount ? `次のカード−${ps.discount}` : '',
  ].filter(Boolean);
  const powerChips: Chip[] = ps.powers.map((pw) => ({
    id: pw.uid,
    label: `✦${pw.name}`,
    tone: 'power',
    card: { title: `✦ ${pw.name}（パワー）`, description: '場に残っている持続効果', lines: powerLines(pw) },
  }));
  return (
    <div
      className={cx('pp', isMe ? 'pp--me' : 'pp--opp', active && 'is-active', targetable && 'is-targetable', flash)}
      onClick={targetable ? onClick : undefined}
      onKeyDown={targetable ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      role={targetable ? 'button' : undefined}
      tabIndex={targetable ? 0 : undefined}
      aria-label={targetable ? `${ps.name}を対象にする` : undefined}
      data-fx={isMe ? 'me' : 'opp'}
    >
      <div className="pp__row">
        <span className="pp__role">{roleLabel}</span>
        <b className="pp__name">{ps.name}</b>
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
        <button type="button" className="pile pile--btn" onClick={(e) => (e.stopPropagation(), onPile('discard'))} aria-label={`捨て札${ps.discard.length}枚を見る`}>
          🗑{ps.discard.length}
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
        <Chips chips={[...statusChips(ps.status, true), ...powerChips]} />
      </div>
      <Floats items={floats} />
    </div>
  );
}

function powerLines(pw: battle.PowerInst): ReactNode[] {
  const effects = pw.effects.filter((x) => !x.removed).map((x) => `${TIMINGS[x.effect.timing]?.label ?? ''}：${getEffect(x.effect.id)?.name ?? x.effect.id}`);
  return [...effects, ...pw.drawbacks.map((d) => `☠ デメリット（${d.timing ? TIMINGS[d.timing].label : ''}）`)];
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
  onClick: () => void;
  /** 長押し（スマホ）で詳細 */
  onDetail?: () => void;
  floats?: Float[];
  flash?: string;
  /** まだ出現の演出をしていない（見えない） */
  hidden?: boolean;
  /** 破壊されて消えていく途中 */
  dying?: boolean;
  isMine: boolean;
}

export function MonsterTile({ m, def, ready, blockLabel, selected, targetable, flags, onClick, onDetail, floats, flash, hidden, dying, isMine }: MonsterTileProps) {
  const press = useLongPress(onDetail);
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
  for (const f of monsterForecasts(def, m)) extra.push({ id: `fc:${f.title}`, label: f.label, tone: f.tone, card: { title: f.title, description: f.description } });
  if ((flags.attacksPerTurn ?? 1) > 1 && m.attacksUsed > 0) {
    extra.push({ id: 'attacks', label: `攻撃${m.attacksUsed}/${flags.attacksPerTurn}`, tone: 'info', card: { title: 'このターンの攻撃回数', description: `${flags.attacksPerTurn}回まで攻撃できる` } });
  }
  const chips = [...(m.sealed ? [] : kws), ...extra, ...statusChips(m.status, false)];
  const label = def?.name ?? '？';
  const state = targetable ? '対象' : selected ? '選択中' : ready ? '攻撃できる' : blockLabel ?? null;
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
        m.sealed && 'is-sealed',
        m.stealth && 'is-stealth',
        hidden && 'is-hidden',
        dying && 'is-dying',
        flash,
      )}
      role="button"
      tabIndex={dying ? -1 : 0}
      aria-label={`${label}（攻撃力${m.attack}・体力${m.hp}・守備力${m.defense}）${state ? `・${state}` : ''}`}
      aria-pressed={selected || undefined}
      data-fx={m.uid}
      onClick={() => {
        if (press.consumed()) return;
        onClick();
      }}
      onKeyDown={(e) => handleKey(e, onClick)}
      {...press.handlers}
    >
      {state && <span className={cx('mt__state', targetable && 'mt__state--target', selected && 'mt__state--sel', ready && !targetable && !selected && 'mt__state--ready')}>{state}</span>}
      <span className="mt__icon" aria-hidden="true">
        {def?.icon ?? '？'}
      </span>
      <span className="mt__name">{label}</span>
      <span className="mt__stats" aria-hidden="true">
        <span className="mt__stat">
          <small>⚔</small>
          {m.attack}
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
      <Chips chips={chips} className="mt__chips" />
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
  onClick: () => void;
  onDetail: () => void;
  onHover?: (el: HTMLElement | null) => void;
}

export function HandCard({ card, def, info, energy, playable, selected, dim, onClick, onDetail, onHover }: HandCardProps) {
  const press = useLongPress(onDetail);
  const ref = useRef<HTMLDivElement>(null);
  const cost = info.cost;
  if (!def) {
    return (
      <div
        ref={ref}
        className={cx('hc', 'hc--noise', selected && 'is-selected', dim && 'is-dim')}
        role="button"
        tabIndex={0}
        aria-label={`ノイズ（除外にエナジー${cost}）`}
        onClick={onClick}
        onKeyDown={(e) => handleKey(e, onClick)}
      >
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
  const warn = info.warnings[0];
  const badge = warn ? (battle.isPowerCapWarning(warn) ? 'パワー入替' : warn.startsWith('条件') ? '条件未達' : '対象なし') : null;
  const costNotes = [
    short ? `エナジーが足りません（必要${cost}・残り${energy}）` : `必要なエナジー ${cost}（残り${energy}）`,
    discounted ? `軽減で元のコスト${def.cost}より安い` : '',
    taxed ? `凍結で元のコスト${def.cost}より+${cost - def.cost}` : '',
  ].filter(Boolean);
  return (
    <div
      ref={ref}
      className={cx('hc', `frame--${def.rarity}`, a.isCurse && 'hc--curse', playable && 'is-playable', selected && 'is-selected', dim && 'is-dim', short && 'is-short')}
      role="button"
      tabIndex={0}
      aria-label={`${def.name}（コスト${cost}）${badge ? `・${badge}` : ''}${selected ? '・選択中' : ''}`}
      aria-pressed={selected || undefined}
      onClick={() => {
        if (press.consumed()) return;
        onClick();
      }}
      onKeyDown={(e) => handleKey(e, onClick)}
      onMouseEnter={onHover ? () => onHover(ref.current) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      onFocus={onHover ? () => onHover(ref.current) : undefined}
      onBlur={onHover ? () => onHover(null) : undefined}
      {...press.handlers}
    >
      <Popover content={{ title: `コスト ${cost}`, lines: costNotes }} placement="top" hover={false} className="hc__costwrap">
        <span className={cx('hc__cost', discounted && 'is-down', taxed && 'is-up', short && 'is-short')}>{cost}</span>
      </Popover>
      {badge && <span className="hc__badge">{badge}</span>}
      <span className="hc__icon" aria-hidden="true">
        {def.icon}
      </span>
      <span className="hc__name">{def.name}</span>
      <span className="hc__type">
        {CARD_TYPE_LABEL[a.cardType]}
        {card.copy ? '・コピー' : ''}
      </span>
      <span className="hc__text">{summarizeCard(def)}</span>
      {def.stats && (
        <span className="hc__stats" aria-hidden="true">
          <span>⚔{def.stats.attack}</span>
          <span>❤{def.stats.hp}</span>
          <span>🛡{def.stats.defense}</span>
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 入力の小道具

function handleKey(e: KeyboardEvent, action: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    action();
  }
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
  const handlers = onLong
    ? {
        onPointerDown: (e: PointerEvent) => {
          if (e.button !== 0) return;
          fired.current = false;
          start.current = { x: e.clientX, y: e.clientY };
          clear();
          timer.current = setTimeout(() => {
            fired.current = true;
            onLong();
          }, 450);
        },
        onPointerMove: (e: PointerEvent) => {
          if (!start.current) return;
          if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
        },
        onPointerUp: clear,
        onPointerCancel: clear,
        onPointerLeave: clear,
        onContextMenu: (e: { preventDefault(): void }) => e.preventDefault(),
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

export function LogPanel({ log, me, compact = false }: { log: battle.LogEntry[]; me: PlayerId; compact?: boolean }) {
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
              g.rows.map(({ e, i }) => (
                <div
                  key={i}
                  className={cx('log__row', `log__row--${e.kind}`, e.private === me && 'log__row--private', rowTone(e, g.owner))}
                  style={{ paddingLeft: `${Math.min(e.depth, 4) * 12 + 10}px` }}
                >
                  {e.ev?.kind === 'damage' || e.ev?.kind === 'retaliate' ? <span className="log__mark">💥</span> : e.ev?.kind === 'heal' ? <span className="log__mark">✚</span> : null}
                  {e.text}
                </div>
              ))}
          </section>
        );
      })}
    </div>
  );
}
