/** 対戦画面の表示用の計算（純粋関数）：手札の1行要約、エナジーの基本値、裏切り・維持費の予告、結果の要約、デッキの内訳 */
import { analyzeCard, BALANCE, battle, CARD_TYPE_LABEL, getDrawback, type CardDef, type Deck } from '../../engine/index.ts';

type GameState = battle.GameState;
type PlayerId = battle.PlayerId;

/** 手札カードの1行要約（キーワード・効果・デメリットを並べ、長ければ…で切る） */
export function summarizeCard(def: CardDef, max = 40): string {
  const a = analyzeCard(def);
  const parts = [...a.text.keywords.map((k) => k.name), ...a.text.effects.map((t) => t.replace(/。$/, '')), ...a.text.drawbacks.map((d) => `☠${d.replace(/。$/, '')}`), ...a.text.abilities.map((x) => `✦${x.name}`)];
  const s = parts.join('／');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/** そのプレイヤーの n ターン目の基本エナジー（エンジンの energySchedule と同じ読み方） */
export function baseEnergyForTurn(turnsTaken: number): number {
  let energy = 0;
  for (const step of BALANCE.battle.energySchedule) if (turnsTaken >= step.fromTurn) energy = step.energy;
  return energy;
}

export interface Forecast {
  label: string;
  title: string;
  description: string;
  tone: 'bad' | 'info';
}

/** 場のモンスターに出す予告（裏切りまでのターン、維持費） */
export function monsterForecasts(def: CardDef | undefined, m: battle.Monster): Forecast[] {
  if (!def) return [];
  const out: Forecast[] = [];
  for (const d of def.drawbacks) {
    const dd = getDrawback(d.id);
    if (!dd) continue;
    if (d.id === 'betrayal') {
      if (m.betraying) continue;
      const left = Math.max(0, BALANCE.drawbacks.betrayal.turns - (m.counters.betrayal ?? 0));
      out.push({ label: `裏切りまで ${left}T`, title: '裏切り', description: `${dd.describe(d)}。あと${left}ターン（持ち主のターン開始時に数える）`, tone: 'bad' });
    } else if (d.id === 'defender') {
      out.push({ label: '防衛', title: '防衛', description: `${dd.describe(d)}（反撃はする）`, tone: 'bad' });
    } else if (d.id === 'decay') {
      out.push({ label: '腐乱', title: '腐乱', description: dd.describe(d), tone: 'bad' });
    } else if (d.id === 'upkeep') {
      out.push({ label: `維持費 −${BALANCE.drawbacks.upkeep.damage}/T`, title: '維持費', description: dd.describe(d), tone: 'bad' });
    }
  }
  return out;
}

export interface ResultSummary {
  myTurns: number;
  oppTurns: number;
  dealt: number;
  taken: number;
  /** 決め手（負けた側の HP を最後に削ったカード名）。分からなければ null */
  decisive: string | null;
}

/** 結果画面の要約をログから作る */
export function summarizeResult(view: GameState, me: PlayerId): ResultSummary {
  const opp = battle.other(me);
  let dealt = 0;
  let taken = 0;
  const summonedCard = new Map<string, string>();
  for (const e of view.log) {
    const ev = e.ev;
    if (!ev) continue;
    if (ev.kind === 'summon' && ev.uid && ev.cardId) summonedCard.set(ev.uid, ev.cardId);
    if ((ev.kind === 'damage' || ev.kind === 'retaliate') && ev.target?.kind === 'player') {
      const m = /HP (\d+)→(\d+)/.exec(e.text);
      const lost = m ? Number(m[1]) - Number(m[2]) : (ev.amount ?? 0);
      if (ev.target.player === opp) dealt += lost;
      else taken += lost;
    }
  }
  let decisive: string | null = null;
  const loser = view.result?.winner === null || view.result?.winner === undefined ? null : battle.other(view.result.winner);
  if (loser !== null && view.result?.reason === 'hp') {
    let idx = -1;
    for (let i = view.log.length - 1; i >= 0; i--) {
      const ev = view.log[i]!.ev;
      if ((ev?.kind === 'damage' || ev?.kind === 'retaliate') && ev.target?.kind === 'player' && ev.target.player === loser) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      const hit = view.log[idx]!.ev!;
      const src = hit.source;
      if (src?.kind === 'monster') {
        const cardId = battle.findMonster(view, src.uid)?.card.cardId ?? summonedCard.get(src.uid);
        decisive = cardId ? battle.cardName(view, cardId) : null;
      }
      if (!decisive) {
        for (let i = idx; i >= 0; i--) {
          const ev = view.log[i]!.ev;
          if (ev?.kind === 'turnStart') break;
          if (ev?.kind === 'play' && ev.cardId) {
            decisive = battle.cardName(view, ev.cardId);
            break;
          }
        }
      }
      if (!decisive && hit.damageKind === 'poison') decisive = '毒';
      if (!decisive && hit.damageKind === 'burn') decisive = 'やけど';
    }
  }
  return { myTurns: view.players[me].turnsTaken, oppTurns: view.players[opp].turnsTaken, dealt, taken, decisive };
}

export interface DeckBreakdown {
  total: number;
  byType: { label: string; count: number }[];
  byCost: { cost: number; count: number }[];
  /** 枚数の多い順のカード */
  cards: { def: CardDef; count: number }[];
}

/** デッキの内訳（準備画面の表示用） */
export function breakdownDeck(deck: Deck, cards: CardDef[]): DeckBreakdown {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const type = new Map<string, number>();
  const cost = new Map<number, number>();
  const list: { def: CardDef; count: number }[] = [];
  let total = 0;
  for (const e of deck.entries) {
    const def = byId.get(e.cardId);
    if (!def) continue;
    total += e.count;
    const label = CARD_TYPE_LABEL[analyzeCard(def).cardType];
    type.set(label, (type.get(label) ?? 0) + e.count);
    cost.set(def.cost, (cost.get(def.cost) ?? 0) + e.count);
    list.push({ def, count: e.count });
  }
  return {
    total,
    byType: [...type].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    byCost: [...cost].map(([c, count]) => ({ cost: c, count })).sort((a, b) => a.cost - b.cost),
    cards: list.sort((a, b) => b.count - a.count || a.def.cost - b.def.cost),
  };
}
