/**
 * はじめての案内（純粋）：出す条件と、選べる行き先。tests/welcome.test.ts。
 * 初めての人＝自作のカードもデッキも無く、案内を閉じた印（cardgame.v1.welcome）も無い人。対戦・ドラフトの途中や招待リンクの画面には出さない。
 */
import type { UiIconName } from '../components/UiIcon.tsx';

export const WELCOME_KEY = 'cardgame.v1.welcome';

/** 案内を出さない画面（App の NO_BANNER と同じ：対戦・ドラフト・オンライン・招待リンク）と、更新情報・クレジット */
const QUIET_PAGES: ReadonlySet<string> = new Set(['online', 'onlineBattle', 'friendLink', 'battle', 'draft', 'news', 'credits', 'uiKit']);

export function shouldShowWelcome(o: { cards: number; decks: number; seen: boolean; page: string }): boolean {
  return !o.seen && o.cards === 0 && o.decks === 0 && !QUIET_PAGES.has(o.page);
}

/** 閉じた印を読む（壊れていても「見た」扱いにはしない） */
export function parseWelcomeSeen(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && (raw as { seen?: unknown }).seen === true;
}

export interface WelcomeChoice {
  id: 'draft' | 'cpu' | 'make' | 'online' | 'rules';
  title: string;
  text: string;
  icon: UiIconName;
  path: string;
}

/** 行き先（上から順。最初の1つが主役の金のボタン） */
export const WELCOME_CHOICES: readonly WelcomeChoice[] = [
  { id: 'draft', title: 'ドラフト戦ですぐ遊ぶ', text: '公式カードを交互に1枚ずつ取ってデッキを作り、CPU と戦います。カードを作らなくても遊べます。', icon: 'card-pick', path: '/battle/draft' },
  { id: 'cpu', title: 'CPU と対戦', text: '用意されたデッキ（プリセット）で、すぐに CPU と戦えます。', icon: 'crossed-swords', path: '/battle' },
  { id: 'make', title: 'カードを作る', text: '効果やキーワードを組み合わせて、ポイントの予算の中で自分だけのカードを作ります。', icon: 'quill-ink', path: '/cards/new' },
  { id: 'online', title: 'オンライン', text: '部屋のコードやフレンドと、人と1対1で戦います。', icon: 'world', path: '/online' },
  { id: 'rules', title: 'ルールを読む', text: 'ターンの流れ・エナジー・攻撃と反撃などを確かめます。', icon: 'rule-book', path: '/rules' },
];
