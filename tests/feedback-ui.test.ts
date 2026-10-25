// 報告・要望の画面の決まりごと（src/ui/feedback/feedbackLogic.ts。決定事項 #129）：言葉の網羅・最初の種類・送れる条件・対戦の記録・大きさの上限
import { describe, expect, it } from 'vitest';
import { battle, type CardDef } from '../src/engine/index.ts';
import { FEEDBACK_CONTEXT_MAX_CHARS, FEEDBACK_KINDS, FEEDBACK_SOURCES, FEEDBACK_STATUSES, FEEDBACK_TOPICS } from '../src/online/feedback/types.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import {
  canSend,
  defaultKind,
  fitContext,
  KIND_LABEL,
  matchCards,
  matchContext,
  SOURCE_LABEL,
  STATUS_LABEL,
  TOPIC_LABEL,
  TOPIC_PLACEHOLDER,
  uniqueCards,
  type FeedbackContextData,
} from '../src/ui/feedback/feedbackLogic.ts';

function game() {
  const a = PRESET_DECKS[0]!;
  const b = PRESET_DECKS[1]!;
  const r = battle.createGame({ seed: 7, players: [{ name: 'あなた', deck: a.deck, cards: a.cards }, { name: 'CPU', deck: b.deck, cards: b.cards }] } as never);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('報告の言葉', () => {
  it('種類・中身・送った画面・状況のどれにも言葉と書き方の例がある', () => {
    for (const k of FEEDBACK_KINDS) {
      expect(KIND_LABEL[k]).toBeTruthy();
      for (const t of FEEDBACK_TOPICS[k]) {
        expect(TOPIC_LABEL[k][t], `${k}/${t}`).toBeTruthy();
        expect(TOPIC_PLACEHOLDER[k][t], `${k}/${t}`).toBeTruthy();
      }
    }
    for (const s of FEEDBACK_SOURCES) expect(SOURCE_LABEL[s]).toBeTruthy();
    for (const s of FEEDBACK_STATUSES) expect(STATUS_LABEL[s]).toBeTruthy();
    // OTK とループはバランスの中身にある（ユーザーの依頼）
    expect(FEEDBACK_TOPICS.balance).toContain('otk');
    expect(FEEDBACK_TOPICS.balance).toContain('loop');
  });

  it('対戦の途中はバグ、結果・デッキ・エディターはバランスから始める。本文かカードがあれば送れる', () => {
    expect(defaultKind('battle')).toBe('bug');
    expect(defaultKind('result')).toBe('balance');
    expect(defaultKind('deck')).toBe('balance');
    expect(defaultKind('editor')).toBe('balance');
    expect(canSend('  ', 0)).toBe(false);
    expect(canSend('', 1)).toBe(true);
    expect(canSend('強すぎる', 0)).toBe(true);
  });
});

describe('対戦の記録', () => {
  it('カードは元の ID で1枚ずつ。相手にだけ見えるログは入れない', () => {
    const g = game();
    const cards = matchCards(g);
    expect(cards.length).toBe(new Set(cards.map((c) => c.id)).size);
    expect(cards.length).toBeGreaterThan(0);
    const withPrivate: battle.GameState = {
      ...g,
      log: [...g.log, { turn: 1, depth: 0, text: 'あなただけ', kind: 'info', private: 0 }, { turn: 1, depth: 0, text: '相手だけ', kind: 'info', private: 1 }],
    };
    const ctx = matchContext(withPrivate, 0, { mode: 'cpu' });
    expect(ctx.log.some((l) => l.includes('あなただけ'))).toBe(true);
    expect(ctx.log.some((l) => l.includes('相手だけ'))).toBe(false);
    expect(ctx.extra).toEqual({ mode: 'cpu' });
    expect(ctx.hp).toEqual([g.players[0].hp, g.players[1].hp]);
    expect(uniqueCards([cards[0]!, cards[0]!])).toHaveLength(1);
  });

  it('大きすぎる記録は古いログから削り、それでも大きければカードを外して上限に収める', () => {
    const g = game();
    const big: FeedbackContextData = {
      v: 1,
      match: { ...matchContext(g, 0), log: Array.from({ length: 400 }, (_, i) => `[${i}] ${'長いログの行'.repeat(80)}`) },
    };
    const fitted = fitContext(big);
    expect(JSON.stringify(fitted).length).toBeLessThanOrEqual(FEEDBACK_CONTEXT_MAX_CHARS);
    expect(fitted.trimmed).toBe(true);
    // 新しい行は残る
    expect(fitted.match!.log.at(-1)).toBe(big.match!.log.at(-1));
    const huge: FeedbackContextData = {
      v: 1,
      match: { ...matchContext(g, 0), log: [], cards: Array.from({ length: 400 }, (_, i) => ({ ...(matchCards(g)[0] as CardDef), id: `c${i}`, description: 'x'.repeat(400) })) },
    };
    expect(JSON.stringify(fitContext(huge)).length).toBeLessThanOrEqual(FEEDBACK_CONTEXT_MAX_CHARS);
    const small: FeedbackContextData = { v: 1, editor: { cardId: 'x', saved: true } };
    expect(fitContext(small)).toBe(small);
  });
});
