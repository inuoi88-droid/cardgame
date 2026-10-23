/**
 * エディターの印（効果・デメリット・能力・キーワード）。丸い鉄の台座に羊皮紙の game-icons（決定事項 #111 の (C)）。
 * 効果ごとの形は必要なときに読み、読めるまでは同梱の見出しの形を出す（チラつかない・オフラインでも出る）。
 */
import type { EffectGroup } from '../../engine/index.ts';
import { UiIcon } from '../components/UiIcon.tsx';
import { UI_ICON_PATHS } from '../icons/generated/uiIcons.ts';
import { useIconPath } from '../icons/load.ts';
import { cx } from '../util.ts';
import { ABILITY_GI, DRAWBACK_GI, GROUP_GI, KEYWORD_GI, effectGi } from './effectIcons.ts';

type Kind = 'effect' | 'drawback' | 'ability' | 'keyword';

const bundled = (n: string) => Object.prototype.hasOwnProperty.call(UI_ICON_PATHS, n);

/** 形の名前（同梱でなければ読み込み、読めるまでは fallback） */
function Glyph({ name, fallback }: { name: string; fallback: string }) {
  const own = bundled(name);
  const loaded = useIconPath(own ? null : name);
  const shown = own || typeof loaded === 'string' ? name : fallback;
  return <UiIcon name={`gi:${shown}`} />;
}

interface Props {
  kind: Kind;
  /** 効果の ID（kind が effect のとき） */
  id?: string;
  group?: EffectGroup;
  className?: string;
}

export function EffectIcon({ kind, id, group, className }: Props) {
  const fallback = kind === 'effect' ? GROUP_GI[group ?? 'special'] : kind === 'drawback' ? DRAWBACK_GI : kind === 'ability' ? ABILITY_GI : KEYWORD_GI;
  const name = kind === 'effect' && id ? effectGi(id, group) : fallback;
  return (
    <span className={cx('ed-sigil', `ed-sigil--${kind}`, className)} aria-hidden="true">
      <Glyph name={name} fallback={fallback} />
    </span>
  );
}
