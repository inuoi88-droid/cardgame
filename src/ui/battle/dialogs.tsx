/** 対戦画面のダイアログ：マリガン、選択、結果。カードは読める大きさのリストで出し、🔍（一覧ではカードそのもの）で詳細を見られる */
import { useState, type ReactNode } from 'react';
import { analyzeCard, BALANCE, battle, CARD_TYPE_LABEL, describeEffect, getDrawback, getEffect, type CardDef } from '../../engine/index.ts';
import { CardArt, NOISE_ART } from '../components/CardArt.tsx';
import { Modal, Stepper } from '../components/controls.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { cx } from '../util.ts';
import { iconText } from '../icons/ref.ts';
import { CardDetailModal } from './CardDetail.tsx';
import { summarizeResult } from './summary.ts';

type GameState = battle.GameState;
type PlayerId = battle.PlayerId;

/** カード1枚の読める行（名前・コスト・種類・効果の全文）。選択はチェック、「全体」で大きいカード */
export function CardRow({
  def,
  label,
  picked,
  mark,
  onToggle,
  onZoom,
}: {
  def: CardDef | undefined;
  label?: string;
  picked: boolean;
  /** 選択中に出す文言（「戻す」「選択」） */
  mark: string;
  onToggle: () => void;
  onZoom: (def: CardDef) => void;
}) {
  if (!def) {
    return (
      <div className={cx('crow', picked && 'is-picked')}>
        <button type="button" className="crow__main" onClick={onToggle} aria-pressed={picked}>
          <span className="crow__icon">
            <CardArt icon={NOISE_ART} curse />
          </span>
          <span className="crow__text">
            <b>{label ?? 'ノイズ'}</b>
          </span>
          <span className={cx('crow__mark', picked && 'is-on')}>{picked ? mark : ''}</span>
        </button>
      </div>
    );
  }
  const a = analyzeCard(def);
  return (
    <div className={cx('crow', picked && 'is-picked', a.isCurse && 'crow--curse')}>
      <button type="button" className="crow__main" onClick={onToggle} aria-pressed={picked}>
        <span className="crow__icon">
          <CardArt icon={def.icon} rarity={def.rarity} cardType={a.cardType} curse={a.isCurse} />
        </span>
        <span className="crow__text">
          <span className="crow__head">
            <span className="crow__cost">{def.cost}</span>
            <b>{def.name}</b>
            <small className="crow__type">{CARD_TYPE_LABEL[a.cardType]}</small>
            {/* スマホは効果を短く切るので、ステータスは見出しの行に */}
            {def.stats && (
              <small className="crow__hstats" aria-hidden="true">
                ⚔{def.stats.attack} ❤{def.stats.hp}
                {def.stats.defense > 0 ? ` 🛡${def.stats.defense}` : ''}
              </small>
            )}
          </span>
          <span className="crow__body">
            {/* スマホは種類を本文の頭に（見出しの行は名前とステータスだけにして1行に収める） */}
            <span className="crow__btype">{CARD_TYPE_LABEL[a.cardType]} </span>
            {a.text.keywords.map((k) => k.name).join('・')}
            {a.text.keywords.length > 0 && ' '}
            {a.text.effects.join('')}
            {a.text.drawbacks.map((d) => `☠${d}`).join('')}
            {a.text.abilities.map((x) => `✦${x.name}`).join('')}
            {def.stats && (
              <span className="crow__stats">
                ⚔{def.stats.attack} ❤{def.stats.hp} 🛡{def.stats.defense}
              </span>
            )}
          </span>
        </span>
        <span className={cx('crow__mark', picked && 'is-on')} aria-hidden="true">
          {picked ? mark : '○'}
        </span>
      </button>
      <button type="button" className="btn btn--ghost btn--icon crow__zoom" onClick={() => onZoom(def)} aria-label={`${def.name}の詳細`}>
        🔍
      </button>
    </div>
  );
}

/** カードの詳細を見る小窓（ダイアログの上に重ねる。説明文・キーワードの説明つき） */
export function ZoomModal({ def, onClose }: { def: CardDef | null; onClose: () => void }) {
  return <CardDetailModal def={def} onClose={onClose} />;
}

// ---------------------------------------------------------------- マリガン

export function MulliganDialog({ view, me, onAction, timeLeft }: { view: GameState; me: PlayerId; onAction: (a: battle.Action) => void; timeLeft?: ReactNode }) {
  const mine = view.players[me];
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState<CardDef | null>(null);
  const nextSize = battle.nextFullMulliganSize(view, me);
  const afterNext = nextSize - 1;
  const first = view.first === me;
  const toggle = (uid: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(uid)) n.delete(uid);
      else n.add(uid);
      return n;
    });
  const all = picked.size >= mine.hand.length;
  return (
    <>
      <Modal title={`最初の手札 — あなたは${first ? '先攻' : '後攻'}`} onClose={() => undefined} closable={false}>
        <div className="dlg__top">
          <span className={cx('badge', first ? 'badge--mine' : 'badge--enemy')}>{first ? '先攻（1ターン目はエナジー−1）' : '後攻'}</span>
          {timeLeft && <span className="dlg__time">{timeLeft}</span>}
        </div>
        <p className="hint dlg__lead">このまま始めるか、引き直すカードを選んでください。一部だけの引き直しは1回で手札が決まります。</p>
        <div className="crow-list">
          {mine.hand.map((c) => (
            <CardRow key={c.uid} def={view.cards[c.cardId]} picked={picked.has(c.uid)} mark="戻す" onToggle={() => toggle(c.uid)} onZoom={setZoom} />
          ))}
        </div>
        <div className="btn-row modal__foot dlg__foot">
          <button type="button" className="btn btn--primary" onClick={() => onAction({ type: 'mulligan', player: me, mode: 'keep' })}>
            この手札で始める
          </button>
          {picked.size > 0 && !all && (
            <button type="button" className="btn" onClick={() => onAction({ type: 'mulligan', player: me, mode: 'partial', cardUids: [...picked] })}>
              選んだ{picked.size}枚を引き直す
            </button>
          )}
          <button type="button" className="btn" disabled={nextSize < BALANCE.battle.mulliganMinHand} onClick={() => onAction({ type: 'mulligan', player: me, mode: 'all' })}>
            全部引き直す（{nextSize}枚{afterNext >= BALANCE.battle.mulliganMinHand ? `・次は${afterNext}枚` : ''}）
          </button>
        </div>
      </Modal>
      <ZoomModal def={zoom} onClose={() => setZoom(null)} />
    </>
  );
}

// ---------------------------------------------------------------- 選択

/** 選択ダイアログの見出し：何の選択か（効果・デメリットの名前、手札整理、保持） */
function choiceTitle(p: NonNullable<GameState['pending']>): string {
  const count = p.max === 1 ? '1つ選ぶ' : p.min === 0 ? `${p.max}つまで選ぶ` : p.min === p.max ? `${p.max}つ選ぶ` : `${p.min}〜${p.max}つ選ぶ`;
  switch (p.step.t) {
    case 'retain':
      return '手札を残す（保持）';
    case 'discardChoice':
      return `手札を捨てる（${p.max}枚）`;
    case 'drawback':
      return `${getDrawback(p.step.drawback.id)?.name ?? 'デメリット'}：${count}`;
    case 'effect':
      return `${getEffect(p.step.effect.id)?.name ?? '効果'}：${count}`;
    // MTG 要素 △ バッチB
    case 'villainChoice':
      return '最悪の二択：どちらかを選ぶ';
    case 'devourChoice':
      return `貪食：${count}`;
    default:
      return count;
  }
}

export function ChoiceDialog({ view, me, onAction, timeLeft }: { view: GameState; me: PlayerId; onAction: (a: battle.Action) => void; timeLeft?: ReactNode }) {
  const p = view.pending!;
  const [picked, setPicked] = useState<string[]>([]);
  const [zoom, setZoom] = useState<CardDef | null>(null);
  const retain = p.step.t === 'retain';
  const toggle = (id: string) =>
    setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : p.max === 1 ? [id] : s.length < p.max ? [...s, id] : s));
  const title = choiceTitle(p);
  const canDecide = picked.length >= p.min && picked.length <= p.max;
  return (
    <>
      <Modal title={title} onClose={() => undefined} closable={false}>
        <div className="dlg__top">
          {(() => {
            const u = p.options.length > 0 && p.options.every((o) => o.cardId) ? '枚' : 'つ';
            return <span className="badge">{p.min === 0 ? `0〜${p.max}${u}` : p.min === p.max ? `${p.max}${u}` : `${p.min}〜${p.max}${u}`}</span>;
          })()}
          {timeLeft && <span className="dlg__time">{timeLeft}</span>}
        </div>
        <p>{p.prompt}</p>
        {/* 最悪の二択（MTG 要素 △ バッチB）：カードではなくモードを選ぶ */}
        {p.step.t === 'villainChoice' ? (
          <div className="mode-list" role="list">
            {p.options.map((o) => {
              const [label, ...rest] = o.label.split('：');
              return (
                <button key={o.id} type="button" role="listitem" className={cx('mode-opt', picked.includes(o.id) && 'is-on')} aria-pressed={picked.includes(o.id)} onClick={() => toggle(o.id)}>
                  <span className="mode-opt__label" aria-hidden="true">
                    {label}
                  </span>
                  <span className="mode-opt__body">
                    <span className="mode-opt__name">モード{label}</span>
                    <span className="mode-opt__text">{rest.join('：')}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="crow-list">
            {p.options.map((o) => (
              <CardRow key={o.id} def={o.cardId ? view.cards[o.cardId] : undefined} label={o.label} picked={picked.includes(o.id)} mark="選択" onToggle={() => toggle(o.id)} onZoom={setZoom} />
            ))}
            {p.options.length === 0 && <p className="hint">選べるものがありません</p>}
          </div>
        )}
        <div className="btn-row modal__foot dlg__foot">
          {p.min === 0 && picked.length === 0 ? (
            <button type="button" className="btn btn--primary" onClick={() => onAction({ type: 'choose', player: me, picks: [] })}>
              {retain ? '残さない' : '選ばずに進む'}
            </button>
          ) : (
            <button type="button" className="btn btn--primary" disabled={!canDecide} onClick={() => onAction({ type: 'choose', player: me, picks: picked })}>
              {picked.length === 0 ? (p.options.every((o) => o.cardId) ? 'カードを選んでください' : '選んでください') : `決定（${picked.length}${p.max > 1 ? `/${p.max}` : ''}）`}
            </button>
          )}
          {p.min === 0 && picked.length > 0 && (
            <button type="button" className="btn" onClick={() => setPicked([])}>
              選び直す
            </button>
          )}
        </div>
      </Modal>
      <ZoomModal def={zoom} onClose={() => setZoom(null)} />
    </>
  );
}

// ---------------------------------------------------------------- 結果

/** 結果の見出しと理由（結果ダイアログと、ダイアログを閉じたあとの操作バーで共用） */
export function resultTexts(view: GameState, me: PlayerId): { title: string; why: string; won: boolean; draw: boolean } {
  const result = view.result!;
  const won = result.winner === me;
  const draw = result.winner === null;
  const title = draw ? '引き分け' : won ? 'あなたの勝ち！' : 'あなたの負け…';
  const why =
    result.reason === 'turnLimit'
      ? `両者が${BALANCE.battle.maxTurns}ターンを終えました`
      : result.reason === 'timeout'
        ? `${won ? '相手が' : ''}${BALANCE.online.timeoutLoseCount}回続けて時間切れになりました`
        : result.reason === 'concede'
          ? won
            ? '相手が降参しました'
            : '降参しました'
          : result.reason === 'altWin'
            ? won
              ? '特殊勝利の目標を達成しました'
              : '相手が特殊勝利の目標を達成しました'
          : won
            ? '相手のHPを0にしました'
            : 'HPが0になりました';
  return { title, why, won, draw };
}

export function ResultDialog({ view, me, onHide, children }: { view: GameState; me: PlayerId; onHide: () => void; children: ReactNode }) {
  const { title, why, won, draw } = resultTexts(view, me);
  const s = summarizeResult(view, me);
  return (
    <Modal title="対戦終了" onClose={onHide}>
      <div className={cx('result', won && 'result--won', !won && !draw && 'result--lost')}>
        <p className="result__title">{title}</p>
        <p className="result__why">{why}</p>
        <dl className="result__stats">
          <div>
            <dt>ターン</dt>
            <dd>
              あなた {s.myTurns}・相手 {s.oppTurns}
            </dd>
          </div>
          <div>
            <dt>与えたダメージ</dt>
            <dd>{s.dealt}</dd>
          </div>
          <div>
            <dt>受けたダメージ</dt>
            <dd>{s.taken}</dd>
          </div>
          {s.decisive && (
            <div>
              <dt>決め手</dt>
              <dd>{s.decisive}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="btn-row result__buttons">
        {children}
        <button type="button" className="btn" onClick={onHide}>
          盤面とログを見る
        </button>
      </div>
    </Modal>
  );
}

/**
 * モード選択のカード（MTG 要素 ○ バッチC2）：モードを選ぶシート。各モードの効果の文・コスト・使えない理由を出す。
 * 選べるのはエンジンの PlayInfo.modes が使えるとしたものだけ（双呪は「すべて」）。
 * 放題（MTG 要素 △ バッチB。combos がある）は複数選べる：選んだモードの組み合わせの情報（コスト・使えない理由）は combos から引く。
 * 段階のモードは追加のエナジー（surcharge）を「+1⚡」で出す
 */
export function ModeDialog({
  name,
  modes,
  combos,
  energy,
  onPick,
  onCancel,
}: {
  name: string;
  modes: battle.ModeInfo[];
  /** 放題：2つ以上のモードの組み合わせ（PlayInfo.modeCombos） */
  combos?: battle.ModeInfo[];
  energy: number;
  /** mode は1つ選んだとき、modes は放題で2つ以上選んだとき */
  onPick: (mode: number, modes?: number[]) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const multi = !!combos && combos.length > 0;
  const toggle = (m: number) => setPicked((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m].sort((a, b) => a - b)));
  const sel = picked.length === 1 ? modes.find((m) => m.mode === picked[0]) : picked.length > 1 ? combos?.find((c) => c.modes?.join() === picked.join()) : undefined;
  return (
    <Sheet open title={`「${name}」：${multi ? '次のうち好きな数を選ぶ' : '次のうち1つを選ぶ'}`} onClose={onCancel} desktop="modal">
      <p className="mode-sheet__lead">
        {multi ? '使うモードを選んでください（2つ目から追加のエナジー）。' : '使うモードを選んでください'}（残りのエナジー ⚡{energy}）。対象が要るモードは、このあと対象を選びます。
      </p>
      <div className="mode-list" role="list">
        {modes.map((m) => {
          const on = picked.includes(m.mode);
          return (
            <button
              key={m.mode}
              type="button"
              role="listitem"
              className={cx('mode-opt', m.mode === 0 && 'mode-opt--all', m.blocked && !multi && 'is-blocked', on && 'is-on')}
              disabled={!multi && !!m.blocked}
              aria-pressed={multi ? on : undefined}
              onClick={() => (multi ? toggle(m.mode) : onPick(m.mode))}
            >
              <span className="mode-opt__label" aria-hidden="true">
                {multi ? (on ? '✓' : m.label) : m.mode === 0 ? '全' : m.label}
              </span>
              <span className="mode-opt__body">
                <span className="mode-opt__name">
                  {m.mode === 0 ? 'すべてのモード（双呪）' : `モード${m.label}`}
                  {m.surcharge ? <span className="mode-opt__extra">追加+{m.surcharge}⚡</span> : null}
                </span>
                <span className="mode-opt__text">{m.text}</span>
                {!multi && m.blocked ? (
                  <span className="mode-opt__why">{m.blocked}</span>
                ) : (
                  !multi && m.warnings.length > 0 && <span className="mode-opt__warn">⚠ {m.warnings.join('／')}</span>
                )}
              </span>
              <span className="mode-opt__cost">⚡{m.cost}</span>
            </button>
          );
        })}
      </div>
      <div className="btn-row modal__foot dlg__foot">
        {multi && (
          <button type="button" className="btn btn--primary" disabled={!sel || !!sel.blocked} onClick={() => sel && onPick(picked[0]!, picked.length > 1 ? picked : undefined)}>
            {!sel ? 'モードを選んでください' : sel.blocked ? sel.blocked : `モード${sel.label}で使う（⚡${sel.cost}）`}
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          やめる
        </button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- 支払いのシート（MTG 要素 △ バッチB）

/**
 * 支払いの選択。キッカー・再活／回顧の捨てる手札・脱出の除外（○ バッチC1）と、追加の支払い・代わりの使い方・差し出す・払い方（△ バッチB）。
 * done は「シートで決めた」印（決めたあとはもうシートを出さない）
 */
export interface PayChoice {
  kick?: boolean;
  discardUid?: string;
  /** 脱出で除外する捨て札（捨て札から使うとき）か、探査で除外する捨て札（手札から使うとき） */
  exileUids?: string[];
  extra?: number;
  alt?: battle.AltPlay;
  sacrificeUid?: string;
  tapUids?: string[];
  pitchUid?: string;
  lifePay?: number;
  done?: boolean;
}

/** 支払いの選択を、行動の項目にする（決めていないものは省く） */
export function payFields(pay: PayChoice): Partial<Extract<battle.Action, { type: 'playCard' }>> {
  return {
    ...(pay.kick ? { kick: true } : {}),
    ...(pay.discardUid !== undefined ? { discardUid: pay.discardUid } : {}),
    ...(pay.exileUids !== undefined && pay.exileUids.length > 0 ? { exileUids: pay.exileUids } : {}),
    ...(pay.extra ? { extra: pay.extra } : {}),
    ...(pay.alt !== undefined ? { alt: pay.alt } : {}),
    ...(pay.sacrificeUid !== undefined ? { sacrificeUid: pay.sacrificeUid } : {}),
    ...(pay.tapUids !== undefined && pay.tapUids.length > 0 ? { tapUids: pay.tapUids } : {}),
    ...(pay.pitchUid !== undefined ? { pitchUid: pay.pitchUid } : {}),
    ...(pay.lifePay ? { lifePay: pay.lifePay } : {}),
  };
}

/** このカードを使うとき、支払いのシートで選ぶものがあるか（エンジンの PlayInfo から） */
export function needsPaySheet(info: battle.PlayInfo, energy: number): boolean {
  if (info.pay) return true;
  if (info.fromDiscard?.discardChoices || info.fromDiscard?.exileCount) return true;
  return !!info.kicker && info.kicker.payable && energy >= 0;
}

/** 対象の候補（選んだ使い方・モードのもの） */
type TargetLike = { enemyTargets: battle.TargetRef[]; allyTargets: string[] };

const EXTRA_LABEL: Record<battle.ExtraPayKind, (unit: number) => string> = {
  cleave: (k) => `切除して条件を無視する（+${k}⚡）`,
  strive: (k) => `相手モンスターを1体追加（1回+${k}⚡）`,
  squad: (k) => `コピーを1体追加（1回+${k}⚡）`,
};

/**
 * 支払いのシート（MTG 要素 △ バッチB。○ バッチC1 の PayDialog・KickerDialog をまとめた）。カードを落としたあと、選ぶものがあるときだけ出る。
 * いちばん上の「そのまま使う」は何も選ばずに使う（再活・脱出の必須の支払いは既定のまま）。合計のコストと使えない理由はエンジン
 * （costBreakdown・validatePlay）がその場で計算する。chosen が足りない（超過以外で対象がまだ）なら、決めたあと対象を選ぶ
 */
export function PaySheet({
  view,
  me,
  card,
  def,
  info,
  chosen,
  mode,
  modes,
  initial,
  onDone,
  onCancel,
}: {
  view: GameState;
  me: PlayerId;
  card: battle.CardInst;
  def: CardDef;
  info: battle.PlayInfo;
  chosen: battle.Chosen;
  mode?: number;
  modes?: number[];
  initial: PayChoice;
  onDone: (pay: PayChoice) => void;
  onCancel: () => void;
}) {
  const mine = view.players[me];
  const pi = info.pay;
  const fd = info.fromDiscard;
  const fromDiscard = info.from === 'discard';
  // 再活・回顧の捨てる手札、脱出の除外は既定を選んだ状態で始める
  const base: PayChoice = {
    ...(fd?.discardDefault ? { discardUid: fd.discardDefault } : {}),
    ...(fd?.exileDefaults && fd.exileCount ? { exileUids: fd.exileDefaults } : {}),
  };
  const [pay, setPay] = useState<PayChoice>({ ...base, ...initial });
  const [zoom, setZoom] = useState<CardDef | null>(null);
  const set = (patch: Partial<PayChoice>) => setPay((p) => ({ ...p, ...patch }));

  // 選んだ使い方・モードの対象。超過は対象を選ばない
  const alt = pay.alt ? pi?.alts?.find((x) => x.alt === pay.alt) : undefined;
  const modeInfo = modes ? info.modeCombos?.find((c) => c.modes?.join() === modes.join()) : mode !== undefined ? info.modes?.find((m) => m.mode === mode) : undefined;
  const tgt: TargetLike = alt ?? modeInfo ?? info;
  const pending = (tgt.enemyTargets.length > 0 && !chosen.enemy) || (tgt.allyTargets.length > 0 && !chosen.ally);
  const check = (p: PayChoice) => {
    const opts = { ...(fromDiscard ? { from: 'discard' as const } : info.from === 'waiting' ? { from: 'waiting' as const } : {}), ...(mode !== undefined ? { mode } : {}), ...(modes ? { modes } : {}), ...payFields(p) };
    const c: battle.Chosen = p.alt === 'overload' ? {} : chosen;
    const err = battle.validatePlay(view, me, card.uid, pending ? undefined : c, opts);
    const targetErr = err === '対象を選んでください' || err === '自分のモンスターを選んでください';
    const b = battle.costBreakdown(view, me, card, battle.costCtxOf(opts, pending ? {} : c));
    return { error: pending && targetErr ? null : err, b };
  };
  const now = check(pay);
  const plain = check(base);
  const label = (uid: string): string => {
    const m = mine.board.find((x) => x.uid === uid);
    if (m) {
      const d = view.cards[m.card.cardId];
      return `${iconText(d?.icon)}${d?.name ?? '？'} ⚔${battle.effectiveAttack(view, m)} ❤${m.hp}`;
    }
    const pw = mine.powers.find((x) => x.uid === uid);
    return pw ? `✦${pw.name}（パワー）` : '？';
  };
  const toggleIn = (list: string[] | undefined, uid: string, max: number): string[] => {
    const l = list ?? [];
    if (l.includes(uid)) return l.filter((x) => x !== uid);
    if (max === 1) return [uid];
    return l.length < max ? [...l, uid] : l;
  };
  const delveMode = !fromDiscard && !!pi?.delve;
  const total = now.b.total;
  const hp = now.b.hp ?? 0;
  const notes = battle.costNotes(now.b);
  const kicked = def.effects.filter((e) => e.condition === 'kicked').map((e) => describeEffect(e, def));
  return (
    <>
      <Sheet open title={`「${def.name}」の使い方と支払い`} onClose={onCancel} desktop="modal">
        <div className="pay-top">
          <button type="button" className="btn btn--primary" disabled={!!plain.error} onClick={() => onDone({ ...base, done: true })} title={plain.error ?? undefined}>
            そのまま使う（⚡{plain.b.total}）
          </button>
          {plain.error && <span className="pay-why">{plain.error}</span>}
        </div>
        <div className="pay-sheet">
          {pi?.alts && pi.alts.length > 0 && (
            <section className="pay-sec" aria-label="使い方">
              <h3>使い方</h3>
              <div className="pay-opts">
                <button type="button" className={cx('pay-opt', !pay.alt && 'is-on')} aria-pressed={!pay.alt} onClick={() => set({ alt: undefined })}>
                  <b>ふつうに使う</b>
                  <span className="pay-opt__cost">⚡{info.cost}</span>
                </button>
                {pi.alts.map((x) => (
                  <button
                    key={x.alt}
                    type="button"
                    className={cx('pay-opt', pay.alt === x.alt && 'is-on', x.blocked && 'is-blocked')}
                    aria-pressed={pay.alt === x.alt}
                    disabled={!!x.blocked}
                    onClick={() => set({ alt: x.alt, extra: undefined })}
                  >
                    <b>{x.name}</b>
                    <small>{x.note}</small>
                    <span className="pay-opt__cost">⚡{x.cost}</span>
                    {x.blocked && <small className="pay-why">{x.blocked}</small>}
                  </button>
                ))}
              </div>
            </section>
          )}
          {pi?.extra && (
            <section className="pay-sec" aria-label="追加の支払い">
              <h3>{pi.extra.name}</h3>
              {pi.extra.max === 1 ? (
                <label className="check">
                  <input type="checkbox" checked={(pay.extra ?? 0) > 0} onChange={(e) => set({ extra: e.target.checked ? 1 : undefined })} />
                  {EXTRA_LABEL[pi.extra.kind](pi.extra.unit)}
                </label>
              ) : (
                <Stepper label={EXTRA_LABEL[pi.extra.kind](pi.extra.unit)} value={pay.extra ?? 0} min={0} max={pi.extra.max} onChange={(v) => set({ extra: v || undefined })} />
              )}
            </section>
          )}
          {info.kicker && (
            <section className="pay-sec" aria-label="キッカー">
              <h3>キッカー</h3>
              <label className="check">
                <input type="checkbox" checked={pay.kick === true} onChange={(e) => set({ kick: e.target.checked || undefined })} />
                キッカーを払う（+{info.kicker.extra}⚡）
              </label>
              {kicked.length > 0 && (
                <ul className="warn-list kick-list">
                  {kicked.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {pi?.sacrifice && (
            <section className="pay-sec" aria-label="差し出す">
              <h3>
                {pi.sacrifice.name}：{pi.sacrifice.kind === 'emerge' ? '生け贄にするとコストが下がる' : pi.sacrifice.kind === 'casualty' ? '生け贄にすると効果がもう一度' : 'トークンかパワーを差し出す'}
              </h3>
              <div className="pay-chips">
                <button type="button" className={cx('chip', !pay.sacrificeUid && 'is-active')} aria-pressed={!pay.sacrificeUid} onClick={() => set({ sacrificeUid: undefined })}>
                  差し出さない
                </button>
                {pi.sacrifice.options.map((o) => (
                  <button
                    key={o.uid}
                    type="button"
                    className={cx('chip', pay.sacrificeUid === o.uid && 'is-active')}
                    aria-pressed={pay.sacrificeUid === o.uid}
                    onClick={() => set({ sacrificeUid: o.uid, tapUids: (pay.tapUids ?? []).filter((x) => x !== o.uid) })}
                  >
                    {label(o.uid)}
                    {o.cut > 0 ? ` −${o.cut}⚡` : ''}
                  </button>
                ))}
              </div>
            </section>
          )}
          {pi?.tap && (
            <section className="pay-sec" aria-label="休ませる">
              <h3>
                {pi.tap.name}：まだ攻撃できるモンスターを休ませる（{pi.tap.kind === 'convoke' ? `1体につき−1⚡・${pi.tap.max}体まで` : '1体だけ・攻撃力で安くなる'}）
              </h3>
              <div className="pay-chips">
                {pi.tap.options.map((o) => {
                  const on = (pay.tapUids ?? []).includes(o.uid);
                  return (
                    <button
                      key={o.uid}
                      type="button"
                      className={cx('chip', on && 'is-active')}
                      aria-pressed={on}
                      disabled={pay.sacrificeUid === o.uid}
                      onClick={() => set({ tapUids: toggleIn(pay.tapUids, o.uid, pi.tap!.max) })}
                    >
                      {label(o.uid)} −{o.cut}⚡
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {delveMode && pi?.delve && (
            <section className="pay-sec" aria-label="探査">
              <h3>探査：捨て札を除外すると1枚につき−1⚡（{pi.delve.max}枚まで）</h3>
              <div className="crow-list pay-cards">
                {pi.delve.order.map((uid) => {
                  const c = mine.discard.find((x) => x.uid === uid);
                  if (!c) return null;
                  const on = (pay.exileUids ?? []).includes(uid);
                  return (
                    <CardRow
                      key={uid}
                      def={view.cards[c.cardId]}
                      label={battle.cardName(view, c.cardId)}
                      picked={on}
                      mark="除外"
                      onToggle={() => set({ exileUids: toggleIn(pay.exileUids, uid, pi.delve!.max) })}
                      onZoom={setZoom}
                    />
                  );
                })}
              </div>
            </section>
          )}
          {pi?.pitch && (
            <section className="pay-sec" aria-label="代替コスト">
              <h3>代替コスト：同じ種類の手札1枚を除外すると、コストのエナジーを払わない</h3>
              <div className="crow-list pay-cards">
                {pi.pitch.options.map((uid) => {
                  const c = mine.hand.find((x) => x.uid === uid);
                  if (!c) return null;
                  return (
                    <CardRow
                      key={uid}
                      def={view.cards[c.cardId]}
                      label={battle.cardName(view, c.cardId)}
                      picked={pay.pitchUid === uid}
                      mark="除外"
                      onToggle={() => set({ pitchUid: pay.pitchUid === uid ? undefined : uid })}
                      onZoom={setZoom}
                    />
                  );
                })}
              </div>
            </section>
          )}
          {pi?.lifePay && (
            <section className="pay-sec" aria-label="血の支払い">
              <h3>血の支払い：エナジー1をHP{pi.lifePay.hpPer}で払う</h3>
              <Stepper label={`HPで払う数（HP−${pi.lifePay.hpPer}ずつ）`} value={pay.lifePay ?? 0} min={0} max={pi.lifePay.max} onChange={(v) => set({ lifePay: v || undefined })} />
            </section>
          )}
          {fd?.discardChoices && (
            <section className="pay-sec" aria-label="捨てる手札">
              <h3>{fd.name}：手札を1枚捨てる</h3>
              <div className="crow-list pay-cards">
                {mine.hand.map((c) => (
                  <CardRow key={c.uid} def={view.cards[c.cardId]} label={battle.cardName(view, c.cardId)} picked={pay.discardUid === c.uid} mark="捨てる" onToggle={() => set({ discardUid: c.uid })} onZoom={setZoom} />
                ))}
              </div>
            </section>
          )}
          {fd?.exileCount && fromDiscard ? (
            <section className="pay-sec" aria-label="除外する捨て札">
              <h3>
                {fd.name}：他の捨て札を{fd.exileCount}枚除外する（{(pay.exileUids ?? []).length}/{fd.exileCount}）
              </h3>
              <div className="crow-list pay-cards">
                {mine.discard
                  .filter((c) => c.uid !== card.uid)
                  .map((c) => (
                    <CardRow
                      key={c.uid}
                      def={view.cards[c.cardId]}
                      label={battle.cardName(view, c.cardId)}
                      picked={(pay.exileUids ?? []).includes(c.uid)}
                      mark="除外"
                      onToggle={() => set({ exileUids: toggleIn(pay.exileUids, c.uid, fd.exileCount!) })}
                      onZoom={setZoom}
                    />
                  ))}
              </div>
            </section>
          ) : null}
        </div>
        <div className="pay-foot">
          <div className="pay-total" aria-live="polite">
            合計 <b>⚡{total}</b>
            {hp > 0 && <b className="pay-hp"> ＋ HP{hp}</b>}
            <span className="pay-left">（残り ⚡{mine.energy}）</span>
            {notes && <small className="pay-notes">{notes}</small>}
          </div>
          {now.error && <p className="pay-why">{now.error}</p>}
          <div className="btn-row">
            <button type="button" className="btn btn--primary" disabled={!!now.error} onClick={() => onDone({ ...pay, done: true })}>
              {pending && pay.alt !== 'overload' ? '決定して対象を選ぶ' : '決定して使う'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              やめる
            </button>
          </div>
        </div>
      </Sheet>
      <ZoomModal def={zoom} onClose={() => setZoom(null)} />
    </>
  );
}

/** 後援（MTG 要素 △ バッチB）：攻撃するときに休ませる味方を選ぶ小さなシート */
export function EnlistSheet({
  view,
  attacker,
  options,
  onPick,
  onCancel,
}: {
  view: GameState;
  attacker: battle.Monster;
  options: battle.Monster[];
  onPick: (uid: string | undefined) => void;
  onCancel: () => void;
}) {
  const name = view.cards[attacker.card.cardId]?.name ?? '？';
  return (
    <Sheet open title={`「${name}」の後援`} onClose={onCancel} desktop="modal">
      <p className="mode-sheet__lead">休ませる（このターン攻撃できなくなる）味方を選ぶと、その攻撃力ぶんこの攻撃が強くなります。</p>
      <div className="mode-list" role="list">
        <button type="button" role="listitem" className="mode-opt" onClick={() => onPick(undefined)}>
          <span className="mode-opt__label" aria-hidden="true">
            ✕
          </span>
          <span className="mode-opt__body">
            <span className="mode-opt__text">後援しないで攻撃する</span>
          </span>
          <span className="mode-opt__cost">⚔{battle.effectiveAttack(view, attacker)}</span>
        </button>
        {options.map((m) => {
          const d = view.cards[m.card.cardId];
          const atk = battle.effectiveAttack(view, m);
          return (
            <button key={m.uid} type="button" role="listitem" className="mode-opt" onClick={() => onPick(m.uid)}>
              <span className="mode-opt__label" aria-hidden="true">
                <CardArt icon={d?.icon} rarity={d?.rarity} cardType="monster" />
              </span>
              <span className="mode-opt__body">
                <span className="mode-opt__name">{d?.name ?? '？'}を休ませる</span>
                <span className="mode-opt__text">攻撃力+{atk}</span>
              </span>
              <span className="mode-opt__cost">⚔{battle.effectiveAttack(view, attacker) + atk}</span>
            </button>
          );
        })}
      </div>
      <div className="btn-row modal__foot dlg__foot">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          攻撃をやめる
        </button>
      </div>
    </Sheet>
  );
}

/** 手札の能力・捨て札の山に落としたとき、能力が複数あれば選ぶ（サイクリング・魂力・予見） */
export function AbilityChoiceSheet({ title, items, onPick, onCancel }: { title: string; items: { id: string; label: string; note?: string; blocked?: string | null }[]; onPick: (id: string) => void; onCancel: () => void }) {
  return (
    <Sheet open title={title} onClose={onCancel} desktop="modal">
      <div className="mode-list" role="list">
        {items.map((x) => (
          <button key={x.id} type="button" role="listitem" className={cx('mode-opt', x.blocked && 'is-blocked')} disabled={!!x.blocked} onClick={() => onPick(x.id)}>
            <span className="mode-opt__body">
              <span className="mode-opt__text">{x.label}</span>
              {x.note && <span className="mode-opt__name">{x.note}</span>}
              {x.blocked && <span className="mode-opt__why">{x.blocked}</span>}
            </span>
          </button>
        ))}
      </div>
      <div className="btn-row modal__foot dlg__foot">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          やめる
        </button>
      </div>
    </Sheet>
  );
}
