/** 対戦画面のダイアログ：マリガン、選択、結果。カードは読める大きさのリストで出し、🔍（一覧ではカードそのもの）で詳細を見られる */
import { useState, type ReactNode } from 'react';
import { analyzeCard, BALANCE, battle, CARD_TYPE_LABEL, getDrawback, getEffect, type CardDef } from '../../engine/index.ts';
import { Modal } from '../components/controls.tsx';
import { cx } from '../util.ts';
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
          <span className="crow__icon">📛</span>
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
        <span className={cx('crow__icon', `frame--${def.rarity}`, a.isCurse && 'frame--curse')}>{def.icon}</span>
        <span className="crow__text">
          <span className="crow__head">
            <span className="crow__cost">{def.cost}</span>
            <b>{def.name}</b>
            <small>{CARD_TYPE_LABEL[a.cardType]}</small>
          </span>
          <span className="crow__body">
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
        <p className="hint">このまま始めるか、引き直すカードを選んでください。一部だけの引き直しは1回で手札が決まります。</p>
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
          <span className="badge">{p.min === 0 ? `0〜${p.max}枚` : p.min === p.max ? `${p.max}枚` : `${p.min}〜${p.max}枚`}</span>
          {timeLeft && <span className="dlg__time">{timeLeft}</span>}
        </div>
        <p>{p.prompt}</p>
        <div className="crow-list">
          {p.options.map((o) => (
            <CardRow key={o.id} def={o.cardId ? view.cards[o.cardId] : undefined} label={o.label} picked={picked.includes(o.id)} mark="選択" onToggle={() => toggle(o.id)} onZoom={setZoom} />
          ))}
          {p.options.length === 0 && <p className="hint">選べるものがありません</p>}
        </div>
        <div className="btn-row modal__foot dlg__foot">
          {p.min === 0 && picked.length === 0 ? (
            <button type="button" className="btn btn--primary" onClick={() => onAction({ type: 'choose', player: me, picks: [] })}>
              {retain ? '残さない' : '選ばずに進む'}
            </button>
          ) : (
            <button type="button" className="btn btn--primary" disabled={!canDecide} onClick={() => onAction({ type: 'choose', player: me, picks: picked })}>
              {picked.length === 0 ? 'カードを選んでください' : `決定（${picked.length}${p.max > 1 ? `/${p.max}` : ''}）`}
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

export function ResultDialog({ view, me, onHide, children }: { view: GameState; me: PlayerId; onHide: () => void; children: ReactNode }) {
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
          : won
            ? '相手のHPを0にしました'
            : 'HPが0になりました';
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
