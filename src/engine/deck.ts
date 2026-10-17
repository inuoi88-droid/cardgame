/** デッキの検証とカード名の扱い */
import { analyzeCard } from './analyze.ts';
import { BALANCE } from './balance.ts';
import { RARITY_LABEL } from './labels.ts';
import { RARITIES, type CardDef, type Deck, type Rarity, type Violation } from './types.ts';

/** 同名判定に使う名前（前後の空白を無視） */
export function normalizeName(name: string): string {
  return name.trim();
}

/** コレクション内で名前が使われているか（exceptId のカードは除く） */
export function isNameTaken(cards: readonly CardDef[], name: string, exceptId?: string): boolean {
  const key = normalizeName(name);
  return cards.some((c) => c.id !== exceptId && normalizeName(c.name) === key);
}

/** 使われていない名前にする（重なったら末尾に「(2)」「(3)」…を付ける） */
export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  const base = normalizeName(name);
  if (!taken.has(base)) return base;
  const max = BALANCE.card.nameMaxLength;
  for (let i = 2; ; i++) {
    const suffix = `(${i})`;
    const candidate = [...base].slice(0, max - suffix.length).join('') + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface RarityRow {
  rarity: Rarity;
  /** 呪いを除いた枚数 */
  count: number;
  /** デッキ全体での上限（null は制限なし） */
  limit: number | null;
}

export interface DeckAnalysis {
  total: number;
  size: number;
  rarityRows: RarityRow[];
  curseCount: number;
  violations: Violation[];
  valid: boolean;
}

export function analyzeDeck(deck: Deck, cardsById: ReadonlyMap<string, CardDef>): DeckAnalysis {
  const out: Violation[] = [];
  const size = BALANCE.deck.size;

  if (normalizeName(deck.name).length === 0) {
    out.push({ code: 'DECK_NAME_EMPTY', path: 'name', message: 'デッキ名を入力してください' });
  }

  const byRarity: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legend: 0 };
  const sameName = new Map<string, { count: number; limit: number | null; rarity: Rarity }>();
  let total = 0;
  let curseCount = 0;
  const seenIds = new Set<string>();

  deck.entries.forEach((entry, i) => {
    const path = `entries.${i}`;
    if (!Number.isInteger(entry.count) || entry.count < 1) {
      out.push({ code: 'DECK_COUNT', path, message: '枚数が正しくないカードがあります' });
      return;
    }
    if (seenIds.has(entry.cardId)) {
      out.push({ code: 'DECK_DUPLICATE_ENTRY', path, message: '同じカードが2か所に入っています' });
    }
    seenIds.add(entry.cardId);
    total += entry.count;

    const card = cardsById.get(entry.cardId);
    if (!card) {
      out.push({ code: 'DECK_MISSING_CARD', path, message: `見つからないカードが${entry.count}枚入っています（削除されたカード）` });
      return;
    }
    const a = analyzeCard(card);
    if (!a.valid) {
      out.push({ code: 'DECK_INVALID_CARD', path, message: `「${card.name}」はルール違反のため使えません（カードを直してください）` });
    }
    // 呪いカードも、元のレアリティの枚数制限に従う（決定事項 #64）
    if (a.isCurse) curseCount += entry.count;
    if (!(RARITIES as readonly string[]).includes(card.rarity)) return;
    byRarity[card.rarity] += entry.count;
    const key = normalizeName(card.name);
    const limit = BALANCE.rarity[card.rarity].perNameLimit;
    const prev = sameName.get(key);
    if (prev) {
      prev.count += entry.count;
      if (limit !== null && (prev.limit === null || limit < prev.limit)) {
        prev.limit = limit;
        prev.rarity = card.rarity;
      }
    } else {
      sameName.set(key, { count: entry.count, limit, rarity: card.rarity });
    }
  });

  if (total !== size) {
    out.push({ code: 'DECK_SIZE', path: 'entries', message: `デッキは${size}枚ちょうどにしてください（いま${total}枚）` });
  }

  const rarityRows: RarityRow[] = RARITIES.map((rarity) => ({
    rarity,
    count: byRarity[rarity],
    limit: BALANCE.rarity[rarity].deckLimit,
  }));
  for (const row of rarityRows) {
    if (row.limit !== null && row.count > row.limit) {
      out.push({
        code: 'DECK_RARITY_LIMIT',
        path: `rarity.${row.rarity}`,
        message: `${RARITY_LABEL[row.rarity]}は計${row.limit}枚までです（いま${row.count}枚）`,
      });
    }
  }
  for (const [name, s] of sameName) {
    if (s.limit !== null && s.count > s.limit) {
      out.push({
        code: 'DECK_SAME_NAME',
        path: `name.${name}`,
        message: `「${name}」（${RARITY_LABEL[s.rarity]}）は同名${s.limit}枚までです（いま${s.count}枚）`,
      });
    }
  }

  return { total, size, rarityRows, curseCount, violations: out, valid: out.length === 0 };
}
