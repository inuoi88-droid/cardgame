/** 対戦画面の部品：プレイヤー情報、モンスター、手札、ログ、状態異常の表示 */
import { useEffect, useRef } from 'react';
import { battle, CARD_TYPE_LABEL, analyzeCard, getEffect, TIMINGS, type CardDef } from '../../engine/index.ts';
import { cx } from '../util.ts';

type Statuses = battle.Statuses;

export interface Chip {
  label: string;
  tone: 'bad' | 'good' | 'info';
  title: string;
}

/** 状態異常・持続効果を小さな札にする */
export function statusChips(s: Statuses): Chip[] {
  const out: Chip[] = [];
  const add = (cond: unknown, label: string, tone: Chip['tone'], title: string) => cond && out.push({ label, tone, title });
  add(s.poison, `毒${s.poison}`, 'bad', 'ターン開始時に毒の数だけダメージ（シールド無視）、その後1減る');
  add(s.burn, `やけど${s.burn}T`, 'bad', 'ターン終了時に2ダメージ、回復量半分');
  add(s.weak, `弱体${s.weak}T`, 'bad', '与えるダメージ−25%');
  add(s.vulnerable, `脆弱${s.vulnerable}T`, 'bad', '受けるダメージ+50%');
  add(s.bleed, `出血${s.bleed}`, 'bad', '攻撃を受けるたびに追加ダメージ');
  add(s.freezePending, '凍結（次）', 'bad', '次のターン：モンスターは攻撃できない／最初のカードのコスト+1');
  add(s.freezeActive, '凍結中', 'bad', 'このターン：モンスターは攻撃できない／最初のカードのコスト+1');
  add(s.confusePending, '混乱（次）', 'bad', '次のターン開始時、ランダムな相手を自動で攻撃');
  add(s.confuseActive, '混乱中', 'bad', 'このターンは自動で攻撃した');
  add(s.strength, `筋力${s.strength}`, 'good', 'アタックのダメージ+');
  add(s.focus, `気合${s.focus}`, 'good', 'このターン、アタックのダメージ+');
  add(s.counter, `反撃${s.counter}`, 'good', '攻撃を受けたら返す（次の自分のターン開始時まで）');
  add(s.nullify, `無効化${s.nullify}`, 'good', '次に受けるダメージを0にする（毒・やけどは貫通）');
  add(s.regen, `再生${s.regen}`, 'good', 'ターン開始時に回復し、1減る');
  return out;
}

export function Chips({ chips }: { chips: Chip[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="chips-row">
      {chips.map((c, i) => (
        <span key={i} className={`st st--${c.tone}`} title={c.title}>
          {c.label}
        </span>
      ))}
    </div>
  );
}

interface PlayerPanelProps {
  ps: battle.PlayerState;
  isMe: boolean;
  active: boolean;
  targetable: boolean;
  onClick: () => void;
  onPile: (pile: 'discard' | 'exile') => void;
}

export function PlayerPanel({ ps, isMe, active, targetable, onClick, onPile }: PlayerPanelProps) {
  const pct = Math.max(0, Math.min(100, (ps.hp / ps.maxHp) * 100));
  const next = [
    ps.next.energy ? `次のエナジー${ps.next.energy > 0 ? '+' : ''}${ps.next.energy}` : '',
    ps.next.draw ? `次のドロー${ps.next.draw > 0 ? '+' : ''}${ps.next.draw}` : '',
    ps.discount ? `次のカード−${ps.discount}` : '',
  ].filter(Boolean);
  return (
    <div
      className={cx('pp', isMe ? 'pp--me' : 'pp--opp', active && 'is-active', targetable && 'is-targetable')}
      onClick={targetable ? onClick : undefined}
      role={targetable ? 'button' : undefined}
      aria-label={targetable ? `${ps.name}を対象にする` : undefined}
    >
      <div className="pp__top">
        <b className="pp__name">{ps.name}</b>
        <span className="pp__hpnum">
          ❤ {ps.hp}
          <small>/{ps.maxHp}</small>
        </span>
        {ps.shield > 0 && <span className="pp__shield">🛡{ps.shield}</span>}
        <span className="pp__energy" title="エナジー">
          ⚡{ps.energy}
        </span>
      </div>
      <div className="hpbar">
        <div className="hpbar__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="pp__meta">
        <span>山札{ps.deck.length}</span>
        <button type="button" className="linkish" onClick={(e) => (e.stopPropagation(), onPile('discard'))}>
          捨て札{ps.discard.length}
        </button>
        <button type="button" className="linkish" onClick={(e) => (e.stopPropagation(), onPile('exile'))}>
          除外{ps.exile.length}
        </button>
        {!isMe && <span>手札{ps.hand.length}</span>}
        {next.map((t) => (
          <span key={t} className="pp__next">
            {t}
          </span>
        ))}
      </div>
      <Chips chips={statusChips(ps.status)} />
      {ps.powers.length > 0 && (
        <div className="chips-row">
          {ps.powers.map((pw) => (
            <span key={pw.uid} className="st st--power" title={powerText(pw)}>
              ✦{pw.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function powerText(pw: battle.PowerInst): string {
  const effects = pw.effects
    .filter((x) => !x.removed)
    .map((x) => `${TIMINGS[x.effect.timing]?.label ?? ''}：${getEffect(x.effect.id)?.name ?? x.effect.id}`);
  return [...effects, ...pw.drawbacks.map((d) => `デメリット（${d.timing ? TIMINGS[d.timing].label : ''}）`)].join('\n');
}

interface MonsterTileProps {
  m: battle.Monster;
  def: CardDef | undefined;
  ready: boolean;
  selected: boolean;
  targetable: boolean;
  flags: ReturnType<typeof battle.keywordFlags>;
  onClick: () => void;
}

export function MonsterTile({ m, def, ready, selected, targetable, flags, onClick }: MonsterTileProps) {
  const kws = def?.keywords ?? [];
  return (
    <button
      type="button"
      className={cx(
        'mt',
        `frame--${def?.rarity ?? 'common'}`,
        def && analyzeCard(def).isCurse && 'mt--curse',
        ready && 'is-ready',
        selected && 'is-selected',
        targetable && 'is-targetable',
        m.sealed && 'is-sealed',
        m.stealth && 'is-stealth',
      )}
      onClick={onClick}
      title={def?.name}
    >
      <span className="mt__icon">{def?.icon ?? '？'}</span>
      <span className="mt__name">{def?.name ?? '？'}</span>
      <span className="mt__stats">
        <span>⚔{m.attack}</span>
        <span>❤{m.hp}</span>
        {m.defense > 0 && <span>🛡{m.defense}</span>}
      </span>
      <span className="mt__tags">
        {m.sealed ? (
          <span className="st st--bad">封印</span>
        ) : (
          kws.map((k) => (
            <span key={k.id} className="st st--kw">
              {kwShort(k.id)}
            </span>
          ))
        )}
        {m.stealth && <span className="st st--info">隠密</span>}
        {m.betraying && <span className="st st--bad">裏切り</span>}
        {(flags.attacksPerTurn ?? 1) > 1 && m.attacksUsed > 0 && <span className="st st--info">攻撃{m.attacksUsed}回</span>}
      </span>
      <Chips chips={statusChips(m.status)} />
    </button>
  );
}

const KW_SHORT: Record<string, string> = {
  haste: '速攻',
  taunt: '挑発',
  flying: '飛行',
  trample: '貫通',
  doubleAttack: '二回',
  stealth: '隠密',
  undying: '不屈',
  selfRepair: '修復',
};
const kwShort = (id: string) => KW_SHORT[id] ?? id;

interface HandCardProps {
  card: battle.CardInst;
  def: CardDef | undefined;
  cost: number;
  playable: boolean;
  selected: boolean;
  onClick: () => void;
}

export function HandCard({ card, def, cost, playable, selected, onClick }: HandCardProps) {
  if (!def) {
    return (
      <button type="button" className={cx('hc', 'hc--noise', selected && 'is-selected')} onClick={onClick}>
        <span className="hc__cost">{cost}</span>
        <span className="hc__icon">📛</span>
        <span className="hc__name">ノイズ</span>
        <span className="hc__type">除外にエナジー{cost}</span>
      </button>
    );
  }
  const a = analyzeCard(def);
  const discounted = cost < def.cost;
  const taxed = cost > def.cost;
  return (
    <button
      type="button"
      className={cx('hc', `frame--${def.rarity}`, a.isCurse && 'hc--curse', playable && 'is-playable', selected && 'is-selected')}
      onClick={onClick}
    >
      <span className={cx('hc__cost', discounted && 'is-down', taxed && 'is-up')}>{cost}</span>
      <span className="hc__icon">{def.icon}</span>
      <span className="hc__name">{def.name}</span>
      <span className="hc__type">
        {CARD_TYPE_LABEL[a.cardType]}
        {card.copy ? '（コピー）' : ''}
      </span>
      <span className="hc__text">{[...a.text.keywords.map((k) => k.name), ...a.text.effects, ...a.text.drawbacks.map((d) => `☠${d}`)].join(' ')}</span>
      {def.stats && (
        <span className="hc__stats">
          ⚔{def.stats.attack} ❤{def.stats.hp}
          {def.stats.defense ? ` 🛡${def.stats.defense}` : ''}
        </span>
      )}
    </button>
  );
}

export function LogPanel({ log, me }: { log: battle.LogEntry[]; me: battle.PlayerId }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);
  return (
    <div className="log" ref={ref}>
      {log.map((e, i) => (
        <div
          key={i}
          className={cx('log__row', `log__row--${e.kind}`, e.private === me && 'log__row--private')}
          style={{ paddingLeft: `${e.depth * 14 + 6}px` }}
        >
          {e.text}
        </div>
      ))}
    </div>
  );
}
