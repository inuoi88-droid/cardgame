// UI2「黒鉄と金の卓」の対戦画面（決定事項 #112）：
// - 状態異常・キーワードの札は game-icons の形（glossary の gi）。すべての状態・キーワードに形があり、同梱されている
// - 1つの形は1つの意味だけ（状態とキーワードで同じ概念の隠密だけは共有）
// - スマホの札の中身（briefFace）、デッキ箱のタイルの見どころ（deckSummary）、マリガン・選択の全文（cardFullText）
import { describe, expect, it } from 'vitest';
import { listKeywords, type CardDef } from '../../src/engine/index.ts';
import { glossary, KEYWORD_GI, keywordGlossary, mechanicGlossary, STATUS_IDS } from '../../src/ui/glossary.ts';
import { UI_ICON_PATHS } from '../../src/ui/icons/generated/uiIcons.ts';
import { briefFace } from '../../src/ui/battle/compact.ts';
import { deckSummary } from '../../src/ui/battle/deckSummary.ts';
import { cardFullText } from '../../src/ui/battle/CardPickGrid.tsx';
import { CPU_PORTRAIT, PRESET_GI, presetGi, RANDOM_GI } from '../../src/ui/battle/portraits.ts';
import { logGi } from '../../src/ui/battle/logFormat.ts';
import { PRESET_DECKS } from '../../src/presets.ts';

const bundled = (n: string) => Object.prototype.hasOwnProperty.call(UI_ICON_PATHS, n);

describe('状態異常・キーワードの形', () => {
  it('すべての状態異常に gi があり、同梱されている', () => {
    for (const id of STATUS_IDS) {
      const gi = glossary[id].gi;
      expect(gi, id).toBeTruthy();
      expect(bundled(gi!), `${id}:${gi}`).toBe(true);
    }
  });
  it('すべてのキーワードに gi があり、同梱されている', () => {
    for (const k of listKeywords()) {
      expect(KEYWORD_GI[k.id], k.id).toBeTruthy();
      expect(keywordGlossary[k.id]!.gi).toBe(KEYWORD_GI[k.id]);
      expect(bundled(KEYWORD_GI[k.id]!), k.id).toBe(true);
    }
  });
  it('1つの形は1つの意味（キーワード・状態・仕組みで重ならない。隠密は状態とキーワードで同じ概念）', () => {
    const owners = new Map<string, string[]>();
    const add = (gi: string | undefined, who: string) => gi && owners.set(gi, [...(owners.get(gi) ?? []), who]);
    for (const id of STATUS_IDS) add(glossary[id].gi, `status:${id}`);
    for (const [k, gi] of Object.entries(KEYWORD_GI)) add(gi, `kw:${k}`);
    for (const [k, g] of Object.entries(mechanicGlossary)) add(g.gi, `mech:${k}`);
    const dup = [...owners].filter(([, w]) => w.length > 1).map(([gi, w]) => `${gi}=${w.join(',')}`);
    // 隠密（状態とキーワード）と、無効化・封殺（どちらも「無効」：uiIcons.json の cancel）だけは同じ形
    expect(dup.sort()).toEqual(['cancel=status:nullify,mech:quash', 'hooded-figure=status:stealth,kw:stealth']);
  });
  it('肖像・メダル・ログの形は同梱されている', () => {
    for (const gi of [...Object.values(CPU_PORTRAIT), ...Object.values(PRESET_GI), RANDOM_GI, 'visored-helm', 'closed-barbute']) expect(bundled(gi), gi).toBe(true);
    for (const p of PRESET_DECKS) expect(presetGi(p.id)).not.toBe(RANDOM_GI);
    for (const k of ['damage', 'heal', 'play', 'summon', 'destroy', 'draw', 'attack', 'energy', 'discard'] as const) {
      const g = logGi(k);
      expect(g, k).not.toBeNull();
      expect(bundled(g!.gi), k).toBe(true);
    }
    // ドローの card-draw はドローだけ
    expect(logGi('draw')!.gi).toBe('card-draw');
  });
});

describe('briefFace（スマホの札の中身）', () => {
  it('形のある札は形と数字だけ、挑発は名前を残す、形の無い札は今までどおり', () => {
    expect(briefFace({ id: 'poison', label: '☠40', gi: 'poison-bottle', text: '40' })).toEqual({ gi: 'poison-bottle', text: '40' });
    expect(briefFace({ id: 'kw:flying', label: '🕊飛行', gi: 'feathered-wing', text: '飛行' })).toEqual({ gi: 'feathered-wing', text: '' });
    expect(briefFace({ id: 'life', label: '⌛寿命2', gi: 'sands-of-time', text: '寿命2' })).toEqual({ gi: 'sands-of-time', text: '2' });
    expect(briefFace({ id: 'gr:taunt', label: '➕🛡挑発', gi: 'checked-shield', text: '+挑発' })).toEqual({ gi: 'checked-shield', text: '挑発' });
    expect(briefFace({ id: 'token', label: '🪙トークン' })).toEqual({ text: '🪙' });
  });
});

const card = (id: string, rarity: CardDef['rarity'], cost: number, monster = false): CardDef =>
  ({ v: 1, id, name: id, icon: 'gi:rat', rarity, cost, effects: [], keywords: [], drawbacks: [], ...(monster ? { stats: { attack: 20, hp: 20, defense: 0 } } : {}) }) as unknown as CardDef;

describe('deckSummary（デッキ箱のタイル）', () => {
  it('代表カードはいちばん高いレアリティ → 枚数の多いもの', () => {
    const cards = [card('a', 'common', 1), card('b', 'rare', 2), card('c', 'rare', 3), card('d', 'common', 0)];
    const s = deckSummary({ entries: [{ cardId: 'a', count: 10 }, { cardId: 'b', count: 1 }, { cardId: 'c', count: 3 }, { cardId: 'd', count: 2 }] }, cards);
    expect(s.best?.id).toBe('c');
    expect(s.total).toBe(16);
    expect(s.gems).toEqual({ common: 12, rare: 4, epic: 0, legend: 0 });
    expect(s.curve.slice(0, 4)).toEqual([2, 10, 1, 3]);
  });
  it('見つからないカードは枚数にだけ数える', () => {
    const s = deckSummary({ entries: [{ cardId: 'x', count: 3 }] }, []);
    expect(s).toMatchObject({ total: 3, best: undefined });
    expect(s.curve.every((n) => n === 0)).toBe(true);
  });
});

describe('cardFullText（マリガン・選択の全文）', () => {
  it('種類・ステータスを先頭に、ノイズは何もしない旨', () => {
    expect(cardFullText(card('m', 'common', 1, true))).toMatch(/^モンスター　攻撃力20・体力20/);
    expect(cardFullText(undefined)).toMatch(/除外/);
  });
});
