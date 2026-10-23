/**
 * 画面の枠の記号（決定事項 #111）。game-icons.net の形を単色（currentColor）で塗る。絵文字の代わりに使う。
 *
 *   <UiIcon name="gi:hand" />          … src/ui/icons/uiIcons.json にある形は同梱（同期で描く。チラつかず、オフラインでも出る）
 *   <UiIcon name="gi:dragon-head" />   … それ以外の形は、カードの絵と同じ読み込み（icons/load.ts）で必要なときに読む
 *
 * 大きさは em（既定 1em。size で px か CSS の長さ）。飾りとして aria-hidden、label を渡すと role="img" で読み上げる。
 * 1つの形は1つの意味だけに使う（意味の表は uiIcons.json）。
 */
import { memo, type CSSProperties } from 'react';
import { UI_ICON_PATHS, type UiIconName } from '../icons/generated/uiIcons.ts';
import { useIconPath } from '../icons/load.ts';
import { GI_PREFIX, isGiName } from '../icons/ref.ts';
import { cx } from '../util.ts';

export type { UiIconName };

export interface UiIconProps {
  /** "gi:<名前>" か "<名前>" */
  name: `gi:${string}` | UiIconName;
  /** px の数か CSS の長さ。省略は 1em */
  size?: number | string;
  className?: string;
  /** 読み上げる名前。省略すると飾り（aria-hidden） */
  label?: string;
  style?: CSSProperties;
}

const bundled = (n: string): n is UiIconName => Object.prototype.hasOwnProperty.call(UI_ICON_PATHS, n);

/** 名前から "gi:" を外す */
export function uiIconName(name: string): string {
  return name.startsWith(GI_PREFIX) ? name.slice(GI_PREFIX.length) : name;
}

export const UiIcon = memo(function UiIcon({ name, size, className, label, style }: UiIconProps) {
  const n = uiIconName(name);
  const isBundled = bundled(n);
  // 同梱していない形だけを読み込む（フックは毎回呼ぶ）
  const loaded = useIconPath(!isBundled && isGiName(n) ? n : null);
  const d = isBundled ? UI_ICON_PATHS[n] : typeof loaded === 'string' ? loaded : null;
  const s = size === undefined ? undefined : typeof size === 'number' ? `${size}px` : size;
  return (
    <svg
      className={cx('gi', className)}
      viewBox="0 0 512 512"
      focusable="false"
      style={s ? { width: s, height: s, ...style } : style}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {d && <path d={d} />}
    </svg>
  );
});
