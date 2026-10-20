// エディターの選択パネル（プルダウンの代わり）の選択肢：すべてのタイミング・条件が見出しと説明つきで出ること、
// 効果ごとの制限（タイミング・対象・数値の倍数）が反映されること
import { describe, expect, it } from 'vitest';
import {
  CONDITIONS,
  CONDITION_GROUPS,
  TIMINGS,
  TIMING_GROUPS,
  createEffect,
  modifiersFor,
  getEffect,
  newCard,
  setMonster,
  type CardDef,
  type EffectInstance,
} from '../src/engine/index.ts';
import { conditionOptions, effectOptionOptions, effectTimingOptions, targetOptions, tribeFromValue, tribeOptions, tribeValue } from '../src/ui/editor/pickOptions.ts';

const spell = (): CardDef => ({ ...newCard('t-spell'), name: '試し' });
const monster = (): CardDef => setMonster({ ...newCard('t-mon'), name: '試し' }, true);

describe('選択パネルの選択肢', () => {
  it('すべてのタイミングが見出し（TIMING_GROUPS）と説明つきで、見出しの順に並ぶ', () => {
    for (const card of [spell(), monster()]) {
      const e = createEffect('damage', card.stats ? 'monster' : 'spell');
      const opts = effectTimingOptions(e, card);
      expect(opts.map((o) => o.id).sort()).toEqual(Object.keys(TIMINGS).sort());
      for (const o of opts) {
        expect(TIMING_GROUPS as readonly string[]).toContain(o.group);
        expect(o.description?.length ?? 0).toBeGreaterThan(0);
      }
      const ranks = opts.map((o) => TIMING_GROUPS.indexOf(o.group as (typeof TIMING_GROUPS)[number]));
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    }
  });

  it('すべての条件が見出し（CONDITION_GROUPS）と説明つきで出る（先頭は「なし」）', () => {
    const card = monster();
    const opts = conditionOptions(createEffect('damage', 'monster'), card);
    expect(opts[0]!.id).toBe('');
    const rest = opts.slice(1);
    expect(rest.map((o) => o.id).sort()).toEqual(Object.keys(CONDITIONS).sort());
    for (const o of rest) {
      expect(CONDITION_GROUPS as readonly string[]).toContain(o.group);
      expect(o.description?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('効果ごとのタイミングの制限（再行動は使用時・召喚時だけ）は理由つきで選べない', () => {
    const card = monster();
    const e = createEffect('ready', 'monster');
    const opts = effectTimingOptions(e, card);
    expect(opts.find((o) => o.id === 'summon')?.disabled).toBeUndefined();
    expect(opts.find((o) => o.id === 'turnEnd')?.disabled).toBe('この効果では使えません');
    expect(opts.find((o) => o.id === 'play')?.disabled).toBe('モンスター以外のカード専用');
  });

  it('対象は土台を見て選ぶ（モンスターなら「このモンスター」、再行動は外す）', () => {
    const card = monster();
    const train: EffectInstance = createEffect('train', 'monster');
    expect(targetOptions(train, card).map((o) => o.id)).toContain('thisMonster');
    const ready = createEffect('ready', 'monster');
    const ids = targetOptions(ready, card).filter((o) => !o.disabled).map((o) => o.id);
    expect(ids).not.toContain('thisMonster');
    expect(ids).not.toContain('allyMonsters');
  });

  it('条件の除外タイミング（ターン開始時の「このターン相手にダメージを与えた」）は理由つき', () => {
    const card = spell();
    const e = { ...createEffect('damage', 'spell'), timing: 'turnStart' as const };
    const o = conditionOptions(e, card).find((x) => x.id === 'enemyDamagedThisTurn');
    expect(o?.disabled).toContain('自分のターン開始時');
  });

  it('数値の倍数（X など）は scalable な効果だけ、X は使用時・召喚時だけ', () => {
    const dmg = getEffect('damage')!;
    expect(modifiersFor(dmg, 'play').map((m) => m.id)).toContain('xEnergy');
    expect(modifiersFor(dmg, 'turnEnd').map((m) => m.id)).not.toContain('xEnergy');
    // 格闘は数値がないので倍数は付かない（遅延「次のターンに」だけ。○ バッチA）
    expect(modifiersFor(getEffect('fight')!, 'play').map((m) => m.id)).toEqual(['nextTurn']);
  });
});

describe('種族（MTG 要素 ○ バッチC2）', () => {
  it('種族の無いカードでは「同じ種族」の条件・対象・サーチの指定が灰色（理由つき）、種族を選ぶと選べる', () => {
    const card = spell();
    const dmg = createEffect('damage', 'spell');
    const cond = (c: CardDef) => conditionOptions(dmg, c).find((o) => o.id === 'tribeAlly')!;
    expect(cond(card).disabled).toContain('種族');
    expect(cond({ ...card, tribe: 'beast' }).disabled).toBeUndefined();
    const train = createEffect('train', 'spell');
    const target = (c: CardDef) => targetOptions(train, c).find((o) => o.id === 'tribeAllies')!;
    expect(target(card).disabled).toContain('種族');
    expect(target({ ...card, tribe: 'beast' }).disabled).toBeUndefined();
    const search = createEffect('search', 'spell');
    const opt = (c: CardDef) => effectOptionOptions(search, c).find((o) => o.id === 'tribe')!;
    expect(opt(card).disabled).toContain('種族');
    expect(opt({ ...card, tribe: 'dragon' }).disabled).toBeUndefined();
    expect(tribeOptions().map((o) => o.label)).toEqual(['なし', '獣', '竜', '不死', '機械', '精霊', '人']);
    expect(tribeFromValue(tribeValue('human'))).toBe('human');
    expect(tribeFromValue(tribeValue(undefined))).toBeNull();
  });

  it('タイミングの見出し「英雄譚」「蓄積」：蓄積がたまったときは能力「蓄積」が無いと灰色', () => {
    const opts = effectTimingOptions(createEffect('damage', 'spell'), spell());
    expect(opts.find((o) => o.id === 'chapter1')).toMatchObject({ group: '英雄譚', disabled: undefined });
    expect(opts.find((o) => o.id === 'charged')!.disabled).toContain('蓄積');
  });
});

describe('MTG 要素 △ バッチD の選択肢', () => {
  it('効果「フィールド」の追加指定は6つのフィールドが説明つきで出る。条件「昼なら／夜なら」は見出し「昼と夜」で選べる', () => {
    const card = spell();
    const e = createEffect('setField', 'spell');
    const opts = effectOptionOptions(e, card);
    expect(opts).toHaveLength(6);
    for (const o of opts) expect(o.description?.length ?? 0).toBeGreaterThan(0);
    const conds = conditionOptions(createEffect('damage', 'spell'), card);
    for (const id of ['isDay', 'isNight']) {
      const o = conds.find((x) => x.id === id);
      expect(o?.group).toBe('昼と夜');
      expect(o?.disabled).toBeUndefined();
    }
  });
});
