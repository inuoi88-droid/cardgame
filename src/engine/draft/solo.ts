/**
 * ひとりで選ぶ形式のドラフト（CPU 戦の旧形式。元は src/ui/battle/draft.ts）。
 * カードの山から offer 枚ずつ見せて1枚を選ぶのを rounds 回、1回で copies 枚ずつデッキに入る。
 * 候補はデッキのルール（レアリティの枚数・同名の上限）を破らないものだけ。乱数は呼び出し側が渡す。
 */
import { BALANCE } from '../balance.ts';
import type { CardDef } from '../types.ts';
import { cpuPick } from './pick.ts';
import { addPick, canAdd } from './pool.ts';
import type { DraftCounts } from './types.ts';

const D = BALANCE.draft;

/** 今回の候補（足せるものから offer 枚。足せるものが少なければその数だけ） */
export function makeOffer(pool: readonly CardDef[], counts: DraftCounts, random: () => number): CardDef[] {
  const byId = new Map(pool.map((c) => [c.id, c]));
  const ok = pool.filter((c) => canAdd(counts, c, byId));
  const out: CardDef[] = [];
  const rest = [...ok];
  while (out.length < D.offer && rest.length > 0) {
    const i = Math.floor(random() * rest.length);
    out.push(rest.splice(Math.min(i, rest.length - 1), 1)[0]!);
  }
  return out;
}

/** CPU のドラフト（同じ山から自分の rounds 回を選ぶ） */
export function runCpuDraft(pool: readonly CardDef[], random: () => number): Record<string, number> {
  const byId = new Map(pool.map((c) => [c.id, c]));
  let counts: Record<string, number> = {};
  for (let r = 0; r < D.rounds; r++) {
    const pick = cpuPick(makeOffer(pool, counts, random), counts, byId);
    if (!pick) break;
    counts = addPick(counts, pick);
  }
  return counts;
}
