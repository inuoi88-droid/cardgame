/**
 * 画面の操作の音（決定事項 #127）：押したもの（ボタン・タブ・切り替えなど）→ ui.* の音。純粋な関数（tests/sound.test.ts）。
 * sound/index.ts が document のクリックを1か所で受けて、押した要素の手がかり（UiTarget）を作って渡す。
 * 個別に変えたいときは要素に data-sfx="<音の ID>"、鳴らさないときは data-sfx="none"。
 */
import { isSoundId, type SoundId } from './catalog.ts';

/** 押したものの手がかり（DOM から sound/index.ts が作る） */
export interface UiTarget {
  tag: string;
  role: string | null;
  type: string | null;
  className: string;
  /** aria-label か、無ければ文字（前後の空白を除く・短く） */
  label: string;
  /** data-sfx（自分か祖先）：'none' は鳴らさない、音の ID ならその音 */
  sfx: string | null;
  /** aria-pressed がある（押して入・切が変わるボタン） */
  pressed: boolean;
  /** 盤面のもの（モンスター・プレイヤー・パワーの枠＝data-fx）：押した結果の行動が自分の音を鳴らす */
  board: boolean;
  /** 選択肢の並び（role=radiogroup・tablist）の中 */
  inGroup: boolean;
}

/** 閉じる・戻る・やめる（ボタンの名前のはじめ） */
const CANCEL = /^(閉じる|戻る|キャンセル|やめる|あとで|しまう|断る|印を外す|[✕×])|を閉じる$/;

/** 押したもの → 画面の操作の音（鳴らさないなら null） */
export function classifyUi(t: UiTarget): SoundId | null {
  if (t.sfx !== null) return isSoundId(t.sfx) ? t.sfx : null;
  if (t.board) return null;
  if (t.type === 'checkbox' || t.role === 'switch' || t.role === 'checkbox' || t.pressed) return 'ui.toggle';
  if (t.type === 'radio' || t.role === 'tab' || t.role === 'radio' || t.tag === 'summary' || /\b(nav-btn|seg__btn)\b/.test(t.className) || (t.inGroup && /\bchip\b/.test(t.className))) return 'ui.tab';
  if (CANCEL.test(t.label) || /__close\b/.test(t.className)) return 'ui.cancel';
  if (/\bbtn--primary\b/.test(t.className)) return 'ui.confirm';
  if (t.tag === 'button' || t.tag === 'a' || t.role === 'button' || t.role === 'menuitem' || t.role === 'option') return 'ui.click';
  return null;
}
