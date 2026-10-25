/**
 * 属性（色）の決め方（決定事項 #126）。ダメージ・連撃のように効果だけでは色が決まらないもの（el 'auto'）は、
 * 使ったカードの絵（絵文字か game-icons の名前）と名前の言葉から推し量る。分からなければモンスターは物理、それ以外は魔力。
 * 純粋関数（tests/battle/fx.test.ts）。
 */
import type { CardDef } from '../../../engine/index.ts';
import type { FxElement, FxSpec } from './registry.ts';
import hintData from './elementHints.json' with { type: 'json' };

/** 属性ごとの手がかり（絵文字・英語の形の名前の一部・日本語の字）。上から順に見る。画面に出さない字なので JSON（見出しの書体の字集めに入れない） */
const HINTS: readonly [FxElement, readonly string[]][] = (hintData.order as FxElement[]).map((el) => [el, (hintData as unknown as Record<string, string[]>)[el] ?? []]);

/** カードの絵と名前から属性を推し量る（見つからなければ null） */
export function guessElement(def: Pick<CardDef, 'icon' | 'name'> | undefined): FxElement | null {
  if (!def) return null;
  const hay = `${def.icon ?? ''} ${def.name ?? ''}`.toLowerCase();
  for (const [el, words] of HINTS) if (words.some((w) => hay.includes(w))) return el;
  return null;
}

/** 演出の属性（auto はカードから。モンスターなら物理、それ以外は魔力） */
export function elementOf(spec: FxSpec, def: CardDef | undefined): FxElement {
  if (spec.el !== 'auto') return spec.el;
  return guessElement(def) ?? (def?.stats ? 'physical' : 'arcane');
}
