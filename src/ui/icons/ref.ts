/**
 * カードの絵（CardDef.icon）の読み方（決定事項 #105）。純粋関数だけ（テスト：tests/icons.test.ts）。
 *
 * - "gi:<名前>" … game-icons.net のアイコン（例 "gi:dragon-head"）。名前は英小文字・数字・ハイフンだけ
 * - それ以外 … 絵文字（古いカード・取り込んだカード・オンラインのデッキはそのまま動く）
 *
 * アイコン名は「シャードから形を引く鍵」にしか使わない。形（SVG の path の d）は自分たちのバンドルにあるものだけを出すので、
 * カードのデータから SVG やスクリプトが入り込むことはない。形の無い名前は代わりの絵（？）になる。
 */

export const GI_PREFIX = 'gi:';
/** アイコン名の形（scripts/gen-icons.mjs の NAME_RE と同じ）。長さは CARD_ICON_MAX（engine）に収まる */
export const GI_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const GI_NAME_MAX = 48;

export type IconRef =
  | { kind: 'gi'; name: string }
  /** gi: で始まるが名前の形が正しくない（代わりの絵を出す） */
  | { kind: 'bad'; raw: string }
  | { kind: 'emoji'; text: string }
  | { kind: 'empty' };

export function parseIconRef(icon: string | undefined | null): IconRef {
  const s = (icon ?? '').trim();
  if (s === '') return { kind: 'empty' };
  if (s.startsWith(GI_PREFIX)) {
    const name = s.slice(GI_PREFIX.length);
    return isGiName(name) ? { kind: 'gi', name } : { kind: 'bad', raw: s };
  }
  return { kind: 'emoji', text: s };
}

export function isGiName(name: string): boolean {
  return name.length > 0 && name.length <= GI_NAME_MAX && GI_NAME.test(name);
}

export function giIcon(name: string): string {
  return `${GI_PREFIX}${name}`;
}

export function isGiIcon(icon: string | undefined | null): boolean {
  return parseIconRef(icon).kind === 'gi';
}

/**
 * 文字の中（ログ・読み上げ・ボタンの文字）に出すときのアイコン。絵文字はそのまま、game-icons の絵は文字にできないので空。
 * 例：`${iconText(def.icon)}${def.name}`
 */
export function iconText(icon: string | undefined | null): string {
  const r = parseIconRef(icon);
  return r.kind === 'emoji' ? r.text : '';
}

/** 読み上げ・ツールチップ用の短い名前（絵文字はそのまま、game-icons は英語の名前を空白区切りで） */
export function iconLabel(icon: string | undefined | null): string {
  const r = parseIconRef(icon);
  if (r.kind === 'emoji') return r.text;
  if (r.kind === 'gi') return r.name.replace(/-/g, ' ');
  return 'なし';
}

/**
 * 名前の入っているシャードの番号（starts は各シャードの最初の名前・名前順）。名前順の二分探索。
 * 範囲の外（最初の名前より前）なら -1。ここで見つかっても、そのシャードに名前があるとは限らない（無ければ代わりの絵）
 */
export function shardIndexOf(name: string, starts: readonly string[]): number {
  let lo = 0;
  let hi = starts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid]! <= name) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** シャードの中身（名前 → path の d）から形を引く。形の無い名前・変な値は null（代わりの絵） */
export function pathFromShard(shard: Readonly<Record<string, unknown>> | undefined, name: string): string | null {
  if (!shard || !Object.prototype.hasOwnProperty.call(shard, name)) return null;
  const d = shard[name];
  // path の d に使える文字だけ（数字・コマンド・区切り）。自分たちのデータだが、念のため
  return typeof d === 'string' && /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/.test(d) ? d : null;
}
