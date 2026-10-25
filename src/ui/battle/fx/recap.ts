/**
 * 「相手のターンのまとめ」（決定事項 #126）。ログ（見える分）から、いちばん新しい相手のターンにあったことを短い項目にする純粋関数。
 * 使ったカード・攻撃・出たモンスター・破壊されたモンスター・あなたが受けたダメージ・相手の回復・あなたに付いた状態異常。
 */
import { battle } from '../../../engine/index.ts';
import { statusFx } from './registry.ts';

type LogEntry = battle.LogEntry;
type PlayerId = battle.PlayerId;

export interface RecapItem {
  /** 並びと形 */
  kind: 'play' | 'attack' | 'summon' | 'lost' | 'killed' | 'damage' | 'heal' | 'status' | 'activate';
  /** game-icons の名前 */
  gi: string;
  /** 1行の文 */
  text: string;
  /** 帯に出す短い文字（形の横） */
  short: string;
  /** 見た人にとって悪いこと（赤）・良いこと（緑）・どちらでもない */
  tone: 'bad' | 'good' | 'info';
  /** 使ったカード（名前を押すと詳細） */
  cardId?: string;
}

export interface Recap {
  /** 相手のターンの通し番号（そのターンの log の turn）。同じまとめを何度も出さないための鍵 */
  turn: number;
  /** 相手の何ターン目か（見出し） */
  turnNo: number | null;
  /** 一覧（起きた順：使ったカード → 攻撃 → …） */
  items: RecapItem[];
  /** 帯に出す短い札（大事な順：あなたへのダメージ → 失ったモンスター → 攻撃 → 使ったカードの枚数 → …） */
  chips: RecapItem[];
}

const parseTurnNo = (text: string): number | null => {
  const m = /（(\d+)ターン目）/.exec(text);
  return m ? Number(m[1]) : null;
};

/**
 * いちばん新しい相手のターン（今が自分のターンなら、その直前の相手のターン）のまとめ。相手のターンがまだ無ければ null。
 * 何も起きなかった（ターン終了だけ）ときも null
 */
export function buildRecap(log: LogEntry[], view: battle.GameState, me: PlayerId): Recap | null {
  const opp: PlayerId = me === 0 ? 1 : 0;
  let start = -1;
  for (let i = log.length - 1; i >= 0; i--) {
    const ev = log[i]!.ev;
    if (ev?.kind === 'turnStart' && ev.player === opp) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  let end = log.length;
  for (let i = start + 1; i < log.length; i++) if (log[i]!.ev?.kind === 'turnStart') {
    end = i;
    break;
  }
  const entries = log.slice(start, end);
  const name = (id: string | undefined) => (id ? (view.cards[id]?.name ?? null) : null);
  const items: RecapItem[] = [];
  let attacksMe = 0;
  let attacksMonsters = 0;
  let summons = 0;
  let lost = 0;
  let killed = 0;
  let damage = 0;
  let heal = 0;
  let activates = 0;
  const statuses = new Set<string>();
  /** 相手のモンスターの uid（攻撃の向き） */
  const ownerOf = (uid: string): PlayerId | null => {
    const m = battle.findMonster(view, uid);
    if (m) return m.controller;
    for (const e of entries) if (e.ev?.kind === 'summon' && e.ev.uid === uid && e.ev.player !== undefined) return e.ev.player;
    return null;
  };
  for (const e of entries) {
    const ev = e.ev;
    if (!ev) continue;
    switch (ev.kind) {
      case 'play':
        if (ev.player !== opp) break;
        items.push({ kind: 'play', gi: 'magic-palm', text: `「${name(ev.cardId) ?? '裏向きのカード'}」を使った`, short: name(ev.cardId) ?? '裏向き', tone: 'info', ...(ev.cardId ? { cardId: ev.cardId } : {}) });
        break;
      case 'activate':
        if (ev.player === opp) activates += 1;
        break;
      case 'attack':
        if (ev.status === 'fight' || ev.status === 'infight') break;
        if (ev.source?.kind === 'monster' && ownerOf(ev.source.uid) === me) break;
        if (ev.target?.kind === 'player' && ev.target.player === me) attacksMe += 1;
        else if (ev.target?.kind === 'monster') attacksMonsters += 1;
        break;
      case 'summon':
        if (ev.player === opp) summons += 1;
        break;
      case 'destroy':
        // パワーの消滅は数えない（モンスターだけ）
        if (ev.cardId && view.cards[ev.cardId] && !view.cards[ev.cardId]!.stats) break;
        if (ev.player === me) lost += 1;
        else if (ev.player === opp) killed += 1;
        break;
      case 'damage':
      case 'retaliate':
        if (ev.target?.kind === 'player' && ev.target.player === me) damage += ev.amount ?? 0;
        break;
      case 'heal':
        if (ev.target?.kind === 'player' && ev.target.player === opp) heal += ev.amount ?? 0;
        break;
      case 'status': {
        const t = ev.target;
        const mineTarget = t ? (t.kind === 'player' ? t.player === me : ownerOf(t.uid) === me) : false;
        const st = statusFx(ev.status);
        if (mineTarget && st && (st.arch === 'debuff' || st.arch === 'bind' || st.arch === 'bolt')) statuses.add(st.label);
        break;
      }
      default:
        break;
    }
  }
  const attacks = attacksMe + attacksMonsters;
  if (attacks > 0)
    items.push({
      kind: 'attack',
      gi: 'sword-clash',
      text: `攻撃 ${attacks}回（あなたへ${attacksMe}回・モンスターへ${attacksMonsters}回）`,
      short: `攻撃${attacks}`,
      tone: 'bad',
    });
  if (summons > 0) items.push({ kind: 'summon', gi: 'sparkles', text: `相手の場にモンスターが${summons}体出た`, short: `召喚${summons}`, tone: 'info' });
  if (lost > 0) items.push({ kind: 'lost', gi: 'skull-crack', text: `あなたのモンスターが${lost}体破壊された`, short: `${lost}体失った`, tone: 'bad' });
  if (killed > 0) items.push({ kind: 'killed', gi: 'skull-crack', text: `相手のモンスターが${killed}体破壊された`, short: `${killed}体撃破`, tone: 'good' });
  if (damage > 0) items.push({ kind: 'damage', gi: 'explosion-rays', text: `あなたは合計${damage}ダメージを受けた`, short: `−${damage}`, tone: 'bad' });
  if (heal > 0) items.push({ kind: 'heal', gi: 'heart-plus', text: `相手は合計${heal}回復した`, short: `相手+${heal}`, tone: 'info' });
  if (statuses.size > 0) items.push({ kind: 'status', gi: 'crystal-shine', text: `あなたの側に：${[...statuses].join('・')}`, short: [...statuses].slice(0, 2).join('・'), tone: 'bad' });
  if (activates > 0) items.push({ kind: 'activate', gi: 'bolt-spell-cast', text: `起動 ${activates}回`, short: `起動${activates}`, tone: 'info' });
  if (items.length === 0) return null;
  const plays = items.filter((i) => i.kind === 'play');
  const pick = (k: RecapItem['kind']) => items.filter((i) => i.kind === k);
  const chips = [
    ...pick('damage'),
    ...pick('lost'),
    ...pick('attack'),
    ...(plays.length > 0 ? [{ kind: 'play' as const, gi: 'magic-palm', text: `カードを${plays.length}枚使った`, short: plays.length === 1 ? plays[0]!.short : `カード${plays.length}枚`, tone: 'info' as const }] : []),
    ...pick('killed'),
    ...pick('status'),
    ...pick('summon'),
    ...pick('heal'),
    ...pick('activate'),
  ];
  return { turn: log[start]!.turn, turnNo: parseTurnNo(log[start]!.text), items, chips };
}
