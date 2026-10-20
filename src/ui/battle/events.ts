/**
 * イベント再生の材料：ログの新しい行（構造化イベント ev つき）を、画面の演出1件ずつに変換する純粋関数。
 * 盤面そのものは最新の状態をそのまま表示し、ここで作った演出（バナー・浮かぶ数字・出現・消滅）を順に重ねる。
 */
import { battle } from '../../engine/index.ts';

type GameState = battle.GameState;
type LogEntry = battle.LogEntry;
type PlayerId = battle.PlayerId;
type TargetRef = battle.TargetRef;

/** 浮かぶ数字の色分け */
export type FxTone = 'damage' | 'poison' | 'burn' | 'retaliate' | 'heal' | 'shield' | 'bad' | 'good';

/** 演出の対象を指す鍵：プレイヤーは p0 / p1、モンスターは uid */
export type FxKey = string;

export const keyOf = (t: TargetRef): FxKey => (t.kind === 'player' ? `p${t.player}` : t.uid);

export type Show =
  | { t: 'turn'; player: PlayerId; turn: number | null }
  /** 相手がカードを使った：カードを見せる */
  | { t: 'reveal'; player: PlayerId; cardId: string }
  /** 自分がカードを使った：短い見出しだけ */
  | { t: 'played'; player: PlayerId; cardId: string }
  | { t: 'float'; key: FxKey; text: string; tone: FxTone; flash: 'hit' | 'heal' | 'status'; hpAfter?: number }
  | { t: 'summon'; uid: string }
  | { t: 'destroy'; uid: string }
  | { t: 'attack'; source: FxKey; target: FxKey; retaliate: boolean }
  /** 中央の小さな通知（不発など） */
  | { t: 'notice'; text: string; tone: 'mine' | 'enemy' | 'neutral' }
  /** ティッカーの更新だけ */
  | { t: 'tick' };

export interface BattleEvent {
  id: number;
  text: string;
  /** 誰の行動か（色分け用。分からなければ null） */
  player: PlayerId | null;
  show: Show;
  /** 表示時間（ミリ秒） */
  ms: number;
}

/** 表示時間の目安（決定事項：1件 300〜600ms、カード提示は約 700ms） */
export const DURATION = {
  turn: 900,
  reveal: 1000,
  played: 350,
  float: 450,
  summon: 400,
  destroy: 500,
  attack: 350,
  notice: 700,
  tick: 120,
} as const;

/** 「HP 940→800」「体力 20→8」から後の値を読む（HP バーの追従に使う。読めなければ undefined） */
export function parseHpAfter(text: string): number | undefined {
  const m = /(?:HP|体力) (\d+)→(\d+)/.exec(text);
  return m ? Number(m[2]) : undefined;
}

function parseTurn(text: string): number | null {
  const m = /（(\d+)ターン目）/.exec(text);
  return m ? Number(m[1]) : null;
}

const STATUS_NAME: Record<string, string> = {
  poison: '毒',
  burn: 'やけど',
  weak: '弱体',
  vulnerable: '脆弱',
  bleed: '出血',
  freeze: '凍結',
  confuse: '混乱',
  counter: '反撃',
  nullify: '無効化',
  regen: '再生',
  strength: '筋力',
  focus: '気合',
  doom: '呪縛',
  divineShield: '聖盾',
};
const GOOD_STATUS = new Set(['counter', 'nullify', 'regen', 'strength', 'focus', 'divineShield']);

function damageTone(kind: battle.DamageKind | undefined): FxTone {
  switch (kind) {
    case 'poison':
    case 'doom':
      return 'poison';
    case 'burn':
      return 'burn';
    case 'retaliate':
    case 'counter':
      return 'retaliate';
    default:
      return 'damage';
  }
}

/** ログの行を演出に変える。演出にならない行（効果の説明文など）は省く */
export function buildEvents(entries: LogEntry[], view: GameState, me: PlayerId, firstId: number): BattleEvent[] {
  const out: BattleEvent[] = [];
  let id = firstId;
  const push = (text: string, player: PlayerId | null, show: Show, ms: number) => out.push({ id: id++, text, player, show, ms });
  const ownerOf = (t: TargetRef | undefined): PlayerId | null => {
    if (!t) return null;
    if (t.kind === 'player') return t.player;
    return battle.findMonster(view, t.uid)?.controller ?? null;
  };
  for (const e of entries) {
    const ev = e.ev;
    if (!ev) {
      if (e.text.includes('を満たさないため発動しない')) push('条件を満たさず不発', null, { t: 'notice', text: '条件を満たさず不発', tone: 'neutral' }, DURATION.notice);
      else if (e.kind === 'action' || e.kind === 'result') push(e.text, null, { t: 'tick' }, DURATION.tick * 2);
      continue;
    }
    switch (ev.kind) {
      case 'turnStart':
        push(e.text, ev.player ?? null, { t: 'turn', player: ev.player ?? 0, turn: parseTurn(e.text) }, DURATION.turn);
        break;
      case 'play':
        if (ev.player === undefined || !ev.cardId) break;
        if (ev.player === me) push(e.text, ev.player, { t: 'played', player: ev.player, cardId: ev.cardId }, DURATION.played);
        else push(e.text, ev.player, { t: 'reveal', player: ev.player, cardId: ev.cardId }, DURATION.reveal);
        break;
      case 'damage':
      case 'retaliate': {
        if (!ev.target) break;
        const key = keyOf(ev.target);
        const amount = ev.amount ?? 0;
        push(
          e.text,
          ownerOf(ev.target),
          { t: 'float', key, text: amount > 0 ? `−${amount}` : '0', tone: damageTone(ev.damageKind), flash: 'hit', hpAfter: parseHpAfter(e.text) },
          DURATION.float,
        );
        break;
      }
      case 'heal':
        if (!ev.target) break;
        push(e.text, ownerOf(ev.target), { t: 'float', key: keyOf(ev.target), text: `+${ev.amount ?? 0}`, tone: 'heal', flash: 'heal', hpAfter: parseHpAfter(e.text) }, DURATION.float);
        break;
      case 'shield':
        if (!ev.target && ev.player === undefined) break;
        push(
          e.text,
          ev.player ?? ownerOf(ev.target),
          { t: 'float', key: ev.target ? keyOf(ev.target) : `p${ev.player}`, text: `🛡+${ev.amount ?? 0}`, tone: 'shield', flash: 'heal' },
          DURATION.float,
        );
        break;
      case 'status': {
        if (ev.status === 'coin') {
          // コイン投げ（条件「コインを投げて表なら」）：amount 1＝表、0＝裏
          const heads = (ev.amount ?? 0) > 0;
          push(e.text, ev.player ?? null, { t: 'notice', text: `🪙 コイン投げ：${heads ? '表' : '裏'}`, tone: 'neutral' }, DURATION.notice);
          break;
        }
        // MTG 要素 ○ バッチA：激突（amount 1＝勝ち）・予約（amount＝予約の件数）・引いたときの効果
        if (ev.status === 'clash') {
          push(e.text, ev.player ?? null, { t: 'notice', text: `⚔ 激突：${(ev.amount ?? 0) > 0 ? '勝ち' : '負け'}`, tone: 'neutral' }, DURATION.notice);
          break;
        }
        if (ev.status === 'delayed') {
          push(e.text, ev.player ?? null, { t: 'notice', text: `⏳ 予約（${ev.amount ?? 1}件）`, tone: 'neutral' }, DURATION.notice);
          break;
        }
        if (ev.status === 'drawn') {
          push(e.text, ev.player ?? null, { t: 'notice', text: '✋ 引いたときの効果', tone: 'neutral' }, DURATION.notice);
          break;
        }
        if (!ev.target) break;
        const name = STATUS_NAME[ev.status ?? ''] ?? ev.status ?? '';
        const good = GOOD_STATUS.has(ev.status ?? '');
        const amt = ev.amount && ev.amount > 1 ? ` ${ev.amount}` : '';
        push(e.text, ownerOf(ev.target), { t: 'float', key: keyOf(ev.target), text: `${name}${amt}`, tone: good ? 'good' : 'bad', flash: 'status' }, DURATION.float);
        break;
      }
      case 'summon':
        if (!ev.uid) break;
        push(e.text, ev.player ?? null, { t: 'summon', uid: ev.uid }, DURATION.summon);
        break;
      case 'destroy':
        if (!ev.uid) break;
        push(e.text, ev.player ?? null, { t: 'destroy', uid: ev.uid }, DURATION.destroy);
        break;
      case 'attack':
        if (!ev.source || !ev.target) break;
        push(e.text, ownerOf(ev.source), { t: 'attack', source: keyOf(ev.source), target: keyOf(ev.target), retaliate: false }, DURATION.attack);
        break;
      case 'turnEnd':
      case 'draw':
      case 'energy':
      case 'discard':
        push(e.text, ev.player ?? null, { t: 'tick' }, DURATION.tick);
        break;
      case 'result':
        push(e.text, null, { t: 'tick' }, DURATION.tick);
        break;
    }
  }
  return out;
}

/** 前の盤面にいて今はいないモンスターのうち、破壊の演出があるもの（消える演出のために残す） */
export function findGhosts(prev: GameState, next: GameState, events: BattleEvent[]): { m: battle.Monster; index: number }[] {
  const destroyed = new Set(events.flatMap((e) => (e.show.t === 'destroy' ? [e.show.uid] : [])));
  const out: { m: battle.Monster; index: number }[] = [];
  for (const ps of prev.players) {
    ps.board.forEach((m, index) => {
      if (destroyed.has(m.uid) && !battle.findMonster(next, m.uid)) out.push({ m, index });
    });
  }
  return out;
}
