// 公式カード（ドラフト戦の山。src/official）：数・レアリティ・ID と名前・ルール・絵・説明・アーキタイプの組み方
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeCard, analyzeDeck, BALANCE, CARD_DESCRIPTION_MAX, descriptionLength, type CardDef, type Deck } from '../src/engine/index.ts';
import {
  OFFICIAL_ARCHETYPE_IDS,
  OFFICIAL_ARCHETYPES,
  OFFICIAL_CARDS,
  OFFICIAL_ENTRIES,
  OFFICIAL_ID_PREFIX,
  OFFICIAL_SET,
  isOfficialCardId,
  officialArchetypeOf,
  officialCard,
  officialCardsOf,
  officialCommonDeck,
  type OfficialArchetype,
} from '../src/official/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { SAMPLE_CARDS } from '../src/samples.ts';
import { TEMPLATES } from '../src/ui/editor/templates.ts';

const ROOT = join(__dirname, '..');
const BY_ID = new Map(OFFICIAL_CARDS.map((c) => [c.id, c]));
/** ドラフトの1回で入る枚数（「取ったら2枚」） */
const COPIES = BALANCE.draft.copies;
/** 色（汎用を除くアーキタイプ） */
const COLORS = OFFICIAL_ARCHETYPE_IDS.filter((a) => a !== 'neutral');

const count = (cards: readonly CardDef[], rarity: string) => cards.filter((c) => c.rarity === rarity).length;

/** 相手のモンスターを倒せる効果（除去・干渉）を持つか */
function isRemoval(c: CardDef): boolean {
  return c.effects.some(
    (e) =>
      ['damage', 'multiHit', 'execute', 'wither', 'fight', 'slay', 'weaken', 'seal', 'freeze', 'bounce'].includes(e.id) &&
      ['chosen', 'enemyMonsters', 'enemyAll', 'random'].includes(e.target),
  );
}

describe('公式カードのセット', () => {
  it('セットの名前と版', () => {
    expect(OFFICIAL_SET.name.length).toBeGreaterThan(0);
    expect(OFFICIAL_SET.version).toBeGreaterThanOrEqual(1);
  });

  it('約120種類：コモン72・レア32・エピック16、レジェンドなし', () => {
    expect(OFFICIAL_CARDS).toHaveLength(120);
    expect(count(OFFICIAL_CARDS, 'common')).toBe(72);
    expect(count(OFFICIAL_CARDS, 'rare')).toBe(32);
    expect(count(OFFICIAL_CARDS, 'epic')).toBe(16);
    expect(count(OFFICIAL_CARDS, 'legend')).toBe(0);
  });

  it('ID は official-<slug> で重ならない。名前も重ならず、プリセット・サンプル・テンプレートの名前とも違う', () => {
    const ids = OFFICIAL_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(new RegExp(`^${OFFICIAL_ID_PREFIX}[a-z0-9-]+$`));
    const names = OFFICIAL_CARDS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    const others = new Set([
      ...PRESET_DECKS.flatMap((p) => p.cards.map((c) => c.name)),
      ...SAMPLE_CARDS.map((c) => c.name),
      ...TEMPLATES.map((t) => t.build('x').name),
    ]);
    expect(names.filter((n) => others.has(n))).toEqual([]);
    for (const n of names) expect(n.length, n).toBeLessThanOrEqual(BALANCE.card.nameMaxLength);
  });

  it('すべてのカードがカード作成のルールを守る', () => {
    for (const c of OFFICIAL_CARDS) {
      const a = analyzeCard(c);
      expect(
        a.violations.map((v) => v.message),
        c.name,
      ).toEqual([]);
    }
  });

  it('予算を使い切っている（どのカードも上限との差がレアリティ上限の3割以内）', () => {
    for (const c of OFFICIAL_CARDS) {
      const a = analyzeCard(c);
      expect(a.points.remaining, c.name).toBeGreaterThanOrEqual(0);
      expect(a.points.remaining, c.name).toBeLessThanOrEqual(a.points.cap * 0.3);
    }
  });

  it('絵は game-icons の存在するアイコン（"gi:<名前>"）。同じ絵は使い回さない', () => {
    const index = JSON.parse(readFileSync(join(ROOT, 'src', 'ui', 'icons', 'generated', 'index.json'), 'utf8')) as { names: string[] };
    const names = new Set(index.names);
    for (const c of OFFICIAL_CARDS) {
      expect(c.icon, c.name).toMatch(/^gi:[a-z0-9-]+$/);
      expect(names.has(c.icon.slice(3)), `${c.name}: ${c.icon}`).toBe(true);
    }
    const icons = OFFICIAL_CARDS.map((c) => c.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('説明は80文字以内で、ほとんどのカードにある', () => {
    for (const c of OFFICIAL_CARDS) {
      if (c.description === undefined) continue;
      expect(c.description.trim(), c.name).toBe(c.description);
      expect(c.description.length, c.name).toBeGreaterThan(0);
      expect(descriptionLength(c.description), c.name).toBeLessThanOrEqual(CARD_DESCRIPTION_MAX);
    }
    expect(OFFICIAL_CARDS.filter((c) => c.description).length).toBeGreaterThanOrEqual(OFFICIAL_CARDS.length * 0.9);
  });

  it('役割の1行がすべてのカードにある', () => {
    for (const e of OFFICIAL_ENTRIES) {
      expect(e.role.length, e.card.name).toBeGreaterThan(0);
      expect(e.role, e.card.name).not.toContain('\n');
    }
  });

  it('コモンは読みやすい（能力・モードなし、効果は3つまで、条件は1つまで）', () => {
    for (const c of OFFICIAL_CARDS.filter((x) => x.rarity === 'common')) {
      expect(c.abilities ?? [], c.name).toEqual([]);
      expect(
        c.effects.filter((e) => e.mode !== undefined),
        c.name,
      ).toEqual([]);
      expect(c.effects.length, c.name).toBeLessThanOrEqual(3);
      expect(c.effects.filter((e) => e.condition !== null).length, c.name).toBeLessThanOrEqual(1);
    }
  });

  it('引く窓口：ID・アーキタイプ・絞り込み', () => {
    const first = OFFICIAL_ENTRIES[0]!;
    expect(officialCard(first.card.id)).toBe(first.card);
    expect(isOfficialCardId(first.card.id)).toBe(true);
    expect(isOfficialCardId('preset-dokubari')).toBe(false);
    expect(officialCard('nope')).toBeUndefined();
    expect(officialArchetypeOf(first.card.id)).toBe(first.archetype);
    for (const a of OFFICIAL_ARCHETYPE_IDS) {
      for (const c of officialCardsOf(a, 'rare')) {
        expect(officialArchetypeOf(c.id)).toBe(a);
        expect(c.rarity).toBe('rare');
      }
    }
    expect(OFFICIAL_ARCHETYPES.map((a) => a.id)).toEqual([...OFFICIAL_ARCHETYPE_IDS]);
  });
});

describe('アーキタイプ', () => {
  it('5つの色と汎用。どの色にもコモン12・レア5・エピック3、汎用はコモン12・レア7・エピック1', () => {
    expect(COLORS).toHaveLength(5);
    for (const a of COLORS) {
      expect([officialCardsOf(a, 'common').length, officialCardsOf(a, 'rare').length, officialCardsOf(a, 'epic').length], a).toEqual([12, 5, 3]);
    }
    expect([officialCardsOf('neutral', 'common').length, officialCardsOf('neutral', 'rare').length, officialCardsOf('neutral', 'epic').length]).toEqual([
      12, 7, 1,
    ]);
  });

  for (const a of COLORS) {
    describe(a, () => {
      const commons = officialCardsOf(a, 'common');
      it('コモンだけで序盤・中盤・終盤がそろう（コスト1以下3種類以上・2〜3が4種類以上・4以上が1種類以上）', () => {
        expect(commons.filter((c) => c.cost <= 1).length).toBeGreaterThanOrEqual(3);
        expect(commons.filter((c) => c.cost >= 2 && c.cost <= 3).length).toBeGreaterThanOrEqual(4);
        expect(commons.filter((c) => c.cost >= 4).length).toBeGreaterThanOrEqual(1);
      });
      it('コモンにモンスター（序盤のモンスターを含む）と除去がある', () => {
        const monsters = commons.filter((c) => c.stats !== null);
        expect(monsters.length).toBeGreaterThanOrEqual(5);
        expect(monsters.filter((c) => c.cost <= 2).length).toBeGreaterThanOrEqual(3);
        expect(commons.filter(isRemoval).length).toBeGreaterThanOrEqual(2);
      });
    });
  }

  it('種族のシナジー：獣と機械の色には、その種族のモンスターと種族を見るカードがある', () => {
    for (const [a, tribe] of [
      ['beast', 'beast'],
      ['machine', 'machine'],
    ] as const) {
      const cards = OFFICIAL_ENTRIES.filter((e) => e.archetype === a).map((e) => e.card);
      expect(cards.filter((c) => c.stats && c.tribe === tribe).length, a).toBeGreaterThanOrEqual(6);
      const synergy = cards.filter((c) =>
        c.effects.some((e) => e.condition === 'tribeAlly' || e.target === 'tribeAllies' || e.mods?.includes('perTribeAlly') || e.option === 'tribe'),
      );
      expect(synergy.length, a).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('デッキとして組める', () => {
  const cardMap = new Map(OFFICIAL_CARDS.map((c) => [c.id, c]));

  for (const a of OFFICIAL_ARCHETYPE_IDS) {
    it(`${a}：コモンだけの30枚のデッキがデッキのルールを守る`, () => {
      const deck = officialCommonDeck(a);
      expect(deck.entries.reduce((n, e) => n + e.count, 0)).toBe(BALANCE.deck.size);
      for (const e of deck.entries) expect(BY_ID.get(e.cardId)?.rarity).toBe('common');
      const r = analyzeDeck(deck, cardMap);
      expect(r.violations.map((v) => v.message)).toEqual([]);
    });
  }

  it('ドラフトで取れるレア・エピックの回数（同じものを2枚ずつ）は、デッキのルールの枚数から決まる', () => {
    expect(BALANCE.rarity.rare.deckLimit! / COPIES).toBe(4);
    expect(BALANCE.rarity.epic.deckLimit! / COPIES).toBe(2);
    expect(BALANCE.rarity.rare.perNameLimit!).toBeGreaterThanOrEqual(COPIES);
    expect(BALANCE.rarity.epic.perNameLimit!).toBeGreaterThanOrEqual(COPIES);
  });

  const deckOf = (picks: CardDef[]): Deck => ({ v: 1, id: 'd', name: 'd', entries: picks.map((c) => ({ cardId: c.id, count: COPIES })) });

  for (const a of COLORS) {
    it(`${a}：ドラフトの上限まで（レア4回・エピック2回）取った30枚がデッキのルールを守る`, () => {
      const picks = [...officialCardsOf(a, 'rare').slice(0, 4), ...officialCardsOf(a, 'epic').slice(0, 2), ...officialCardsOf(a, 'common').slice(0, 9)];
      expect(picks.length * COPIES).toBe(BALANCE.deck.size);
      const r = analyzeDeck(deckOf(picks), cardMap);
      expect(r.violations.map((v) => v.message)).toEqual([]);
    });
  }

  it('上限を超えて取るとデッキのルールに反する（レア5回・エピック3回）', () => {
    const rares = OFFICIAL_CARDS.filter((c) => c.rarity === 'rare').slice(0, 5);
    const commons = OFFICIAL_CARDS.filter((c) => c.rarity === 'common').slice(0, 10);
    expect(analyzeDeck(deckOf([...rares, ...commons]), cardMap).violations.map((v) => v.code)).toContain('DECK_RARITY_LIMIT');
    const epics = OFFICIAL_CARDS.filter((c) => c.rarity === 'epic').slice(0, 3);
    expect(analyzeDeck(deckOf([...epics, ...commons.slice(0, 12)]), cardMap).violations.map((v) => v.code)).toContain('DECK_RARITY_LIMIT');
  });
});

describe('純粋さ（Edge Function の束にも入る）', () => {
  const dir = join(ROOT, 'src', 'official');
  const files = readdirSync(dir).map((f) => join(dir, f));
  it.each([
    ['Math.random', /Math\.random/],
    ['Date', /\bDate\b/],
    ['localStorage', /localStorage/],
    ['window', /\bwindow\./],
    ['document', /\bdocument\./],
    ['react', /from ['"]react/],
    ['src/ui', /from ['"]\.\.\/ui\//],
  ])('src/official は %s を使わない', (_name, pattern) => {
    expect(files.filter((f) => pattern.test(readFileSync(f, 'utf8')))).toEqual([]);
  });
});

/** 種類の名前の確認用（アーキタイプの型が網羅されている） */
const _exhaustive: Record<OfficialArchetype, true> = { poison: true, beast: true, curse: true, guard: true, machine: true, neutral: true };
void _exhaustive;
