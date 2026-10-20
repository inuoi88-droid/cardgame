/** 予算メーター・内訳の表（折りたたみ）・要修正の一覧。PC の右カラムと、スマホの内訳シートで使う */
import { BALANCE, CARD_TYPE_LABEL, CONDITIONS, CURSE_LABEL, MODE_LABEL, modeSummary, RARITY_LABEL, TIMINGS, type CardAnalysis, type CardDef, type ModeId, type Violation } from '../../engine/index.ts';
import type { BudgetModel } from '../editor/budget.ts';
import { BudgetMeter } from '../editor/BudgetMeter.tsx';
import { cx, signed } from '../util.ts';

interface Props {
  card: CardDef;
  analysis: CardAnalysis;
  budget: BudgetModel;
  /** 画面に出す違反（名前の重複など、カード以外の理由も含む） */
  violations: Violation[];
  /** 違反をタップしたとき、その入力欄へ飛ぶ */
  onJump?: (path: string) => void;
  /** 内訳の表をはじめから開いておく */
  detailsOpen?: boolean;
  meterId?: string;
  flash?: boolean;
}

export function PointPanel({ card, analysis: a, budget, violations, onJump, detailsOpen = false, meterId, flash }: Props) {
  const p = a.points;
  return (
    <section className="panel point-panel" aria-label="ポイントと判定">
      <div className="point-panel__badges">
        <span className="badge">{CARD_TYPE_LABEL[a.cardType]}</span>
        <span className={cx('badge', `badge--${card.rarity}`)}>{RARITY_LABEL[card.rarity]}</span>
        {a.isCurse && <span className="badge badge--curse">{CURSE_LABEL}</span>}
      </div>

      <BudgetMeter m={budget} rarity={card.rarity} cost={card.cost} id={meterId} flash={flash} />

      {violations.length === 0 ? (
        <p className="ok-msg">✓ このカードは作成できます</p>
      ) : (
        <div className="ed-vlist" aria-live="polite">
          <p className="ed-vlist__head">要修正 {violations.length}件</p>
          <ul>
            {violations.map((v, i) => (
              <li key={i}>
                {onJump && v.path ? (
                  <button type="button" className="ed-vlist__btn" onClick={() => onJump(v.path!)}>
                    {v.message}
                    <span className="ed-vlist__go">→ 直す</span>
                  </button>
                ) : (
                  v.message
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <details className="ed-details" open={detailsOpen}>
        <summary>内訳の表</summary>
        <table className="point-table">
          <tbody>
            {p.lines.map((l, i) => (
              <tr key={i} className={cx(`point-table__${l.kind}`)}>
                <th scope="row">{l.kind === 'cost' ? `コスト${card.cost}` : l.label}</th>
                <td className="point-table__formula">{l.kind === 'cost' ? '予算に加算' : l.formula}</td>
                <td className="point-table__value">{l.kind === 'cost' ? `予算 +${-l.value}` : signed(l.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">使用</th>
              <td className="point-table__formula">予算 {budget.budget}</td>
              <td className="point-table__value">{budget.used}</td>
            </tr>
          </tfoot>
        </table>
        <PanelNotes card={card} />
      </details>

    </section>
  );
}

/**
 * 内訳の補足（MTG 要素 ○ バッチC1・C2）：モードごとのポイント（いちばん高いモードは全額、ほかは割引）と、
 * 親和・条件付き軽減で下がったときの実コストの見込み
 */
function PanelNotes({ card }: { card: CardDef }) {
  const notes: string[] = [];
  const modes = modeSummary(card);
  if (modes) {
    const rate = BALANCE.modal.otherRate;
    for (const g of modes.groups) {
      const list = [...g.points.entries()].sort((a, b) => a[0] - b[0]);
      const best = Math.max(...list.map(([, v]) => v));
      notes.push(
        `モード（${TIMINGS[g.timing].label}）：${list.map(([m, v]) => `${MODE_LABEL[m as ModeId]} ${Math.round(v)}pt${v === best ? '（全額）' : ''}`).join('・')}。いちばん高いモード以外は×${rate}`,
      );
    }
  }
  const ab = card.abilities ?? [];
  const aff = ab.find((a) => a.id === 'affinity');
  const cut = ab.find((a) => a.id === 'costCut');
  if (aff) {
    const A = BALANCE.abilities.affinity;
    const max = Math.max(0, Math.min(A.maxReduction, card.cost - A.minCost));
    const what = aff.option === 'cardsPlayed' ? 'このターン使ったカード' : '自分の場のモンスター';
    notes.push(`実コストの見込み（親和）：${what}1につき−1、最低${card.cost - max}（${what}が${max}以上のとき）`);
  }
  if (cut) {
    const C = BALANCE.abilities.costCut;
    const k = Math.max(0, Math.min(cut.value ?? 0, card.cost - C.minCost));
    const cond = cut.condition ? CONDITIONS[cut.condition]?.label : undefined;
    notes.push(`実コストの見込み（条件付き軽減）：${cond ? `「${cond}」のとき` : '条件を満たすと'}コスト${card.cost}→${card.cost - k}`);
  }
  notes.push(...payNotes(card));
  if (notes.length === 0) return null;
  return (
    <ul className="point-panel__notes">
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}

/**
 * 追加の支払い・代わりの使い方・待機ゾーン（MTG 要素 △ バッチB・C）の実コストの見込み（統合 #101）。
 * 数値はカードの能力の値と balance.ts から読む。実際の支払いは対戦の支払いのシートで選ぶ
 */
export function payNotes(card: CardDef): string[] {
  const A = BALANCE.abilities;
  const c = card.cost;
  const out: string[] = [];
  const at = (k: number) => Math.max(0, k);
  for (const a of card.abilities ?? []) {
    const v = a.value ?? 0;
    switch (a.id) {
      case 'prototype':
        out.push(`実コストの見込み（試作）：コスト${at(c - v)}で半分の強さで出す／通常はコスト${c}`);
        break;
      case 'evoke':
        out.push(`実コストの見込み（想起）：コスト${v}で出し、召喚時の効果のあと破壊／通常はコスト${c}`);
        break;
      case 'overload':
        out.push(`実コストの見込み（超過）：コスト${c + v}で「選んだ1体」が全体になる`);
        break;
      case 'spree':
        out.push(`実コストの見込み（放題）：モードを1つ足すごとに+${v}（全部でコスト${c + v * (BALANCE.modal.maxModes - 1)}まで）`);
        break;
      case 'tiered':
        out.push(`実コストの見込み（段階）：モードA ${c}・B ${c + (A.tiered.surcharge[1] ?? 0)}・C ${c + (A.tiered.surcharge[2] ?? 0)}`);
        break;
      case 'cleave':
        out.push(`実コストの見込み（切除）：コスト${c + v}で条件を無視`);
        break;
      case 'strive':
        out.push(`実コストの見込み（奮励）：+${v}ごとに相手をもう1つ（最大${A.strive.maxTimes}回、コスト${c + v * A.strive.maxTimes}まで）`);
        break;
      case 'squad':
        out.push(`実コストの見込み（分隊）：+${v}ごとにコピーを1体（最大${A.squad.maxTimes}回、コスト${c + v * A.squad.maxTimes}まで）`);
        break;
      case 'emerge':
        out.push(`実コストの見込み（現出）：生け贄にしたモンスターの印刷コストぶん安くなる（最低0）`);
        break;
      case 'convoke':
        out.push(`実コストの見込み（召集）：休ませたモンスター1体につき−1、最低${at(c - A.convoke.max)}`);
        break;
      case 'delve':
        out.push(`実コストの見込み（探査）：除外した捨て札1枚につき−1、最低${at(c - A.delve.max)}`);
        break;
      case 'lifePay':
        out.push(`実コストの見込み（血の支払い）：エナジー${Math.min(v, c)}までをHP${A.lifePay.hpPerEnergy}ずつで払える（最低エナジー${at(c - v)}）`);
        break;
      case 'pitch':
        out.push('実コストの見込み（代替コスト）：手札の同じ種類のカード1枚を除外すれば0（1ターン1回）');
        break;
      case 'harmonize':
        out.push(`実コストの見込み（調和）：捨て札からコスト${c + v}、休ませたモンスターの攻撃力${A.harmonize.attackPerEnergy}ごとに−1（最大−${A.harmonize.maxCut}）`);
        break;
      case 'unearth':
        out.push(`実コストの見込み（一時蘇生）：捨て札からコスト${v}で速攻つき（ターン終わりに除外）`);
        break;
      case 'foretell':
        out.push(`実コストの見込み（予顕）：いまエナジー${A.foretell.setCost}で伏せ、後のターンにコスト${at(c - v)}`);
        break;
      case 'plot':
        out.push(`実コストの見込み（計画）：いまコスト${c}を払って置き、後のターンに無料`);
        break;
      case 'suspend':
        out.push(`実コストの見込み（待機）：いまエナジー${a.option ?? '?'}で置き、${v}ターン後に無料で使われる`);
        break;
      case 'warp':
        out.push(`実コストの見込み（ワープ）：コスト${v}で出し、ターン終了時に待機ゾーンへ（後でコスト${c}で出せる）`);
        break;
      case 'adventure':
        out.push(`実コストの見込み（出来事）：コスト${v}で出来事として使い、後でコスト${c}でモンスターとして出す`);
        break;
      case 'disguise':
        out.push(`実コストの見込み（変装）：エナジー${A.disguise.playCost}で裏向きに出し、エナジー${v}で表にする（合計${A.disguise.playCost + v}）`);
        break;
    }
  }
  return out;
}
