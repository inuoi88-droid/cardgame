/**
 * ダメージの見込み（決定事項 #137）：行動を、いまの状態のまま試しに解決して、ダメージを受けたもの（対象・巻き込まれたもの・反撃を受けた
 * 攻撃側）ごとに、減る HP（体力）・防いだもの（聖盾・加護・無効化・シールド）・計算の内訳（守備力・やけど・脱力など）・倒れるかを返す。
 * - 見え方の状態（viewFor）のまま使える。相手の手札・山札は隠したままなので、見えていないもの（罠など）は入らない
 * - 乱数は2つの種で試し、結果が変わったものは random（数字は当てにならない）
 * - 選択の途中（pending）で止まったら、そこまでの分
 * 元の状態は書き換えない（applyAction が写しを作る）
 */
import { applyAction } from './apply.ts';
import { findMonster } from './core.ts';
import type { Action, GameState, LogEntry, PlayerId, TargetRef } from './types.ts';

export interface PreviewHit {
  target: TargetRef;
  /** 減った HP（体力） */
  hpLost: number;
  hpBefore: number;
  hpAfter: number;
  /** 受けたダメージ（守備力・やけど・脱力などのあと。シールドが肩代わりした分も含む） */
  dealt: number;
  /** シールドが肩代わりした量（プレイヤー） */
  shieldUsed: number;
  /** 聖盾・加護・無効化で0にした */
  blocked: ('divineShield' | 'protection' | 'nullify')[];
  /** 計算の内訳（1発ごとの「基本N → …」の「…」の部分） */
  steps: string[];
  /** 倒れる（モンスターが場から消える・プレイヤーの HP が0） */
  destroyed: boolean;
  /** 不屈・不壊で踏みとどまる */
  survived?: 'undying' | 'indestructible';
  /** 乱数で結果が変わる（数字は当てにならない） */
  random: boolean;
  /** 付く状態異常（毒・やけど・脱力など。status は StatusKey、amount は量・ターン数・個数） */
  statuses: { status: string; amount: number }[];
}

export interface ActionPreview {
  hits: PreviewHit[];
  /** 乱数を使う行動 */
  random: boolean;
  /** 選択の途中で止まった（そこまでの分） */
  stopped: boolean;
  /** この行動で決着する（勝つプレイヤー。引き分けは null） */
  ends?: { winner: PlayerId | null };
}

const keyOf = (t: TargetRef) => (t.kind === 'player' ? `p${t.player}` : t.uid);
/** 見込みに出す状態異常（相手を弱らせるもの） */
const STATUS_IDS: ReadonlySet<string> = new Set(['poison', 'burn', 'weak', 'vulnerable', 'bleed', 'doom', 'freeze', 'confuse', 'rad']);
const DETAIL = /（基本\d+ → ([^）]+)）/;
/** 種を2つ使う（どちらも 0 と違う値にして、見え方の状態の rng＝0 と区別する） */
const SEEDS = [0x2f6b_1d35, 0x51ac_9e07] as const;

function hpOf(g: GameState, t: TargetRef): number | null {
  if (t.kind === 'player') return g.players[t.player].hp;
  return findMonster(g, t.uid)?.hp ?? null;
}

function collect(before: GameState, after: GameState): Map<string, PreviewHit> {
  const out = new Map<string, PreviewHit>();
  const lines: LogEntry[] = after.log.slice(before.log.length);
  const hitOf = (t: TargetRef): PreviewHit => {
    const k = keyOf(t);
    let h = out.get(k);
    if (!h) {
      const hp = hpOf(before, t) ?? 0;
      h = { target: t, hpLost: 0, hpBefore: hp, hpAfter: hp, dealt: 0, shieldUsed: 0, blocked: [], steps: [], destroyed: false, random: false, statuses: [] };
      out.set(k, h);
    }
    return h;
  };
  for (const line of lines) {
    const ev = line.ev;
    // 破壊の出来事は uid だけを持つ
    const target: TargetRef | undefined = ev?.target ?? (ev?.kind === 'destroy' && ev.uid ? { kind: 'monster', uid: ev.uid } : undefined);
    if (!ev || !target) continue;
    // その行動の前から場にいた（または プレイヤーの）ものだけ（この行動で出たモンスターは見込みに入れない）
    if (target.kind === 'monster' && !findMonster(before, target.uid)) continue;
    if (ev.kind === 'damage' || ev.kind === 'retaliate') {
      // この行動で起きたダメージ（自傷も入れる）
      const h = hitOf(target);
      h.dealt += ev.amount ?? 0;
      const m = DETAIL.exec(line.text);
      if (m) h.steps.push(m[1]!);
      const shield = /シールドが(\d+)を防いだ/.exec(line.text);
      if (shield) h.shieldUsed += Number(shield[1]);
      if (line.text.includes('無効化で0')) h.blocked.push('nullify');
      if (ev.keywordId === 'undying') h.survived = 'undying';
      if (line.text.includes('不壊で')) h.survived = 'indestructible';
    } else if (ev.kind === 'status' && ev.amount === 0 && (ev.status === 'divineShield' || ev.status === 'protection')) {
      hitOf(target).blocked.push(ev.status);
    } else if (ev.kind === 'status' && ev.status && STATUS_IDS.has(ev.status) && (ev.amount ?? 0) > 0) {
      const h = hitOf(target);
      const s = h.statuses.find((x) => x.status === ev.status);
      if (s) s.amount += ev.amount!;
      else h.statuses.push({ status: ev.status, amount: ev.amount! });
    } else if (ev.kind === 'destroy') {
      hitOf(target).destroyed = true;
    }
  }
  for (const h of out.values()) {
    const now = hpOf(after, h.target);
    if (h.target.kind === 'monster' && now === null) {
      // 場から消えた（破壊・バウンスなど）
      h.hpAfter = 0;
      h.destroyed = true;
    } else {
      h.hpAfter = now ?? 0;
      if (h.target.kind === 'player' && h.hpAfter <= 0) h.destroyed = true;
    }
    h.hpLost = Math.max(0, h.hpBefore - h.hpAfter);
  }
  return out;
}

const same = (a: PreviewHit, b: PreviewHit) =>
  a.hpLost === b.hpLost &&
  a.destroyed === b.destroyed &&
  a.dealt === b.dealt &&
  a.blocked.join() === b.blocked.join() &&
  JSON.stringify(a.statuses) === JSON.stringify(b.statuses);

/** 行動の見込み。行動ができなければ null */
export function previewAction(g: GameState, a: Action): ActionPreview | null {
  const runs: { state: GameState; hits: Map<string, PreviewHit> }[] = [];
  for (const seed of SEEDS) {
    const start: GameState = { ...g, rng: seed };
    const r = applyAction(start, a);
    if (!r.ok) return null;
    runs.push({ state: r.state, hits: collect(g, r.state) });
  }
  const [x, y] = runs as [(typeof runs)[0], (typeof runs)[0]];
  const random = x.state.rng !== SEEDS[0] || y.state.rng !== SEEDS[1];
  const keys = new Set([...x.hits.keys(), ...y.hits.keys()]);
  const hits: PreviewHit[] = [];
  for (const k of keys) {
    const h = x.hits.get(k) ?? y.hits.get(k)!;
    const other = x.hits.get(k) && y.hits.get(k) ? y.hits.get(k)! : undefined;
    hits.push({ ...h, random: !other || !same(h, other) });
  }
  const ended = x.state.phase === 'ended' && x.state.result && (!random || (y.state.phase === 'ended' && y.state.result?.winner === x.state.result.winner));
  return {
    hits,
    random,
    stopped: x.state.pending !== null && x.state.pending !== undefined,
    ...(ended ? { ends: { winner: x.state.result!.winner } } : {}),
  };
}
