/**
 * イベント再生の材料：ログの新しい行（構造化イベント ev つき）を、画面の演出1件ずつに変換する純粋関数。
 * 盤面そのものは最新の状態をそのまま表示し、ここで作った演出（バナー・浮かぶ数字・出現・消滅・効果の弾など）を順に重ねる。
 *
 * 決定事項 #126（演出）：
 * - 効果の解決（ev kind 'effect'）は cast になる。出どころ（src）から対象（targets）へ、型（fx/registry.ts）の演出を出す。
 *   続く深い行（ダメージ・回復・状態など）は同じ組（group）で、着弾として同時に近いタイミングで出す（fx/timeline.ts）。
 * - 相手がカードを使ったら reveal（手札から飛んで見える → 対象に照準 aim → 対象へ飛ぶ）。aim は同じ行動の最初の効果の対象か、出たモンスター。
 * - 浮かぶ文字に絵文字は使わない（形は gi。UI2）。
 * - 見える情報（viewFor の結果のログ）だけを使う。
 */
import { battle, FIELDS, getKeyword, isFieldId, TRIBE_SETS, TRIBE_TRAITS, type CardDef } from '../../engine/index.ts';
import { elementOf } from './fx/element.ts';
import { ARCH_GI, fxOf, statusFx, TRIBE_FX, type FxArch, type FxElement } from './fx/registry.ts';

type GameState = battle.GameState;
type LogEntry = battle.LogEntry;
type PlayerId = battle.PlayerId;
type TargetRef = battle.TargetRef;

/** 浮かぶ数字の色分け */
export type FxTone = 'damage' | 'poison' | 'burn' | 'retaliate' | 'heal' | 'shield' | 'bad' | 'good';

/**
 * 演出の対象を指す鍵：プレイヤーは p0 / p1、モンスター・パワーは uid、
 * 使ったカード（見せたカードの位置・自分の手札）は card:<プレイヤー>、見出しの札は field / dayNight
 */
export type FxKey = string;

export const keyOf = (t: TargetRef): FxKey => (t.kind === 'player' ? `p${t.player}` : t.uid);
export const cardKey = (p: PlayerId): FxKey => `card:${p}`;

/** カードの移動の演出（山札→手札・手札→捨て札 など） */
export type ZoneShow = battle.ZoneMove | 'draw' | 'discard';

export type Show =
  | { t: 'turn'; player: PlayerId; turn: number | null; extra?: boolean }
  /**
   * 相手がカードを使った：手札から飛んで見せ、対象（aim）に照準を付けてから飛んでいく。
   * land はモンスターの出る場所（あればそこへ、無ければ最初の対象へ飛ぶ）
   */
  | { t: 'reveal'; player: PlayerId; cardId: string; aim: FxKey[]; land?: FxKey; abilityId?: string }
  /** 自分がカードを使った：対象に短く照準を出すだけ */
  | { t: 'played'; player: PlayerId; cardId: string; aim: FxKey[]; land?: FxKey; abilityId?: string }
  | {
      t: 'float';
      key: FxKey;
      text: string;
      tone: FxTone;
      flash: 'hit' | 'heal' | 'status';
      hpAfter?: number;
      /** 文字の前の形（game-icons の名前） */
      gi?: string;
      /** 当たったときの色 */
      el?: FxElement;
      /** 着弾の型（状態なら上向き・下向きの山形など） */
      arch?: FxArch;
      /** 量（ダメージ・回復。合図の大きさ） */
      amount?: number;
      /** 聖盾・加護が防いだ（割れる輪） */
      blocked?: boolean;
      /** プレイヤーへのダメージをシールドが全部受け止めた（HP は減っていない。効果音の選び分け：決定事項 #127） */
      guard?: boolean;
      /** 得たキーワード（効果音の選び分け：決定事項 #127） */
      keyword?: string;
    }
  | { t: 'summon'; uid: string; token?: boolean }
  | { t: 'destroy'; uid: string; power?: boolean; player?: PlayerId }
  | { t: 'attack'; source: FxKey; target: FxKey; retaliate: boolean; kind?: 'fight' | 'infight' }
  /** 起動（MTG 要素 ○ バッチC1）：起動したモンスター・パワー（key）を光らせ、短い見出しを出す */
  | { t: 'activate'; key: FxKey; player: PlayerId; cardId: string; gi?: string }
  /** 中央の小さな通知（不発など）。key があれば、それ（パワーの札など）も光らせる */
  | { t: 'notice'; text: string; tone: 'mine' | 'enemy' | 'neutral'; key?: FxKey; gi?: string }
  /** 効果・デメリット・キーワードが働いた（決定事項 #126）。src から targets へ、id の型の演出 */
  | { t: 'cast'; player: PlayerId; kind: 'effect' | 'drawback' | 'keyword'; id: string; src: FxKey | null; targets: FxKey[]; cardId?: string; el: FxElement; arch: FxArch; gi: string }
  /** カードの移動（引いた・捨てた・切削・手札に戻った・奪った） */
  | { t: 'zone'; player: PlayerId; move: ZoneShow; n: number; uid?: string }
  /** エナジーが増えた（増えた量。ターン開始の補充は 0：宝石が光るだけ） */
  | { t: 'energy'; player: PlayerId; n: number }
  /** 盤面の色（フィールド・昼と夜） */
  | { t: 'tint'; what: 'field' | 'day' | 'night'; key: FxKey }
  /** ティッカーの更新だけ */
  | { t: 'tick' };

export interface BattleEvent {
  id: number;
  text: string;
  /** 誰の行動か（色分け用。分からなければ null） */
  player: PlayerId | null;
  show: Show;
  /** 次の出来事までの間（ミリ秒）。fx/timeline.ts が組ごとに詰める */
  ms: number;
  /** 同じ効果・攻撃の組（cast・attack とその着弾）。無ければ単独 */
  group?: number;
}

/** 表示時間の目安（1件だけで出したときの次までの間。組の中は fx/timeline.ts が詰める） */
export const DURATION = {
  turn: 800,
  reveal: 920,
  played: 260,
  float: 420,
  summon: 420,
  destroy: 420,
  attack: 260,
  activate: 560,
  notice: 650,
  cast: 260,
  zone: 320,
  energy: 300,
  tint: 520,
  tick: 40,
} as const;

/** ダメージの行の「シールドがNを防いだ」で、量（amount）を全部受け止めたか */
export function shieldTookAll(text: string, amount: number): boolean {
  const m = /シールドが(\d+)を防いだ/.exec(text);
  return !!m && amount > 0 && Number(m[1]) >= amount;
}

/** 「HP 940→800」「体力 20→8」から後の値を読む（HP バーの追従に使う。読めなければ undefined） */
export function parseHpAfter(text: string): number | undefined {
  const m = /(?:HP|体力) (\d+)→(\d+)/.exec(text);
  return m ? Number(m[2]) : undefined;
}

function parseTurn(text: string): number | null {
  const m = /（(\d+)ターン目）/.exec(text);
  return m ? Number(m[1]) : null;
}

function damageTone(kind: battle.DamageKind | undefined): FxTone {
  switch (kind) {
    case 'poison':
    case 'doom':
    case 'rad':
    case 'fatigue':
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

/** ダメージの種類で決まる色（毒・やけどなど）。決まらなければ null（組の色） */
function damageElement(kind: battle.DamageKind | undefined): FxElement | null {
  switch (kind) {
    case 'poison':
    case 'rad':
      return 'poison';
    case 'burn':
      return 'fire';
    case 'doom':
    case 'fatigue':
      return 'shadow';
    case 'self':
      return 'blood';
    case 'attack':
    case 'retaliate':
    case 'trample':
    case 'counter':
      return 'physical';
    default:
      return null;
  }
}

/** 待機ゾーンに置いたときの浮かぶ文字（MTG 要素 △ バッチC） */
const WAITING_LABEL: Record<string, string> = { foretell: '予顕', plot: '計画', suspend: '待機', warp: 'ワープ', adventure: '出来事' };

/** 場に残っているパワーか（パワーの札を光らせる） */
const hasPower = (view: GameState, uid: string): boolean => view.players.some((ps) => [...ps.powers, ...(ps.emblems ?? [])].some((pw) => pw.uid === uid));

/** 攻撃力・体力・守備力の変化を短い文字に（「攻+20 体+20」） */
function deltaText(d: { attack?: number; hp?: number; defense?: number } | undefined): { text: string; up: boolean } | null {
  if (!d) return null;
  const parts: string[] = [];
  let sum = 0;
  const add = (label: string, n: number | undefined) => {
    if (!n) return;
    sum += n;
    parts.push(`${label}${n > 0 ? '+' : '−'}${Math.abs(n)}`);
  };
  add('攻', d.attack);
  add('体', d.hp);
  add('守', d.defense);
  return parts.length ? { text: parts.join(' '), up: sum >= 0 } : null;
}

interface Ctx {
  depth: number;
  group: number;
  el: FxElement;
  /** 使ったカードの行動（このあとの出どころの無い効果は card:<p> から） */
  play?: PlayerId;
  /**
   * 同じ深さの続きも組に入れる（ターン開始・終了時のデメリット・キーワードは、見出しの行と結果の行が同じ深さ）。
   * 次の見出し（効果・デメリット・キーワード・行動）で終わる
   */
  sameDepth?: boolean;
}

/** 新しい組を始める出来事（同じ深さの組を終わらせる） */
const HEAD_KINDS: ReadonlySet<string> = new Set(['effect', 'drawback', 'keyword', 'play', 'attack', 'turnStart', 'turnEnd', 'activate', 'energy', 'draw']);

/** ログの行を演出に変える。演出にならない行（効果の説明文など）は省く */
export function buildEvents(entries: LogEntry[], view: GameState, me: PlayerId, firstId: number): BattleEvent[] {
  const out: BattleEvent[] = [];
  let id = firstId;
  let groupSeq = 0;
  const stack: Ctx[] = [];
  const ctx = (): Ctx | undefined => stack[stack.length - 1];
  const push = (text: string, player: PlayerId | null, show: Show, ms: number, group?: number) =>
    out.push({ id: id++, text, player, show, ms, ...(group !== undefined ? { group } : {}) });
  const ownerOf = (t: TargetRef | undefined): PlayerId | null => {
    if (!t) return null;
    if (t.kind === 'player') return t.player;
    return battle.findMonster(view, t.uid)?.controller ?? null;
  };
  const tone = (p: PlayerId | undefined): 'mine' | 'enemy' | 'neutral' => (p === undefined ? 'neutral' : p === me ? 'mine' : 'enemy');
  const def = (cardId: string | undefined): CardDef | undefined => (cardId ? view.cards[cardId] : undefined);
  /** 行動（play）のあとに続く深い行から、照準の対象（最初の効果の対象）と、出たモンスター（land）を探す */
  const aimFrom = (i: number): { aim: FxKey[]; land?: FxKey } => {
    const base = entries[i]!.depth;
    let land: string | undefined;
    for (let j = i + 1; j < entries.length && entries[j]!.depth > base; j++) {
      const ev = entries[j]!.ev;
      if (ev?.kind === 'summon' && ev.uid && land === undefined) land = ev.uid;
      if (ev?.kind === 'effect' && ev.targets && ev.targets.length > 0) {
        const aim = [...new Set(ev.targets.map(keyOf))].filter((k) => k !== land).slice(0, 8);
        return { aim, ...(land ? { land } : {}) };
      }
    }
    return { aim: [], ...(land ? { land } : {}) };
  };

  entries.forEach((e, index) => {
    // 組の文脈：この行より浅いか同じ深さの組は終わり（同じ深さを続ける組は、次の見出しまで）
    while (stack.length > 0) {
      const c = ctx()!;
      if (c.depth < e.depth) break;
      if (c.depth === e.depth && c.sameDepth && !(e.ev && HEAD_KINDS.has(e.ev.kind))) break;
      stack.pop();
    }
    const ev = e.ev;
    const group = ctx()?.group;
    if (!ev) {
      if (e.text.includes('を満たさないため発動しない')) push('条件を満たさず不発', null, { t: 'notice', text: '条件を満たさず不発', tone: 'neutral', gi: 'cancel' }, DURATION.notice);
      else if (e.kind === 'action' || e.kind === 'result') push(e.text, null, { t: 'tick' }, DURATION.tick * 2);
      return;
    }
    switch (ev.kind) {
      case 'turnStart':
        push(e.text, ev.player ?? null, { t: 'turn', player: ev.player ?? 0, turn: parseTurn(e.text), ...(ev.extra ? { extra: true } : {}) }, DURATION.turn);
        break;
      case 'play': {
        if (ev.player === undefined || !ev.cardId) break;
        const at = aimFrom(index);
        const extra = ev.abilityId ? { abilityId: ev.abilityId } : {};
        if (ev.player === me) push(e.text, ev.player, { t: 'played', player: ev.player, cardId: ev.cardId, ...at, ...extra }, DURATION.played);
        else push(e.text, ev.player, { t: 'reveal', player: ev.player, cardId: ev.cardId, ...at, ...extra }, DURATION.reveal);
        stack.push({ depth: e.depth, group: ++groupSeq, el: 'arcane', play: ev.player });
        break;
      }
      // 効果・デメリット・キーワード（決定事項 #126）
      case 'effect':
      case 'drawback':
      case 'keyword': {
        const kind = ev.kind;
        const rid = kind === 'effect' ? ev.effectId : kind === 'drawback' ? ev.drawbackId : ev.keywordId;
        if (!rid) break;
        const spec = fxOf(kind, rid);
        const parentPlay = ctx()?.play;
        const player = (ev.player ?? ownerOf(ev.target ?? ev.source)) as PlayerId | null;
        if (player === null) break;
        // 出どころ：場のモンスター → パワー（の札）→ 使ったカード → プレイヤーの枠
        let src: FxKey | null = null;
        if (ev.source) src = keyOf(ev.source);
        else if (ev.uid && (battle.findMonster(view, ev.uid) || hasPower(view, ev.uid))) src = ev.uid;
        else if (kind === 'keyword' && ev.target) src = keyOf(ev.target);
        else if (parentPlay !== undefined && parentPlay === player && kind === 'effect') src = cardKey(player);
        else src = `p${player}`;
        const targets = kind === 'keyword' ? (ev.target && ev.source ? [keyOf(ev.target)] : []) : (ev.targets ?? []).map(keyOf);
        const el = elementOf(spec, def(ev.cardId));
        const g = ++groupSeq;
        push(e.text, player, { t: 'cast', player, kind, id: rid, src, targets: [...new Set(targets)], ...(ev.cardId ? { cardId: ev.cardId } : {}), el, arch: spec.arch, gi: spec.gi }, DURATION.cast, g);
        // ターン開始・終了時のデメリット・キーワード（turn.ts の tagLog）は、結果の行が同じ深さに続く
        stack.push({ depth: e.depth, group: g, el, ...(kind !== 'effect' && e.kind !== 'action' ? { sameDepth: true } : {}) });
        break;
      }
      // MTG 要素 ○ バッチC1：起動（モンスターはそのタイル、パワーはプレイヤーの枠を光らせる）・サイクリング・魂力
      case 'activate': {
        if (ev.player === undefined || !ev.cardId || !ev.uid) break;
        // パワーは札そのもの（data-fx＝パワーの uid）を光らせる。見つからなければプレイヤーの枠
        const key = battle.findMonster(view, ev.uid) || hasPower(view, ev.uid) ? ev.uid : `p${ev.player}`;
        push(e.text, ev.player, { t: 'activate', key, player: ev.player, cardId: ev.cardId, gi: fxOf('ability', 'activate').gi }, DURATION.activate);
        stack.push({ depth: e.depth, group: ++groupSeq, el: 'arcane' });
        break;
      }
      case 'handAbility': {
        if (ev.player === undefined || !ev.cardId) break;
        const abilityId = ev.status === 'cycling' ? 'cycling' : ev.status === 'forecast' ? 'forecast' : 'channel';
        const label = abilityId === 'cycling' ? 'サイクリング' : abilityId === 'forecast' ? '予見' : '魂力';
        // 相手の魂力・予見（△ バッチB）はカードを見せる（効果が出る）。サイクリングと自分の分は見出しだけ
        if (ev.player !== me && abilityId !== 'cycling' && view.cards[ev.cardId]) {
          push(e.text, ev.player, { t: 'reveal', player: ev.player, cardId: ev.cardId, ...aimFrom(index), abilityId }, DURATION.reveal);
          stack.push({ depth: e.depth, group: ++groupSeq, el: 'arcane', play: ev.player });
        } else push(e.text, ev.player, { t: 'notice', text: label, tone: tone(ev.player), gi: fxOf('ability', abilityId).gi }, DURATION.notice);
        break;
      }
      // MTG 要素 △ バッチB：捨て札のカードの能力（相続・発掘・不朽）。相手の相続はカードを見せる
      case 'discardAbility': {
        if (ev.player === undefined || !ev.cardId) break;
        const abilityId = ev.status === 'renew' ? 'renew' : ev.status === 'dredge' ? 'dredge' : 'embalm';
        const label = abilityId === 'renew' ? '相続' : abilityId === 'dredge' ? '発掘' : '不朽';
        if (ev.player !== me && abilityId === 'renew' && view.cards[ev.cardId]) {
          push(e.text, ev.player, { t: 'reveal', player: ev.player, cardId: ev.cardId, ...aimFrom(index), abilityId }, DURATION.reveal);
          stack.push({ depth: e.depth, group: ++groupSeq, el: 'arcane', play: ev.player });
        } else push(e.text, ev.player, { t: 'notice', text: label, tone: tone(ev.player), gi: fxOf('ability', abilityId).gi }, DURATION.notice);
        break;
      }
      // MTG 要素 ○ バッチC2：速度・王冠（プレイヤーの枠に浮かぶ文字）、英雄譚の章・蓄積がたまった（見出し）
      case 'speed':
        if (ev.player === undefined) break;
        push(e.text, ev.player, { t: 'float', key: `p${ev.player}`, text: `速度${ev.amount ?? ''}`, tone: 'good', flash: 'status', gi: 'checkered-flag', arch: 'buff' }, DURATION.float, group);
        break;
      case 'crown':
        if (ev.player === undefined) break;
        push(e.text, ev.player, { t: 'float', key: `p${ev.player}`, text: '王冠', tone: 'good', flash: 'status', gi: 'crown', arch: 'buff', el: 'holy' }, DURATION.float, group);
        push(e.text, ev.player, { t: 'notice', text: `王冠は${ev.player === me ? 'あなた' : '相手'}に`, tone: tone(ev.player), gi: 'crown' }, DURATION.notice);
        break;
      case 'saga': {
        if (ev.player === undefined) break;
        const name = def(ev.cardId)?.name ?? '';
        push(
          e.text,
          ev.player,
          { t: 'notice', text: `${name ? `『${name}』` : '英雄譚'} 第${ev.amount ?? ''}章`, tone: tone(ev.player), gi: 'open-book', ...(ev.uid && hasPower(view, ev.uid) ? { key: ev.uid } : {}) },
          DURATION.notice,
        );
        break;
      }
      case 'charge':
        if (ev.player === undefined) break;
        // たまりきったとき（効果が出る）だけ見出し。1つたまるのはティッカーだけ
        if (e.kind === 'effect')
          push(e.text, ev.player, { t: 'notice', text: '蓄積がたまった', tone: tone(ev.player), gi: fxOf('ability', 'charge').gi, ...(ev.uid && hasPower(view, ev.uid) ? { key: ev.uid } : {}) }, DURATION.notice);
        else push(e.text, ev.player, { t: 'tick' }, DURATION.tick);
        break;
      // MTG 要素 △ バッチC：待機ゾーン・表にする・Lv・忠誠・達成・特殊勝利
      case 'waiting': {
        if (ev.player === undefined) break;
        if (ev.status === 'tick') {
          // 待機の残りが減っただけならティッカー、0になって使われるときは見出し
          if ((ev.amount ?? 1) === 0) push(e.text, ev.player, { t: 'notice', text: '待機が明けた：無料で使う', tone: tone(ev.player), gi: 'hourglass' }, DURATION.notice);
          else push(e.text, ev.player, { t: 'tick' }, DURATION.tick);
          break;
        }
        const label = WAITING_LABEL[ev.status ?? ''] ?? '待機ゾーンへ';
        push(e.text, ev.player, { t: 'float', key: `p${ev.player}`, text: label, tone: 'good', flash: 'status', gi: fxOf('ability', ev.status).gi, arch: 'move' }, DURATION.float, group);
        break;
      }
      case 'reveal': {
        if (ev.player === undefined || !ev.cardId) break;
        // 相手が表にした：カードを見せる。場を離れて正体が分かった・自分が表にした：見出し
        if (e.kind === 'action' && ev.player !== me && view.cards[ev.cardId]) {
          push(e.text, ev.player, { t: 'reveal', player: ev.player, cardId: ev.cardId, ...aimFrom(index), ...(ev.uid ? { land: ev.uid } : {}) }, DURATION.reveal);
          stack.push({ depth: e.depth, group: ++groupSeq, el: 'arcane', play: ev.player });
        } else if (e.kind === 'action' && ev.uid && battle.findMonster(view, ev.uid))
          push(e.text, ev.player, { t: 'activate', key: ev.uid, player: ev.player, cardId: ev.cardId, gi: 'domino-mask' }, DURATION.activate);
        else push(e.text, ev.player, { t: 'notice', text: `正体：${def(ev.cardId)?.name ?? '？'}`, tone: 'neutral', gi: 'domino-mask' }, DURATION.notice);
        break;
      }
      case 'level':
      case 'loyalty': {
        if (ev.player === undefined || !ev.uid) break;
        const key = battle.findMonster(view, ev.uid) || hasPower(view, ev.uid) ? ev.uid : `p${ev.player}`;
        if (e.kind === 'action' && ev.cardId) {
          push(e.text, ev.player, { t: 'activate', key, player: ev.player, cardId: ev.cardId, gi: fxOf('ability', ev.kind === 'level' ? 'levelUp' : 'loyalty').gi }, DURATION.activate);
          if (ev.kind === 'level' && battle.findMonster(view, ev.uid))
            push(e.text, ev.player, { t: 'float', key: ev.uid, text: `Lv${ev.amount ?? ''}`, tone: 'good', flash: 'status', gi: 'level-three', arch: 'buff', el: 'holy' }, DURATION.float);
        } else
          push(e.text, ev.player, { t: 'notice', text: `忠誠 ${ev.amount ?? ''}`, tone: tone(ev.player), gi: fxOf('ability', 'loyalty').gi, ...(hasPower(view, ev.uid) ? { key: ev.uid } : {}) }, DURATION.notice);
        break;
      }
      case 'achieve': {
        if (ev.player === undefined || !ev.uid) break;
        if (battle.findMonster(view, ev.uid)) push(e.text, ev.player, { t: 'float', key: ev.uid, text: '進化', tone: 'good', flash: 'status', gi: 'laurels', arch: 'buff', el: 'holy' }, DURATION.float);
        else push(e.text, ev.player, { t: 'notice', text: '事件を解明した', tone: tone(ev.player), gi: 'laurels', ...(hasPower(view, ev.uid) ? { key: ev.uid } : {}) }, DURATION.notice);
        break;
      }
      // MTG 要素 △ バッチD：フィールドが変わった・昼と夜が変わった（見出しの札を光らせ、盤面を少し染める）
      case 'field': {
        const f = isFieldId(ev.status) ? FIELDS[ev.status] : undefined;
        if (!f) break;
        push(e.text, ev.player ?? null, { t: 'tint', what: 'field', key: 'field' }, DURATION.tint, group);
        push(e.text, ev.player ?? null, { t: 'notice', text: `フィールド：${f.name}`, tone: tone(ev.player), key: 'field', gi: f.art.replace(/^gi:/, '') }, DURATION.notice);
        break;
      }
      case 'dayNight': {
        const night = ev.status === 'night';
        push(e.text, null, { t: 'tint', what: night ? 'night' : 'day', key: 'dayNight' }, DURATION.tint);
        push(e.text, null, { t: 'notice', text: night ? '夜になった' : '昼になった', tone: 'neutral', key: 'dayNight', gi: night ? 'moon' : 'sun' }, DURATION.notice);
        break;
      }
      case 'altWin': {
        if (ev.player === undefined) break;
        if (e.kind === 'effect') push(e.text, ev.player, { t: 'notice', text: '特殊勝利の目標を達成！', tone: tone(ev.player), gi: 'trophy-cup' }, DURATION.notice);
        else push(e.text, ev.player, { t: 'tick' }, DURATION.tick);
        break;
      }
      case 'damage':
      case 'retaliate': {
        if (!ev.target) break;
        const key = keyOf(ev.target);
        const amount = ev.amount ?? 0;
        const el = damageElement(ev.damageKind) ?? ctx()?.el ?? 'physical';
        const cause = ev.drawbackId ? fxOf('drawback', ev.drawbackId).gi : ev.keywordId ? fxOf('keyword', ev.keywordId).gi : undefined;
        push(
          e.text,
          ownerOf(ev.target),
          {
            t: 'float',
            key,
            text: amount > 0 ? `−${amount}` : '0',
            tone: damageTone(ev.damageKind),
            flash: 'hit',
            hpAfter: parseHpAfter(e.text),
            el,
            arch: 'bolt',
            amount,
            ...(cause ? { gi: cause } : {}),
            ...(shieldTookAll(e.text, amount) ? { guard: true } : {}),
          },
          DURATION.float,
          group,
        );
        break;
      }
      case 'heal':
        if (!ev.target) break;
        push(
          e.text,
          ownerOf(ev.target),
          {
            t: 'float',
            key: keyOf(ev.target),
            text: `+${ev.amount ?? 0}`,
            tone: 'heal',
            flash: 'heal',
            hpAfter: parseHpAfter(e.text),
            el: ev.keywordId === 'lifelink' ? 'blood' : 'holy',
            arch: 'heal',
            amount: ev.amount ?? 0,
            ...(ev.keywordId ? { gi: fxOf('keyword', ev.keywordId).gi } : ev.status === 'regen' ? { gi: 'regeneration' } : {}),
          },
          DURATION.float,
          group,
        );
        break;
      case 'shield':
        if (!ev.target && ev.player === undefined) break;
        push(
          e.text,
          ev.player ?? ownerOf(ev.target),
          { t: 'float', key: ev.target ? keyOf(ev.target) : `p${ev.player}`, text: `+${ev.amount ?? 0}`, tone: 'shield', flash: 'heal', gi: 'energy-shield', arch: 'ward', el: 'holy', amount: ev.amount ?? 0 },
          DURATION.float,
          group,
        );
        break;
      // 攻撃力・体力・守備力・キーワード・封印などの変化（決定事項 #126）
      case 'stat': {
        if (!ev.target) break;
        const key = keyOf(ev.target);
        const d = deltaText(ev.delta);
        const st = statusFx(ev.status);
        if (ev.keywordId) {
          const k = fxOf('keyword', ev.keywordId);
          push(e.text, ownerOf(ev.target), { t: 'float', key, text: `+${getKeyword(ev.keywordId)?.name ?? ev.keywordId}`, tone: 'good', flash: 'status', gi: k.gi, arch: 'buff', el: 'holy', keyword: ev.keywordId }, DURATION.float, group);
        } else if (d) {
          push(e.text, ownerOf(ev.target), { t: 'float', key, text: d.text, tone: d.up ? 'good' : 'bad', flash: 'status', gi: d.up ? 'upgrade' : 'shattered-sword', arch: d.up ? 'buff' : 'debuff', el: d.up ? 'holy' : 'shadow' }, DURATION.float, group);
        } else if (st) {
          const good = st.arch === 'buff' || st.arch === 'heal' || st.arch === 'ward';
          push(e.text, ownerOf(ev.target), { t: 'float', key, text: st.label, tone: good ? 'good' : 'bad', flash: 'status', gi: st.gi, arch: st.arch, el: st.el === 'auto' ? 'arcane' : st.el }, DURATION.float, group);
        }
        break;
      }
      case 'status': {
        const st = statusFx(ev.status);
        if (ev.status === 'coin') {
          // コイン投げ（条件「コインを投げて表なら」）：amount 1＝表、0＝裏
          push(e.text, ev.player ?? null, { t: 'notice', text: `コイン投げ：${(ev.amount ?? 0) > 0 ? '表' : '裏'}`, tone: 'neutral', gi: 'coins' }, DURATION.notice);
          break;
        }
        // MTG 要素 ○ バッチA：激突（amount 1＝勝ち）・予約（amount＝予約の件数）・引いたときの効果
        if (ev.status === 'clash') {
          push(e.text, ev.player ?? null, { t: 'notice', text: `激突：${(ev.amount ?? 0) > 0 ? '勝ち' : '負け'}`, tone: 'neutral', gi: st!.gi }, DURATION.notice);
          break;
        }
        if (ev.status === 'delayed') {
          push(e.text, ev.player ?? null, { t: 'notice', text: `予約（${ev.amount ?? 1}件）`, tone: 'neutral', gi: st!.gi }, DURATION.notice);
          break;
        }
        if (ev.status === 'drawn' || ev.status === 'rebound') {
          push(e.text, ev.player ?? null, { t: 'notice', text: ev.status === 'drawn' ? '引いたときの効果' : '反復：もう一度発動', tone: 'neutral', gi: st!.gi }, DURATION.notice);
          break;
        }
        // MTG 要素 ○ バッチB：封殺で無効（カードの出来事）
        if (ev.status === 'quash' && !ev.target) {
          push(e.text, ev.player ?? null, { t: 'notice', text: '封殺：無効になった', tone: 'neutral', gi: st!.gi }, DURATION.notice);
          break;
        }
        // MTG 要素 △ バッチA：罠・パワーが相手の攻撃に反応した（パワーの札を光らせる）
        if ((ev.status === 'trap' || ev.status === 'enemyAttacked') && ev.player !== undefined) {
          push(e.text, ev.player, { t: 'notice', text: st!.label, tone: tone(ev.player), gi: st!.gi, ...(ev.uid && hasPower(view, ev.uid) ? { key: ev.uid } : {}) }, DURATION.notice);
          break;
        }
        // MTG 要素 △ バッチB：血の支払い（プレイヤーの HP が減る）・最悪の二択（選ばれたモード）
        if (ev.status === 'lifePay' && ev.player !== undefined) {
          push(e.text, ev.player, { t: 'float', key: `p${ev.player}`, text: `−${ev.amount ?? 0}`, tone: 'bad', flash: 'hit', hpAfter: parseHpAfter(e.text), gi: st!.gi, el: 'blood', arch: 'bolt', amount: ev.amount ?? 0 }, DURATION.float, group);
          break;
        }
        if (ev.status === 'villain' && ev.player !== undefined) {
          const label = (ev.amount ?? 0) > 0 ? ['', 'A', 'B', 'C'][ev.amount ?? 0] : '';
          push(e.text, ev.player, { t: 'notice', text: `最悪の二択：${ev.player === me ? 'あなた' : '相手'}がモード${label}を選んだ`, tone: 'neutral', gi: st!.gi }, DURATION.notice);
          break;
        }
        // 聖盾・加護が防いだ（輪が割れる）
        if ((ev.status === 'divineShield' || ev.status === 'protection') && ev.target && (ev.amount ?? 0) === 0) {
          push(e.text, ownerOf(ev.target), { t: 'float', key: keyOf(ev.target), text: '防いだ', tone: 'shield', flash: 'heal', gi: st!.gi, arch: 'ward', el: 'holy', blocked: true }, DURATION.float, group);
          break;
        }
        // プレイヤーの出来事（知らせ）
        const PLAYER_NOTICE = new Set(['discarded', 'ice', 'rad', 'exileMill', 'pitch', 'extraTurn', 'swapHp', 'heist', 'emblem', 'siegeWon', 'manifest', 'fatigue']);
        if (!ev.target && ev.status && PLAYER_NOTICE.has(ev.status) && st) {
          push(e.text, ev.player ?? null, { t: 'notice', text: `${st.label}${ev.amount && ev.amount > 1 ? `（${ev.amount}）` : ''}`, tone: 'neutral', gi: st.gi }, DURATION.notice);
          break;
        }
        if (!ev.target) break;
        const name = st?.label ?? ev.status ?? '';
        const arch = st?.arch ?? 'debuff';
        const good = arch === 'buff' || arch === 'heal' || arch === 'ward';
        const amt = ev.amount && ev.amount > 1 ? ` ${ev.amount}` : '';
        push(
          e.text,
          ownerOf(ev.target),
          { t: 'float', key: keyOf(ev.target), text: `${name}${amt}`, tone: good ? 'good' : 'bad', flash: 'status', gi: st?.gi ?? ARCH_GI[arch], arch, el: st && st.el !== 'auto' ? st.el : 'arcane' },
          DURATION.float,
          group,
        );
        break;
      }
      // 種族（決定事項 #143）：特性はそのモンスター、揃いはプレイヤーの枠に名前を浮かべる
      case 'tribe': {
        if (!ev.tribe) break;
        const spec = TRIBE_FX[ev.tribe];
        const name = (ev.status === 'set' ? TRIBE_SETS : TRIBE_TRAITS)[ev.tribe].name;
        const key = ev.target ? keyOf(ev.target) : ev.player !== undefined ? `p${ev.player}` : null;
        if (!key) break;
        const owner = ev.target ? ownerOf(ev.target) : (ev.player ?? null);
        push(e.text, owner, { t: 'float', key, text: name, tone: spec.arch === 'debuff' ? 'bad' : 'good', flash: 'status', gi: spec.gi, arch: spec.arch, el: spec.el === 'auto' ? 'arcane' : spec.el }, DURATION.float, group);
        break;
      }
      case 'summon':
        if (!ev.uid) break;
        push(e.text, ev.player ?? null, { t: 'summon', uid: ev.uid, ...(isTokenCard(view, ev.uid) ? { token: true } : {}) }, DURATION.summon, group);
        break;
      case 'destroy':
        if (!ev.uid) break;
        push(e.text, ev.player ?? null, { t: 'destroy', uid: ev.uid, ...(ev.player !== undefined ? { player: ev.player } : {}), ...(ev.cardId && view.cards[ev.cardId]?.stats ? {} : { power: true }) }, DURATION.destroy, group);
        break;
      case 'attack': {
        if (!ev.source || !ev.target) break;
        const g = ++groupSeq;
        const kind = ev.status === 'fight' || ev.status === 'infight' ? ev.status : undefined;
        push(e.text, ownerOf(ev.source), { t: 'attack', source: keyOf(ev.source), target: keyOf(ev.target), retaliate: false, ...(kind ? { kind } : {}) }, DURATION.attack, g);
        stack.push({ depth: e.depth, group: g, el: 'physical' });
        break;
      }
      case 'draw':
        if (ev.player === undefined) break;
        push(e.text, ev.player, { t: 'zone', player: ev.player, move: 'draw', n: ev.amount ?? 1 }, DURATION.zone, group);
        break;
      case 'discard':
        if (ev.player === undefined) break;
        push(e.text, ev.player, { t: 'zone', player: ev.player, move: 'discard', n: ev.amount ?? 1 }, DURATION.zone, group);
        break;
      case 'zone':
        if (ev.player === undefined || !ev.status) break;
        push(e.text, ev.player, { t: 'zone', player: ev.player, move: ev.status as battle.ZoneMove, n: ev.amount ?? 1, ...(ev.uid ? { uid: ev.uid } : {}) }, DURATION.zone, group);
        break;
      case 'energy':
        if (ev.player === undefined) break;
        // 効果で増えた（gain・ramp）は宝石の脈動と数字。ターン開始の補充は宝石が光るだけ（間を取らない）
        if (ev.status === 'gain' || ev.status === 'ramp') push(e.text, ev.player, { t: 'energy', player: ev.player, n: ev.status === 'gain' ? (ev.amount ?? 0) : 1 }, DURATION.energy, group);
        else push(e.text, ev.player, { t: 'energy', player: ev.player, n: 0 }, DURATION.tick, group);
        break;
      case 'turnEnd':
        push(e.text, ev.player ?? null, { t: 'tick' }, DURATION.tick);
        break;
      case 'result':
        push(e.text, null, { t: 'tick' }, DURATION.tick);
        break;
    }
  });
  return out;
}

const isTokenCard = (view: GameState, uid: string): boolean => battle.findMonster(view, uid)?.card.token !== undefined;

/** 前の盤面にいて今はいないモンスターのうち、破壊・手札に戻る演出があるもの（消える演出のために残す） */
export function findGhosts(prev: GameState, next: GameState, events: BattleEvent[]): { m: battle.Monster; index: number }[] {
  const gone = new Set(events.flatMap((e) => (e.show.t === 'destroy' ? [e.show.uid] : e.show.t === 'zone' && (e.show.move === 'bounce' || e.show.move === 'exile') && e.show.uid ? [e.show.uid] : [])));
  const out: { m: battle.Monster; index: number }[] = [];
  for (const ps of prev.players) {
    ps.board.forEach((m, index) => {
      if (gone.has(m.uid) && !battle.findMonster(next, m.uid)) out.push({ m, index });
    });
  }
  return out;
}
