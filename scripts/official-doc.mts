/**
 * docs/OFFICIAL_SET.md の「## カードの一覧」から下を、今の公式カード（src/official）から作り直す。
 *   node scripts/official-doc.mts
 * 数字はゲーム内の倍率（今の SCALE）。カードの文はエンジンの describeCard と同じ
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyCard, describeCard } from '../src/engine/index.ts';
import { CARD_TYPE_LABEL } from '../src/engine/labels.ts';
import { TRIBE_LABEL } from '../src/engine/types.ts';
import { OFFICIAL_ARCHETYPES, OFFICIAL_ENTRIES } from '../src/official/index.ts';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'OFFICIAL_SET.md');
const HEAD = '## カードの一覧';
const R = { common: 'C', rare: 'R', epic: 'E', legend: 'L' } as const;
const ORDER = { common: 0, rare: 1, epic: 2, legend: 3 } as const;

const out: string[] = [HEAD, '', '役割の1行は `OfficialEntry.role`（倍率で変わる数値は書かない）。この節は `node scripts/official-doc.mts` で作り直す。', ''];
for (const a of OFFICIAL_ARCHETYPES) {
  const list = OFFICIAL_ENTRIES.filter((e) => e.archetype === a.id)
    .map((e, i) => ({ e, i }))
    .sort((x, y) => ORDER[x.e.card.rarity] - ORDER[y.e.card.rarity] || x.e.card.cost - y.e.card.cost || x.i - y.i)
    .map((x) => x.e);
  const n = (r: string) => list.filter((e) => e.card.rarity === r).length;
  out.push(`### ${a.name}（${a.id}）`, '', `${a.description}。コモン${n('common')}・レア${n('rare')}・エピック${n('epic')}。`, '');
  out.push('| レア | コスト | 名前 | 種類 | ステータス | 効果（ゲーム内の数字） | 役割 |', '|---|---|---|---|---|---|---|');
  for (const { card: c, role } of list) {
    const t = describeCard(c);
    const type = `${CARD_TYPE_LABEL[classifyCard(c)]}${c.tribe ? `（${TRIBE_LABEL[c.tribe]}）` : ''}`;
    const stats = c.stats ? `${c.stats.attack}/${c.stats.hp}${c.stats.defense ? `/${c.stats.defense}` : ''}` : '—';
    const text = [...t.keywords.map((k) => k.name), ...t.effects, ...t.drawbacks.map((d) => `［デメリット］${d}`), ...t.abilities.map((x) => x.name)].join(' ') || '—';
    out.push(`| ${R[c.rarity]} | ${c.cost} | ${c.name} | ${type} | ${stats} | ${text} | ${role} |`);
  }
  out.push('');
}
const src = readFileSync(FILE, 'utf8');
const at = src.indexOf(HEAD);
if (at < 0) throw new Error(`${HEAD} が見つかりません`);
writeFileSync(FILE, src.slice(0, at) + out.join('\n'));
console.log('official-doc: docs/OFFICIAL_SET.md');
