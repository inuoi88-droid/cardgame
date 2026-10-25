/**
 * 報告・要望（決定事項 #129）の画面の決まりごと（純粋：React・DOM・localStorage を使わない。tests/feedback-ui.test.ts）。
 * - 種類（バランス・バグ・その他）と中身の言葉、送った画面ごとの最初の種類
 * - 対戦の記録（運営が確かめるための材料）：結果・ターン・HP・ログ（自分に見えるものだけ）・この対戦のカード・画面からの補足
 * - 大きさの上限に収める（古いログから削り、それでも大きければカードを外す）
 */
import type { battle, CardDef } from '../../engine/index.ts';
import { FEEDBACK_CONTEXT_MAX_CHARS, type FeedbackKind, type FeedbackSource, type FeedbackStatus } from '../../online/feedback/types.ts';

export const KIND_LABEL: Record<FeedbackKind, string> = {
  balance: 'バランス',
  bug: 'バグ',
  other: 'その他・要望',
};

export const KIND_HINT: Record<FeedbackKind, string> = {
  balance: '強すぎる・弱すぎるカード、1ターン目で倒せてしまう（OTK）、終わらない繰り返し（ループ）',
  bug: 'ルールや効果の動きがおかしい、表示が崩れる、止まって進まない',
  other: '使いやすさ・見た目、ほしい機能、不満なところ',
};

export const KIND_GI: Record<FeedbackKind, string> = {
  balance: 'scales',
  bug: 'bug-net',
  other: 'talk',
};

export const TOPIC_LABEL: Record<FeedbackKind, Record<string, string>> = {
  balance: { strong: '強すぎる', weak: '弱すぎる', otk: 'OTK（1ターン目で倒せる）', loop: 'ループ（終わらない繰り返し）', other: 'そのほか' },
  bug: { rules: 'ルール・効果の動き', display: '表示・見た目', stuck: '止まる・進まない', other: 'そのほか' },
  other: { ui: '使いやすさ・見た目', feature: 'ほしい機能', complaint: '不満・苦情', other: 'そのほか' },
};

/** 本文の書き方の例（入力欄の薄い字） */
export const TOPIC_PLACEHOLDER: Record<FeedbackKind, Record<string, string>> = {
  balance: {
    strong: 'どのカードが、どんな場面で強すぎると感じたか（例：コスト2なのに毎ターン大ダメージ）',
    weak: 'どのカードが、なぜ使いどころがないと感じたか',
    otk: '何ターン目に、どのカードの組み合わせで倒した（倒された）か',
    loop: 'どのカードの組み合わせで、何が繰り返されたか',
    other: '気になったバランスのこと',
  },
  bug: {
    rules: '何をしたら、どうなったか。本当はどうなるはずだと思ったか',
    display: 'どの画面のどこが、どう崩れたか（スマホ・PC の別も）',
    stuck: '何をしたあとに止まったか',
    other: '起きたこと',
  },
  other: {
    ui: 'どの画面の、どこが使いにくい・見にくいか',
    feature: 'ほしい機能と、あると何がうれしいか',
    complaint: '不満に感じたこと',
    other: 'ご意見・ご要望',
  },
};

export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: '受付',
  checking: '確認中',
  accepted: '対応予定',
  fixed: '対応済み',
  rejected: '見送り',
  duplicate: 'ほかの報告とまとめました',
};

/** 送った画面ごとの最初の種類（結果・デッキ・エディターはバランス、対戦の途中はバグ） */
export function defaultKind(source: FeedbackSource): FeedbackKind {
  return source === 'battle' ? 'bug' : 'balance';
}

export const SOURCE_LABEL: Record<FeedbackSource, string> = {
  result: '対戦の結果',
  battle: '対戦の途中',
  deck: 'デッキ構築',
  editor: 'カードの作成',
};

/** 送れるか（本文かカードのどちらかが要る） */
export function canSend(body: string, cardCount: number): boolean {
  return body.trim().length > 0 || cardCount > 0;
}

/** 同じ ID のカードを1枚に（並びは最初に出た順） */
export function uniqueCards(cards: readonly CardDef[]): CardDef[] {
  const seen = new Set<string>();
  const out: CardDef[] = [];
  for (const c of cards) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

/** 対戦のカード定義（GameState.cards のキーは「プレイヤーごとの ID」なので、元のカードの ID でまとめる） */
export function matchCards(view: battle.GameState): CardDef[] {
  return uniqueCards(Object.values(view.cards));
}

/** 対戦の記録（運営が確かめるための材料。相手にだけ見えるもの＝private は入れない） */
export interface MatchContext {
  me: battle.PlayerId;
  first: battle.PlayerId;
  phase: battle.GameState['phase'];
  /** 通算ターン（両者の合計） */
  turnIndex: number;
  result: battle.GameResult | null;
  hp: [number, number];
  /** ログ（新しいほうから最大 MAX_LOG 行。[通算ターン] 本文） */
  log: string[];
  /** この対戦のカード（元の ID でまとめたもの） */
  cards: CardDef[];
  /** 画面からの補足（CPU の強さ・デッキ名・部屋の形式など） */
  extra?: Record<string, unknown>;
}

export interface FeedbackContextData {
  v: 1;
  match?: MatchContext;
  /** デッキ構築：デッキ名とカードの枚数 */
  deck?: { name: string; cards: { id: string; name: string; count: number }[] };
  /** カードの作成：編集中のカードの ID と、保存済みか */
  editor?: { cardId: string; saved: boolean };
  /** 運営が削った（大きすぎて） */
  trimmed?: boolean;
}

const MAX_LOG = 400;

export function matchContext(view: battle.GameState, me: battle.PlayerId, extra?: Record<string, unknown>): MatchContext {
  const lines = view.log.filter((l) => l.private === undefined || l.private === me).map((l) => `[${l.turn}] ${'  '.repeat(Math.max(0, l.depth))}${l.text}`);
  return {
    me,
    first: view.first,
    phase: view.phase,
    turnIndex: view.turnIndex,
    result: view.result,
    hp: [view.players[0].hp, view.players[1].hp],
    log: lines.slice(-MAX_LOG),
    cards: matchCards(view),
    ...(extra ? { extra } : {}),
  };
}

const size = (v: unknown) => JSON.stringify(v).length;

/** 上限（JSON の文字数）に収める：古いログから削り、それでも大きければカードを外す。収めたら trimmed を付ける */
export function fitContext(ctx: FeedbackContextData, max = FEEDBACK_CONTEXT_MAX_CHARS - 1000): FeedbackContextData {
  if (size(ctx) <= max) return ctx;
  const out: FeedbackContextData = { ...ctx, trimmed: true, ...(ctx.match ? { match: { ...ctx.match, log: [...ctx.match.log] } } : {}) };
  const m = out.match;
  if (m) {
    while (m.log.length > 20 && size(out) > max) m.log.splice(0, Math.ceil(m.log.length / 4));
    if (size(out) > max) m.cards = [];
    if (size(out) > max) m.log = m.log.slice(-20);
  }
  if (out.deck && size(out) > max) out.deck = { ...out.deck, cards: out.deck.cards.slice(0, 60) };
  return out;
}

/** 日付と時刻（報告の一覧に出す） */
export function shortDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
