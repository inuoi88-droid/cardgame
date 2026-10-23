/**
 * ログ1行を色分け用の断片に分ける純粋関数（DOM を使わない。tests/battle/logFormat.test.ts）。
 * - カード名：エンジンのログはカード名を「」（パワーは『』）で囲む。中身が知っているカード名のときだけカード名にする
 *   （「条件「…」を満たさない」のような、カード名でない「」は普通の文字のまま）。
 *   行の頭の「カード名：」「カード名のデメリット：」（効果の出どころ）も、知っているカード名ならカード名にする
 * - プレイヤー名：後ろに助詞（の・は・に・が・を・と）や区切りが続くときだけ（名前が他の言葉の一部に当たらないように）
 * - 数：「12ダメージ」の 12 は damage、「12回復」の 12 は heal、それ以外の数は plain
 */
import { FIELDS, LEADERS, type battle } from '../../engine/index.ts';

/** リーダー・フィールドの名前の前の絵文字（エンジンのログの文。画面では形に揃えて絵文字を出さない：UI2 の統合） */
const OPTION_ICON_NAMES: [string, string][] = [...Object.values(LEADERS), ...Object.values(FIELDS)]
  .filter((x) => x.icon && x.name)
  .flatMap((x) => [[`${x.icon} ${x.name}`, x.name], [`${x.icon}${x.name}`, x.name]] as [string, string][]);

/** ログの文からリーダー・フィールドの名前の前の絵文字を外す（「🏇騎士」→「騎士」） */
export function stripOptionIcons(text: string): string {
  let out = text;
  for (const [from, to] of OPTION_ICON_NAMES) if (out.includes(from)) out = out.split(from).join(to);
  return out;
}

export type LogSegment =
  | { t: 'text'; text: string }
  /** カード名（text は括弧を除いた名前、cardId は詳細を開くため） */
  | { t: 'card'; text: string; cardId: string }
  | { t: 'player'; text: string; player: battle.PlayerId }
  | { t: 'num'; text: string; tone: 'damage' | 'heal' | 'plain' };

export interface LogNames {
  /** 知っているカード（id と名前） */
  cards: readonly { id: string; name: string }[];
  /** プレイヤー名（席の順） */
  players: readonly [string, string];
}

/** view から名前の一覧を作る */
export function logNamesOf(view: { cards: Record<string, { name: string }>; players: readonly { name: string }[] }): LogNames {
  return {
    cards: Object.entries(view.cards).map(([id, def]) => ({ id, name: def.name })),
    players: [view.players[0]?.name ?? '', view.players[1]?.name ?? ''],
  };
}

const BRACKETS: Record<string, string> = { '「': '」', '『': '』' };
/** プレイヤー名のあとに続いてよい文字 */
const AFTER_PLAYER = /^(?:$|[のはにがをとも（(：:、。・\s])/;

/** 名前からカード ID を引く（同じ名前が複数あれば preferId を優先、なければ最初） */
function cardIdOf(names: LogNames, name: string, preferId?: string): string | null {
  let found: string | null = null;
  for (const c of names.cards) {
    if (c.name !== name) continue;
    if (c.id === preferId) return c.id;
    found ??= c.id;
  }
  return found;
}

/** 文字列の中の数を断片にする */
function splitNumbers(text: string): LogSegment[] {
  const out: LogSegment[] = [];
  const re = /\d+/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ t: 'text', text: text.slice(last, m.index) });
    const after = text.slice(m.index + m[0].length);
    const tone = /^ダメージ/.test(after) ? 'damage' : /^回復/.test(after) ? 'heal' : 'plain';
    out.push({ t: 'num', text: m[0], tone });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', text: text.slice(last) });
  return out;
}

/** 普通の文字の中からプレイヤー名を探し、残りは数で分ける */
function splitPlayers(text: string, names: LogNames): LogSegment[] {
  const players = names.players
    .map((name, player) => ({ name, player: player as battle.PlayerId }))
    .filter((p) => p.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length);
  const out: LogSegment[] = [];
  let buf = '';
  let i = 0;
  while (i < text.length) {
    const hit = players.find((p) => text.startsWith(p.name, i) && AFTER_PLAYER.test(text.slice(i + p.name.length)));
    if (hit) {
      if (buf) out.push(...splitNumbers(buf));
      buf = '';
      out.push({ t: 'player', text: hit.name, player: hit.player });
      i += hit.name.length;
      continue;
    }
    buf += text[i];
    i += 1;
  }
  if (buf) out.push(...splitNumbers(buf));
  return out;
}

/** 隣り合う普通の文字をまとめる */
function merge(segs: LogSegment[]): LogSegment[] {
  const out: LogSegment[] = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    if (s.t === 'text' && prev?.t === 'text') out[out.length - 1] = { t: 'text', text: prev.text + s.text };
    else if (s.t !== 'text' || s.text) out.push(s);
  }
  return out;
}

/**
 * ログ1行を断片に分ける。
 * @param preferId 同じ名前のカードが複数あるとき優先する ID（ログの ev.cardId）
 */
export function tokenizeLog(text: string, names: LogNames, preferId?: string): LogSegment[] {
  const segs: LogSegment[] = [];
  let rest = text;

  // 行の頭の「カード名：」「カード名のデメリット：」（効果の出どころ）
  const head = [...names.cards]
    .filter((c) => c.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length)
    .find((c) => rest.startsWith(c.name) && /^(?:：|のデメリット：)/.test(rest.slice(c.name.length)));
  if (head && !names.players.includes(head.name)) {
    segs.push({ t: 'card', text: head.name, cardId: cardIdOf(names, head.name, preferId) ?? head.id });
    rest = rest.slice(head.name.length);
  }

  let plain = '';
  let i = 0;
  while (i < rest.length) {
    const ch = rest[i]!;
    const close = BRACKETS[ch];
    if (close) {
      const end = rest.indexOf(close, i + 1);
      if (end > i) {
        const inner = rest.slice(i + 1, end);
        const id = cardIdOf(names, inner, preferId);
        if (id !== null) {
          if (plain) segs.push(...splitPlayers(plain, names));
          plain = '';
          segs.push({ t: 'card', text: inner, cardId: id });
          i = end + 1;
          continue;
        }
      }
    }
    plain += ch;
    i += 1;
  }
  if (plain) segs.push(...splitPlayers(plain, names));
  return merge(segs);
}

/** ログの出来事の種類ごとのアイコン（ev がなければ行の種類から） */
/**
 * ログの行の印の形（UI2：よく出る出来事だけ game-icons。tone は色の意味）。無ければ logIcon の絵文字のまま。
 * ドローの card-draw はこの意味だけに使う（決定事項 #111 の 8章）
 */
export function logGi(evKind: battle.LogEvent['kind'] | undefined, rowKind?: battle.LogEntry['kind'], status?: string): { gi: string; tone?: 'dmg' | 'heal' | 'energy' | 'play' } | null {
  if (status === 'coin') return { gi: 'coins' };
  if (status === 'doom') return { gi: 'death-zone', tone: 'dmg' };
  if (status === 'divineShield') return { gi: 'bolt-shield' };
  if (status === 'fatigue') return { gi: 'stack', tone: 'dmg' };
  if (status === 'cycling' || status === 'channel' || status === 'drawn' || status === 'delayed' || status === 'clash') return null;
  switch (evKind) {
    case 'damage':
      return { gi: 'explosion-rays', tone: 'dmg' };
    case 'retaliate':
      return { gi: 'return-arrow', tone: 'dmg' };
    case 'heal':
      return { gi: 'heart-plus', tone: 'heal' };
    case 'shield':
      return { gi: 'energy-shield' };
    case 'status':
      return { gi: 'crystal-shine' };
    case 'play':
      return { gi: 'magic-palm', tone: 'play' };
    case 'summon':
      return { gi: 'sparkles', tone: 'play' };
    case 'destroy':
      return { gi: 'skull-crack' };
    case 'draw':
      return { gi: 'card-draw' };
    case 'attack':
      return { gi: 'sword-clash', tone: 'dmg' };
    case 'energy':
      return { gi: 'crystal-growth', tone: 'energy' };
    case 'discard':
      return { gi: 'card-discard' };
    case 'crown':
      return { gi: 'crown' };
    case 'result':
      return { gi: 'trophy-cup' };
    case 'waiting':
      return { gi: 'hourglass' };
    case undefined:
      return rowKind === 'damage' ? { gi: 'explosion-rays', tone: 'dmg' } : rowKind === 'result' ? { gi: 'trophy-cup' } : null;
    default:
      return null;
  }
}

export function logIcon(evKind: battle.LogEvent['kind'] | undefined, rowKind?: battle.LogEntry['kind'], status?: string): string {
  if (status === 'coin') return '🪙';
  if (status === 'clash') return '⚔';
  if (status === 'delayed') return '⏳';
  if (status === 'drawn') return '✋';
  if (status === 'divineShield') return '✴';
  if (status === 'doom') return '⏳'; // 呪縛を与えた・呪縛のダメージ（damageKind）
  if (status === 'fatigue') return '📭'; // 疲労（山札切れ。決定事項 #102）の知らせとダメージ（damageKind）
  // MTG 要素 ○ バッチC1：サイクリング・魂力
  if (status === 'cycling') return '♻';
  if (status === 'channel') return '🌀';
  switch (evKind) {
    case 'damage':
      return '💥';
    case 'retaliate':
      return '↩';
    case 'heal':
      return '✚';
    case 'shield':
      return '🛡';
    case 'status':
      return '✳';
    case 'play':
      return '🃏';
    case 'summon':
      return '✨';
    case 'destroy':
      return '💀';
    case 'draw':
      return '📥';
    case 'attack':
      return '⚔';
    case 'turnStart':
      return '▶';
    case 'turnEnd':
      return '⏹';
    case 'energy':
      return '⚡';
    case 'discard':
      return '🗑';
    case 'result':
      return '🏁';
    case 'activate':
      return '⚡';
    case 'handAbility':
      return '♻';
    // MTG 要素 ○ バッチC2
    case 'speed':
      return '🏁';
    case 'crown':
      return '👑';
    case 'saga':
      return '📖';
    case 'charge':
      return '🔋';
    // MTG 要素 △ バッチC
    case 'waiting':
      return '⏳';
    case 'reveal':
      return '🂠';
    case 'level':
      return '⬆';
    case 'loyalty':
      return '💠';
    case 'achieve':
      return '🔍';
    case 'altWin':
      return '🏆';
    default:
      return rowKind === 'result' ? '🏁' : rowKind === 'damage' ? '💥' : '';
  }
}
