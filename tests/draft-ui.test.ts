// ドラフトの画面の補助（src/ui/draft/draftUi.ts。決定事項 #119）と、画面の約束（UiIcon・カードの部品に規則を置かない・BALANCE から読む）
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BALANCE, battle, draft, type CardDef } from '../src/engine/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { EMPTY_TRACK, deckRows, lastPickText, rarityRoom, shortReason, takenDeck, takenTotal, trackField } from '../src/ui/draft/draftUi.ts';
import { rematchFirst } from '../src/ui/battle/session.ts';
import { card } from './helpers.ts';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('trackField：場のカードのキー', () => {
  it('最初の並びは光らせない', () => {
    const t = trackField(EMPTY_TRACK, ['a', 'b', 'c']);
    expect(t.keys).toHaveLength(3);
    expect(new Set(t.keys).size).toBe(3);
    expect(t.fresh).toEqual([]);
  });

  it('1枚取られて1枚補充されると、残ったカードはキーを引き継ぎ、新しいカードだけ光る', () => {
    const t1 = trackField(EMPTY_TRACK, ['a', 'b', 'c', 'd']);
    const t2 = trackField(t1, ['a', 'c', 'd', 'e']);
    expect(t2.keys.slice(0, 3)).toEqual([t1.keys[0], t1.keys[2], t1.keys[3]]);
    expect(t2.fresh).toEqual([t2.keys[3]]);
  });

  it('同じカードが2枚並んでいても区別し、前の1枚が取られたら後ろの1枚のキーを引き継ぐ', () => {
    const t1 = trackField(EMPTY_TRACK, ['a', 'b', 'a']);
    const t2 = trackField(t1, ['b', 'a', 'x']);
    expect(t2.keys[0]).toBe(t1.keys[1]);
    expect(t2.keys[1]).toBe(t1.keys[2]);
    expect(t2.fresh).toEqual([t2.keys[2]]);
  });

  it('取れるカードが無くて山から追加で出たカードも光る', () => {
    const t1 = trackField(EMPTY_TRACK, ['a', 'b']);
    const t2 = trackField(t1, ['b', 'c', 'd']);
    expect(t2.fresh).toEqual([t2.keys[1], t2.keys[2]]);
  });
});

describe('取れない理由・レアリティの残り', () => {
  const rare = card({ id: 'r1', name: 'レアの剣', rarity: 'rare' });
  const epic = card({ id: 'e1', name: 'エピックの剣', rarity: 'epic' });

  it('理由の短い札', () => {
    expect(shortReason({ cardId: 'r1', ok: true }, rare)).toBeNull();
    expect(shortReason({ cardId: 'r1', ok: false, reason: 'rarityLimit' }, rare)).toBe('レアは上限');
    expect(shortReason({ cardId: 'e1', ok: false, reason: 'rarityLimit' }, epic)).toBe('エピックは上限');
    expect(shortReason({ cardId: 'r1', ok: false, reason: 'sameName' }, rare)).toBe('同名は上限');
    expect(shortReason({ cardId: 'r1', ok: false, reason: 'deckRule' }, rare)).toBe('取れません');
  });

  it('レア・エピックをあと何回取れるか（デッキの上限から）', () => {
    const c = BALANCE.draft.copies;
    const room0 = rarityRoom([]);
    expect(room0.map((r) => r.rarity)).toEqual(['rare', 'epic']);
    expect(room0[0]!.takesLeft).toBe(Math.floor(BALANCE.rarity.rare.deckLimit! / c));
    expect(room0[1]!.takesLeft).toBe(Math.floor(BALANCE.rarity.epic.deckLimit! / c));
    const room = rarityRoom([
      { card: rare, count: c * 2 },
      { card: epic, count: c },
    ]);
    expect(room[0]).toMatchObject({ copies: c * 2, takesLeft: Math.floor((BALANCE.rarity.rare.deckLimit! - 2 * c) / c) });
    expect(room[1]).toMatchObject({ copies: c, takesLeft: Math.floor((BALANCE.rarity.epic.deckLimit! - c) / c) });
  });

  it('行はコスト順・合計・デッキの形', () => {
    const a = card({ id: 'a', name: 'い', cost: 3 });
    const b = card({ id: 'b', name: 'あ', cost: 1 });
    const taken = [
      { card: a, count: 2 },
      { card: b, count: 4 },
    ];
    expect(deckRows(taken).map((r) => r.card.id)).toEqual(['b', 'a']);
    expect(takenTotal(taken)).toBe(6);
    expect(takenDeck(taken).entries).toEqual([
      { cardId: 'a', count: 2 },
      { cardId: 'b', count: 4 },
    ]);
  });
});

describe('ドラフトの見え方と一言', () => {
  const pool: CardDef[] = PRESET_DECKS.flatMap((p) => p.cards);

  it('直前の取得の一言（自分は「あなた」、相手は名前）', () => {
    const r = draft.createDraft({ seed: 7, pool, first: 0 });
    if (!r.ok) throw new Error(r.error);
    let s = r.value;
    const v0 = draft.draftView(s, 0);
    expect(lastPickText(v0, 0, ['あなた', 'CPU'])).toBeNull();
    const id = draft.autoPick(s, 0)!;
    const t = draft.applyTake(s, 0, id);
    if (!t.ok) throw new Error(t.error);
    s = t.state;
    const name = s.cards[id]!.name;
    expect(lastPickText(draft.draftView(s, 0), 0, ['あなた', 'CPU'])).toBe(`あなたが「${name}」を取りました`);
    expect(lastPickText(draft.draftView(s, 1), 1, ['アリス', 'ボブ'])).toBe(`アリスが「${name}」を取りました`);
  });
});

describe('CPU 戦のドラフトの再戦の先攻', () => {
  it('前の対戦で負けた人、引き分けなら前の後攻', () => {
    const base = { first: 0 as battle.PlayerId } as battle.GameState;
    expect(rematchFirst({ ...base, result: { winner: 0, reason: 'hp' } })).toBe(1);
    expect(rematchFirst({ ...base, result: { winner: 1, reason: 'hp' } })).toBe(0);
    expect(rematchFirst({ ...base, result: { winner: null, reason: 'turnLimit' } })).toBe(1);
  });
});

describe('画面の約束', () => {
  const files = ['src/ui/draft/DraftBoard.tsx', 'src/ui/pages/DraftPage.tsx', 'src/ui/pages/OfficialCardsPage.tsx', 'src/ui/pages/OnlineBattlePage.tsx', 'src/ui/pages/OnlineLobbyPage.tsx'];

  it('UI の記号に絵文字を使わない', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{2714}\u{2716}-\u{27BF}]/u; // ✕（札を外す印）はカード置き場と同じ
    for (const f of files) {
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(emoji.test(code), f).toBe(false);
    }
  });

  it('draft.css にカードの部品の規則と !important が無い', () => {
    const css = read('src/ui/draft/draft.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const sels = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1]!.trim()).filter((s) => !s.startsWith('@'));
    expect(sels.filter((s) => /\.(tcg|hc|mt|card-row|lrow|crow)(?![\w-])|\.(tcg|hc|mt|card-row|lrow|crow)__/.test(s))).toEqual([]);
    expect(css.includes('!important')).toBe(false);
  });

  it('動きを減らす設定では、ドラフトの動きを止める', () => {
    const css = read('src/ui/draft/draft.css');
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.dcard\.is-new/);
  });

  it('ドラフトの数字は BALANCE から読む（場の枚数・回数を直接書かない）', () => {
    const board = read('src/ui/draft/DraftBoard.tsx');
    expect(board).not.toMatch(/[^\d]15回/);
    expect(read('src/ui/pages/RulesPage.tsx')).toMatch(/sec\('draft'\)/);
  });
});
