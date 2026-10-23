/**
 * マリガン・手札や捨て札からの選択（UI2「黒鉄と金の卓」。決定事項 #112）：行の一覧ではなく、本物の手札のカード（HandCard）を並べる。
 * - 引き直す（redraw）：タップで深紅の × の封蝋と深紅の輪。選ぶ（choose）：カードの下のサファイアの宝石のラジオと輪
 * - カードの中身は暗くしない（読める）。スマホ（手札のカードに効果テキストが無い）はカードの下に全カードの全文の一覧を出し、
 *   読むために印を付け外ししなくてよい（UI2 の統合）。PC は最後に触ったカードの全文と「詳細」
 * - 選択肢の文（engine の label）がカード名と違えば（処分の「手札：X／捨て札：X」、章を進める の「第N章」など）カードの下に添える
 * - 長押し（または「詳細」）で CardDetail。読み上げは各カードに aria-pressed と「〇〇を引き直す」「〇〇を選ぶ」
 */
import { useState } from 'react';
import { analyzeCard, battle, CARD_TYPE_LABEL, type CardDef } from '../../engine/index.ts';
import { UiIcon } from '../components/UiIcon.tsx';
import { cx } from '../util.ts';
import { HandCard, useLongPress } from './parts.tsx';

export interface PickItem {
  key: string;
  card: battle.CardInst;
  def: CardDef | undefined;
  /** 表示名（ノイズ・裏向きなど def の無いものの名前） */
  name: string;
  on: boolean;
  /** カード名だけでは分からない選択肢の文（手札：X・捨て札：X・第N章など）。カード名と同じなら省く */
  sub?: string;
}

/** 選択肢の文がカード名と違うときだけ添える */
export function pickSub(label: string, name: string): string | undefined {
  return label && label !== name ? label : undefined;
}

/** カードの全文（種類・ステータス・キーワード・効果・デメリット・能力）。CardRow の本文と同じ文 */
export function cardFullText(def: CardDef | undefined): string {
  if (!def) return 'エナジーを払って除外できる。それ以外は何もしない';
  const a = analyzeCard(def);
  const parts: string[] = [CARD_TYPE_LABEL[a.cardType]];
  if (def.stats) parts.push(`攻撃力${def.stats.attack}・体力${def.stats.hp}${def.stats.defense ? `・守備力${def.stats.defense}` : ''}`);
  if (a.text.keywords.length > 0) parts.push(a.text.keywords.map((k) => k.name).join('・'));
  const body = [a.text.effects.join(''), a.text.drawbacks.map((d) => `☠${d}`).join(''), a.text.abilities.map((x) => `✦${x.name}`).join('')].join('');
  return [...parts, body].filter(Boolean).join('　');
}

/** 表示だけの手札の情報（コストは印刷のまま。使える・使えないの印は出さない） */
const stillInfo = (card: battle.CardInst, def: CardDef | undefined): battle.PlayInfo => ({
  card,
  cost: def?.cost ?? 0,
  blocked: null,
  enemyTargets: [],
  allyTargets: [],
  warnings: [],
  tauntLimited: false,
});

function CardPick({ it, mode, onToggle, onTouch, onDetail }: { it: PickItem; mode: 'redraw' | 'choose'; onToggle: () => void; onTouch: () => void; onDetail: () => void }) {
  const press = useLongPress(it.def ? onDetail : undefined);
  return (
    <button
      type="button"
      className={cx('cpick', it.on && 'is-on')}
      aria-pressed={it.on}
      aria-label={`${it.sub ?? it.name}${mode === 'redraw' ? 'を引き直す' : 'を選ぶ'}`}
      onClick={() => {
        if (press.consumed()) return;
        onTouch();
        onToggle();
      }}
      onFocus={onTouch}
      {...press.handlers}
    >
      <HandCard card={it.card} def={it.def} info={stillInfo(it.card, it.def)} energy={99} playable={false} selected={false} dim={false} onClick={() => undefined} still />
      <span className="cpick__ring" aria-hidden="true" />
      {mode === 'redraw' ? (
        <span className="cpick__seal" aria-hidden="true">
          {/* 太い幾何学の ×（筆の × は封蝋の大きさで鳥のように見えた） */}
          <svg viewBox="0 0 20 20" className="cpick__x" focusable="false">
            <path d="M5 5 15 15M15 5 5 15" />
          </svg>
        </span>
      ) : (
        <span className="cpick__gem" aria-hidden="true" />
      )}
      {it.sub && (
        <span className="cpick__sub" aria-hidden="true">
          {it.sub}
        </span>
      )}
    </button>
  );
}

export function CardPickGrid({
  items,
  mode,
  label,
  onToggle,
  onDetail,
}: {
  items: PickItem[];
  mode: 'redraw' | 'choose';
  /** 並びの読み上げ名 */
  label: string;
  onToggle: (key: string) => void;
  onDetail: (def: CardDef) => void;
}) {
  // 最後に触ったカード（全文を下に出す）。はじめは先頭
  const [last, setLast] = useState<string | null>(null);
  const cur = items.find((it) => it.key === last) ?? items[0];
  return (
    <div className="cpicks-wrap">
      <div className={cx('cpicks', mode === 'choose' && 'cpicks--choose')} role="group" aria-label={label}>
        {items.map((it) => (
          <CardPick key={it.key} it={it} mode={mode} onToggle={() => onToggle(it.key)} onTouch={() => setLast(it.key)} onDetail={() => it.def && onDetail(it.def)} />
        ))}
      </div>
      {/* スマホ：全カードの全文（読むのに印を付け外ししない） */}
      <ul className="cpick-all">
        {items.map((it) => (
          <li key={it.key} className={cx(it.on && 'is-on')}>
            <b>{it.sub ?? it.name}</b>
            {it.on && <span className={cx('cpick-all__mark', mode === 'redraw' && 'cpick-all__mark--redraw')}>{mode === 'redraw' ? '引き直す' : '選択中'}</span>}
            <span>{cardFullText(it.def)}</span>
          </li>
        ))}
      </ul>
      {cur && (
        <div className="cpick-desc" aria-live="polite">
          {cur.def && (
            <button type="button" className="btn btn--small btn--ghost cpick-desc__more" onClick={() => onDetail(cur.def!)} aria-label={`${cur.name}の詳細`}>
              詳細
            </button>
          )}
          <p>
            <b>{cur.sub ?? cur.name}</b>
            {cardFullText(cur.def)}
          </p>
        </div>
      )}
      <p className="cpick-hint">
        <UiIcon name="gi:hand" />
        {mode === 'redraw' ? 'タップで引き直す印を付ける・長押しで詳細' : 'タップで選ぶ・長押しで詳細'}
      </p>
    </div>
  );
}
