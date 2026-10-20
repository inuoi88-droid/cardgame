/** カード作成ルールの検証。違反があれば理由を返す（空なら作成できる）。 */
import { BALANCE } from './balance.ts';
import { cardBase, classifyCard, isCurseCard, rarityRank } from './classify.ts';
import { drawbackValueSpec, type ParamSpec } from './define.ts';
import { CARD_TYPE_LABEL, RARITY_LABEL } from './labels.ts';
import { isIntInRange } from './math.ts';
import { effectPoints, modifierFits, rarityCap } from './points.ts';
import {
  CHAPTER_TIMINGS,
  CONDITIONS,
  MODE_TIMINGS,
  TIMINGS,
  TRAP_TIMINGS,
  TRIBE_TARGETS,
  chapterOf,
  conditionsFor,
  costConditions,
  hasAnyAbility,
  isPowerTiming,
  targetLabel,
  targetsForEffect,
} from './options.ts';
import { getAbility, getDrawback, getEffect, getKeyword, getModifier } from './registry.ts';
import { growHits } from './defs/abilities/grow.ts';
import { MODE_IDS, MODE_LABEL, RARITIES, TRIBE_IDS, type CardDef, type ModeId, type PointSummary, type TimingId, type Violation } from './types.ts';

/** 能力が要るタイミング（MTG 要素 ○ バッチC1）の違反コード：能力が無いのにそのタイミングの効果がある／能力があるのに効果が無い */
const ABILITY_TIMING_CODE: Partial<Record<TimingId, string>> = {
  fromDiscard: 'FROM_DISCARD_WITHOUT_ABILITY',
  activated: 'ACTIVATE_MISMATCH',
  channel: 'CHANNEL_MISMATCH',
  charged: 'CHARGE_MISMATCH',
  // MTG 要素 △ バッチB
  renew: 'RENEW_MISMATCH',
  forecast: 'FORECAST_MISMATCH',
};

/** 相手に作用する効果か（最悪の二択のモード。MTG 要素 △ バッチB）：作用先が相手側か場全体、または「お互い」 */
function actsOnOpponent(e: CardDef['effects'][number]): boolean {
  const rule = getEffect(e.id)?.targetRule;
  if (e.target === 'bothPlayers') return true;
  return rule === 'enemyAny' || rule === 'enemyMonster' || rule === 'enemyMonsterOne' || rule === 'enemyPlayer' || rule === 'fight' || rule === 'board';
}

/** 種族のあるカードでしか使えない要素（MTG 要素 ○ バッチC2）を、この効果が使っているか。使っていればその名前 */
function tribeUse(e: CardDef['effects'][number]): string | null {
  if (TRIBE_TARGETS.includes(e.target)) return `対象「${targetLabel(e.target, 'allyMonsterOne', e.timing)}」`;
  if (e.condition && CONDITIONS[e.condition]?.requiresTribe) return `条件「${CONDITIONS[e.condition].label}」`;
  const mod = (e.mods ?? []).map((m) => getModifier(m)).find((m) => m?.id === 'perTribeAlly');
  if (mod) return `「${mod.name}」`;
  if (e.option === 'tribe') return '「同じ種族」の指定';
  return null;
}

function checkParam(
  out: Violation[],
  code: string,
  path: string,
  what: string,
  spec: ParamSpec | undefined,
  v: number | undefined,
): void {
  if (!spec) return;
  if (!isIntInRange(v, spec.min, spec.max)) {
    out.push({ code, path, message: `${what}の${spec.label}は${spec.min}〜${spec.max}の整数にしてください` });
  }
}

export function validateCard(card: CardDef, points: PointSummary): Violation[] {
  const out: Violation[] = [];
  const base = cardBase(card);
  const C = BALANCE.card;
  const S = BALANCE.stats;

  // 基本情報
  const name = card.name.trim();
  if (name.length === 0) out.push({ code: 'NAME_EMPTY', path: 'name', message: 'カード名を入力してください' });
  if ([...name].length > C.nameMaxLength) {
    out.push({ code: 'NAME_TOO_LONG', path: 'name', message: `カード名は${C.nameMaxLength}文字までです` });
  }
  if (card.icon.trim().length === 0) out.push({ code: 'ICON_EMPTY', path: 'icon', message: 'アイコンを選んでください' });
  const rarityOk = (RARITIES as readonly string[]).includes(card.rarity);
  if (!rarityOk) out.push({ code: 'RARITY_INVALID', path: 'rarity', message: 'レアリティが正しくありません' });
  if (!isIntInRange(card.cost, C.costMin, C.costMax)) {
    out.push({ code: 'COST_RANGE', path: 'cost', message: `コストは${C.costMin}〜${C.costMax}の整数にしてください` });
  }
  // 種族（MTG 要素 ○ バッチC2）
  if (card.tribe !== undefined && !(TRIBE_IDS as readonly string[]).includes(card.tribe)) {
    out.push({ code: 'TRIBE_INVALID', path: 'tribe', message: '種族が正しくありません' });
  }

  // ステータス
  if (card.stats) {
    const { attack, hp, defense } = card.stats;
    if (!isIntInRange(attack, S.attackMin, S.attackMax)) {
      out.push({ code: 'STAT_ATTACK', path: 'stats.attack', message: `攻撃力は${S.attackMin}〜${S.attackMax}の整数にしてください` });
    }
    if (!isIntInRange(hp, S.hpMin, S.hpMax)) {
      out.push({ code: 'STAT_HP', path: 'stats.hp', message: `体力は${S.hpMin}〜${S.hpMax}の整数にしてください` });
    }
    if (!isIntInRange(defense, S.defenseMin, S.defenseMax)) {
      out.push({ code: 'STAT_DEFENSE', path: 'stats.defense', message: `守備力は${S.defenseMin}〜${S.defenseMax}の整数にしてください（上限${S.defenseMax}）` });
    }
  }

  // キーワード
  if (base !== 'monster' && card.keywords.length > 0) {
    out.push({ code: 'KEYWORD_NOT_MONSTER', path: 'keywords', message: 'キーワードはモンスター専用です' });
  }
  const seenKeywords = new Set<string>();
  card.keywords.forEach((k, i) => {
    const def = getKeyword(k.id);
    const path = `keywords.${i}`;
    if (!def) {
      out.push({ code: 'KEYWORD_UNKNOWN', path, message: `不明なキーワードです（${k.id}）` });
      return;
    }
    if (seenKeywords.has(k.id)) out.push({ code: 'KEYWORD_DUPLICATE', path, message: `キーワード「${def.name}」は1回までです` });
    seenKeywords.add(k.id);
    checkParam(out, 'KEYWORD_VALUE', path, `「${def.name}」`, def.value, k.value);
  });

  // 効果
  if (base === 'spell' && card.effects.length === 0) {
    out.push({ code: 'EFFECT_REQUIRED', path: 'effects', message: 'モンスター以外のカードには効果が1つ以上必要です' });
  }
  const maxEffects = rarityOk ? BALANCE.rarity[card.rarity].maxEffects : 0;
  if (rarityOk && card.effects.length > maxEffects) {
    out.push({
      code: 'EFFECT_TOO_MANY',
      path: 'effects',
      message: `${RARITY_LABEL[card.rarity]}の効果は${maxEffects}つまでです（いま${card.effects.length}つ）`,
    });
  }
  card.effects.forEach((e, i) => {
    const def = getEffect(e.id);
    const path = `effects.${i}`;
    if (!def) {
      out.push({ code: 'EFFECT_UNKNOWN', path, message: `不明な効果です（${e.id}）` });
      return;
    }
    const what = `「${def.name}」`;
    if (def.minRarity && rarityOk && rarityRank(card.rarity) < rarityRank(def.minRarity)) {
      const limit = def.minRarity === 'legend' ? 'レジェンドのみ' : `${RARITY_LABEL[def.minRarity]}以上のカード`;
      out.push({ code: 'EFFECT_RARITY', path, message: `${what}は${limit}で使えます` });
    }
    // 付けられる土台（新生はモンスターのカードだけ。MTG 要素 ○ バッチB）
    if (def.bases && !def.bases.includes(base)) {
      out.push({ code: 'EFFECT_BASE', path, message: `${what}は${def.bases.includes('monster') ? 'モンスター' : 'モンスター以外'}のカードにしか付けられません` });
    }
    checkParam(out, 'EFFECT_VALUE', `${path}.value`, what, def.value, e.value);
    checkParam(out, 'EFFECT_HITS', `${path}.hits`, what, def.hits, e.hits);
    if (def.option && e.option !== undefined && !def.option.choices.some((c) => c.id === e.option)) {
      out.push({ code: 'EFFECT_OPTION', path: `${path}.option`, message: `${what}の${def.option.label}が正しくありません` });
    }
    // 追加指定ごとのレアリティ（倍化の「3倍」はレジェンドだけ。MTG 要素 △ バッチA）
    const optRarity = e.option !== undefined ? def.optionMinRarity?.[e.option] : undefined;
    if (optRarity && rarityOk && rarityRank(card.rarity) < rarityRank(optRarity)) {
      const label = def.option?.choices.find((c) => c.id === e.option)?.label ?? e.option;
      out.push({
        code: 'OPTION_RARITY',
        path: `${path}.option`,
        message: `${what}の「${label}」は${optRarity === 'legend' ? 'レジェンドのみ' : `${RARITY_LABEL[optRarity]}以上のカード`}で使えます`,
      });
    }

    const timing = TIMINGS[e.timing];
    if (!timing) {
      out.push({ code: 'EFFECT_TIMING', path: `${path}.timing`, message: `${what}の発動タイミングが正しくありません` });
      return;
    }
    if (!timing.bases.includes(base)) {
      const who = base === 'monster' ? 'モンスター以外' : 'モンスター';
      out.push({ code: 'EFFECT_TIMING', path: `${path}.timing`, message: `「${timing.label}」は${who}専用のタイミングです` });
    } else if (def.timings && !def.timings.includes(e.timing)) {
      const ok = def.timings.map((t) => `「${TIMINGS[t].label}」`).join('・');
      out.push({ code: 'EFFECT_TIMING', path: `${path}.timing`, message: `${what}は${ok}でしか使えません` });
    }
    // 能力が要るタイミング（起動・魂力・捨て札から使ったとき。MTG 要素 ○ バッチC1）
    if (timing.requiresAbility && !hasAnyAbility(card.abilities, timing.requiresAbility)) {
      const names = timing.requiresAbility.map((id) => `「${getAbility(id)?.name ?? id}」`).join('・');
      out.push({
        code: ABILITY_TIMING_CODE[e.timing] ?? 'EFFECT_TIMING',
        path: `${path}.timing`,
        message: `「${timing.label}」の効果は、カードの能力${names}があるカードにしか付けられません`,
      });
    }
    if (!targetsForEffect(def, e.timing, base).includes(e.target)) {
      const label = BALANCE.target[e.target] !== undefined ? targetLabel(e.target, def.targetRule, e.timing) : e.target;
      out.push({ code: 'EFFECT_TARGET', path: `${path}.target`, message: `${what}（${timing.label}）の対象に「${label}」は選べません` });
    }
    if (e.condition !== null) {
      const cond = CONDITIONS[e.condition];
      if (!cond) {
        out.push({ code: 'EFFECT_CONDITION', path: `${path}.condition`, message: `${what}の条件が正しくありません` });
      } else if (cond.requiresAbility && !hasAnyAbility(card.abilities, cond.requiresAbility)) {
        // キッカーを払っていれば（MTG 要素 ○ バッチC1）・協約したなら（△ バッチB）：その能力のあるカードだけ
        const need = cond.requiresAbility.map((id) => `「${getAbility(id)?.name ?? id}」`).join('・');
        out.push({
          code: e.condition === 'bargained' ? 'BARGAIN_MISMATCH' : 'KICKER_MISMATCH',
          path: `${path}.condition`,
          message: `条件「${cond.label}」は、カードの能力${need}があるカードにしか付けられません`,
        });
      } else if (!conditionsFor(e.timing, base, card.abilities).includes(e.condition)) {
        out.push({
          code: 'EFFECT_CONDITION',
          path: `${path}.condition`,
          message: `条件「${cond.label}」は「${timing.label}」では使えません`,
        });
      }
    }
    // 種族のあるカードだけの対象・条件・修飾・指定（MTG 要素 ○ バッチC2）
    const tribal = tribeUse(e);
    if (tribal && !card.tribe) {
      out.push({ code: 'TRIBE_REQUIRED', path, message: `${tribal}は、種族のあるカードにしか付けられません（基本情報で種族を選んでください）` });
    }
    // モード（MTG 要素 ○ バッチC2）：番号と、付けられるタイミング
    if (e.mode !== undefined) {
      if (!(MODE_IDS as readonly number[]).includes(e.mode)) {
        out.push({ code: 'MODE_INVALID', path: `${path}.mode`, message: `${what}のモードが正しくありません` });
      } else if (!MODE_TIMINGS.includes(e.timing)) {
        const ok = MODE_TIMINGS.map((t) => `「${TIMINGS[t].label}」`).join('・');
        out.push({ code: 'MODE_TIMING', path: `${path}.mode`, message: `モードは${ok}の効果にしか付けられません` });
      }
    }
    const mods = e.mods ?? [];
    if (mods.length > 0) {
      const modDefs = mods.map((m) => getModifier(m));
      if (new Set(mods).size !== mods.length || modDefs.some((m) => !m)) {
        out.push({ code: 'EFFECT_MODS', path: `${path}.mods`, message: `${what}のオプションが正しくありません` });
      } else {
        const known = modDefs.filter((m) => m !== undefined);
        if (known.some((m) => m.scope === 'damage') && !def.allowsMods) {
          out.push({ code: 'EFFECT_MODS', path: `${path}.mods`, message: '防御無視・吸収はダメージと連撃にしか付けられません' });
        }
        // 遅延（次のターンに）：付けられない効果（再行動）と、X（全力）との併用（MTG 要素 ○ バッチA）
        const delay = known.filter((m) => m.scope === 'delay');
        if (delay.length > 0 && !modifierFits(delay[0]!, def)) {
          out.push({ code: 'EFFECT_MODS', path: `${path}.mods`, message: `${what}には「${delay[0]!.name}」を付けられません` });
        }
        if (delay.length > 0 && known.some((m) => m.id === 'xEnergy')) {
          out.push({ code: 'DELAY_WITH_X', path: `${path}.mods`, message: `「${delay[0]!.name}」と「${getModifier('xEnergy')!.name}」は同時に付けられません` });
        }
        const scale = known.filter((m) => m.scope === 'scale');
        if (scale.length > 0 && !def.scalable) {
          out.push({ code: 'EFFECT_MODS_SCALE', path: `${path}.mods`, message: `${what}には「${scale[0]!.name}」を付けられません（数値に掛けられない効果です）` });
        } else {
          // ばらつき（MTG 要素 △ バッチA）は量の効果だけ（枚数・ターン数には付けない）
          const amountOnly = scale.find((m) => m.requiresScaledValue);
          if (amountOnly && !def.value?.scaled) {
            out.push({ code: 'EFFECT_MODS_SCALE', path: `${path}.mods`, message: `「${amountOnly.name}」は量（ダメージ・回復など）の効果にしか付けられません` });
          }
        }
        if (scale.length > 1) {
          out.push({ code: 'EFFECT_MODS_SCALE_MULTI', path: `${path}.mods`, message: `数値の倍数（${scale.map((m) => m.name).join('・')}）は1つの効果に1つまでです` });
        }
        for (const m of known) {
          if (m.timings && !m.timings.includes(e.timing)) {
            const ok = m.timings.map((t) => `「${TIMINGS[t].label}」`).join('・');
            out.push({ code: 'EFFECT_MODS_TIMING', path: `${path}.mods`, message: `「${m.name}」は${ok}でしか使えません` });
          }
        }
      }
    }
  });

  // モード選択（MTG 要素 ○ バッチC2）：タイミングごとに、モードは A から順に2〜3種、各モードに効果が1つ以上
  const modeSets = new Map<TimingId, Set<ModeId>>();
  for (const e of card.effects) {
    if (e.mode === undefined || !MODE_TIMINGS.includes(e.timing) || !(MODE_IDS as readonly number[]).includes(e.mode)) continue;
    const set = modeSets.get(e.timing) ?? new Set<ModeId>();
    set.add(e.mode);
    modeSets.set(e.timing, set);
  }
  for (const [timing, set] of modeSets) {
    const max = Math.max(...set);
    const missing = MODE_IDS.filter((m) => m <= max && !set.has(m));
    if (set.size < 2 || missing.length > 0) {
      const need = set.size < 2 ? `モードは2つ以上必要です（いま${[...set].map((m) => MODE_LABEL[m]).join('・')}だけ）` : `モード${missing.map((m) => MODE_LABEL[m]).join('・')}の効果がありません`;
      out.push({ code: 'MODE_INCOMPLETE', path: 'effects', message: `「${TIMINGS[timing].label}」の${need}（モードは A から順に付けます）` });
    }
  }

  // 英雄譚（MTG 要素 ○ バッチC2）：章は第1章から飛ばさずに。他のパワー用のタイミング・デメリット・寿命・蓄積とは混ぜない
  const chapters = new Set(card.effects.map((e) => chapterOf(e.timing)).filter((c) => c > 0));
  if (chapters.size > 0) {
    const last = Math.max(...chapters);
    const gaps = CHAPTER_TIMINGS.slice(0, last).filter((_, i) => !chapters.has(i + 1));
    if (gaps.length > 0) {
      out.push({ code: 'SAGA_CHAPTER_GAP', path: 'effects', message: `英雄譚の章は第1章から順に付けてください（${gaps.map((t) => TIMINGS[t].label).join('・')}がありません）` });
    }
    const otherPower =
      card.effects.some((e) => chapterOf(e.timing) === 0 && isPowerTiming(e.timing, base)) ||
      card.drawbacks.some((d) => isPowerTiming(d.timing, base) || getDrawback(d.id)?.battle.lifespan !== undefined) ||
      (card.abilities ?? []).some((a) => getAbility(a.id)?.battle.charge !== undefined);
    if (otherPower) {
      out.push({
        code: 'SAGA_MIXED',
        path: 'effects',
        message: '英雄譚（章の効果があるカード）には、ほかのパワー用のタイミング（ターン開始時など）の効果・デメリット、寿命、蓄積は付けられません',
      });
    }
  }

  // 1枚のカードのダメージの合計（値×回数）。どのタイミング・対象でも数える（決定事項 #64）
  const damageMax = BALANCE.params.damagePerCardMax;
  const damageTotal = card.effects.reduce((sum, e) => {
    const def = getEffect(e.id);
    if (!def?.isDamage) return sum;
    return sum + (e.value ?? 0) * (def.hits ? (e.hits ?? 0) : 1);
  }, 0);
  if (damageTotal > damageMax) {
    out.push({
      code: 'DAMAGE_TOO_MUCH',
      path: 'effects',
      message: `1枚のカードのダメージ・連撃の合計（値×回数）は${damageMax}までです（いま${damageTotal}）`,
    });
  }

  // 引いたときの効果は、コスト0のときのレアリティ上限まで（コストを上げて得た予算で「引くだけで得をする」カードを作らせない。
  // MTG 要素 ○ バッチA）
  if (rarityOk) {
    const drawnTotal = card.effects.filter((e) => e.timing === 'drawn').reduce((sum, e) => sum + effectPoints(e, card).value, 0);
    const drawnCap = rarityCap(card.rarity, 0);
    if (drawnTotal > drawnCap) {
      out.push({
        code: 'DRAWN_OVER_CAP',
        path: 'effects',
        message: `「${TIMINGS.drawn.label}」の効果のポイントの合計は、コスト0のときの上限${drawnCap}ptまでです（いま${drawnTotal}pt）`,
      });
    }
  }

  // 捨てられたときの効果も、コスト0のときのレアリティ上限まで（捨てるだけで得をするカードを作らせない。MTG 要素 △ バッチA）
  if (rarityOk) {
    const total = card.effects.filter((e) => e.timing === 'discarded').reduce((sum, e) => sum + effectPoints(e, card).value, 0);
    const cap = rarityCap(card.rarity, 0);
    if (total > cap) {
      out.push({
        code: 'DISCARDED_OVER_CAP',
        path: 'effects',
        message: `「${TIMINGS.discarded.label}」の効果のポイントの合計は、コスト0のときの上限${cap}ptまでです（いま${total}pt）`,
      });
    }
  }

  // デメリット
  const seenDrawbacks = new Set<string>();
  const cardType = classifyCard(card);
  card.drawbacks.forEach((d, i) => {
    const def = getDrawback(d.id);
    const path = `drawbacks.${i}`;
    if (!def) {
      out.push({ code: 'DRAWBACK_UNKNOWN', path, message: `不明なデメリットです（${d.id}）` });
      return;
    }
    const what = `デメリット「${def.name}」`;
    if (seenDrawbacks.has(d.id)) out.push({ code: 'DRAWBACK_DUPLICATE', path, message: `同じデメリットは1枚に1回までです（${def.name}）` });
    seenDrawbacks.add(d.id);
    if (def.monsterOnly && base !== 'monster') {
      out.push({ code: 'DRAWBACK_MONSTER_ONLY', path, message: `${what}はモンスター専用です` });
    } else if (def.cardTypes && !def.cardTypes.includes(cardType)) {
      const ok = def.cardTypes.map((t) => CARD_TYPE_LABEL[t]).join('・');
      out.push({ code: 'DRAWBACK_CARD_TYPE', path, message: `${what}は${ok}のカードにしか付けられません（このカードは${CARD_TYPE_LABEL[cardType]}）` });
    }
    // 同時に付けられない組（1組につき1回だけ出す）
    for (const other of card.drawbacks.slice(i + 1)) {
      if (other.id === d.id) continue;
      const otherDef = getDrawback(other.id);
      if (def.conflicts?.includes(other.id) || otherDef?.conflicts?.includes(d.id)) {
        out.push({ code: 'DRAWBACK_CONFLICT', path, message: `${what}と「${otherDef?.name ?? other.id}」は同時に付けられません` });
      }
    }
    if (def.option && d.option !== undefined && !def.option.choices.some((c) => c.id === d.option)) {
      out.push({ code: 'DRAWBACK_OPTION', path: `${path}.option`, message: `${what}の${def.option.label}が正しくありません` });
    }
    checkParam(out, 'DRAWBACK_VALUE', `${path}.value`, what, drawbackValueSpec(def, d), d.value);
    if (def.fixed) {
      if (d.timing !== null) {
        out.push({ code: 'DRAWBACK_TIMING', path: `${path}.timing`, message: `${what}は発動タイミングを選べません` });
      }
    } else {
      const timing = d.timing ? TIMINGS[d.timing] : undefined;
      if (!timing) {
        out.push({ code: 'DRAWBACK_TIMING', path: `${path}.timing`, message: `${what}の発動タイミングを選んでください` });
      } else if (!timing.bases.includes(base)) {
        const who = base === 'monster' ? 'モンスター以外' : 'モンスター';
        out.push({ code: 'DRAWBACK_TIMING', path: `${path}.timing`, message: `「${timing.label}」は${who}専用のタイミングです` });
      } else if (def.timings && !def.timings.includes(d.timing!)) {
        const ok = def.timings.map((t) => `「${TIMINGS[t].label}」`).join('・');
        out.push({ code: 'DRAWBACK_TIMING', path: `${path}.timing`, message: `${what}は${ok}でしか使えません` });
      } else if (timing.noDrawbacks) {
        // 起動・魂力・捨て札から使ったとき（MTG 要素 ○ バッチC1）は使うかどうかを自分で決めるので、デメリットには使えない
        out.push({ code: 'DRAWBACK_TIMING', path: `${path}.timing`, message: `「${timing.label}」はデメリットには使えません` });
      }
    }
  });

  // カードの能力（MTG 要素 ○ バッチB）
  const abilities = card.abilities ?? [];
  const maxAbilities = C.maxAbilities;
  if (abilities.length > maxAbilities) {
    out.push({ code: 'TOO_MANY_ABILITIES', path: 'abilities', message: `カードの能力は1枚に${maxAbilities}つまでです（いま${abilities.length}つ）` });
  }
  const seenAbilities = new Set<string>();
  abilities.forEach((a, i) => {
    const def = getAbility(a.id);
    const path = `abilities.${i}`;
    if (!def) {
      out.push({ code: 'ABILITY_UNKNOWN', path, message: `不明なカードの能力です（${a.id}）` });
      return;
    }
    const what = `能力「${def.name}」`;
    if (seenAbilities.has(a.id)) out.push({ code: 'ABILITY_DUPLICATE', path, message: `同じ能力は1枚に1つまでです（${def.name}）` });
    seenAbilities.add(a.id);
    if (def.cardTypes && !def.cardTypes.includes(cardType)) {
      const ok = def.cardTypes.map((t) => CARD_TYPE_LABEL[t]).join('・');
      out.push({ code: 'ABILITY_CARD_TYPE', path, message: `${what}は${ok}のカードにしか付けられません（このカードは${CARD_TYPE_LABEL[cardType]}）` });
    }
    if (def.minRarity && rarityOk && rarityRank(card.rarity) < rarityRank(def.minRarity)) {
      out.push({ code: 'ABILITY_RARITY', path, message: `${what}は${RARITY_LABEL[def.minRarity]}以上のカードで使えます` });
    }
    checkParam(out, 'ABILITY_VALUE', `${path}.value`, what, def.value, a.value);
    if (def.option && a.option !== undefined && !def.option.choices.some((c) => c.id === a.option)) {
      out.push({ code: 'ABILITY_OPTION', path: `${path}.option`, message: `${what}の${def.option.label}が正しくありません` });
    }
    // 同時に付けられない能力・デメリット（1組につき1回だけ出す）
    for (const other of abilities.slice(i + 1)) {
      if (other.id === a.id) continue;
      const otherDef = getAbility(other.id);
      if (def.conflicts?.includes(other.id) || otherDef?.conflicts?.includes(a.id)) {
        out.push({ code: 'ABILITY_CONFLICT', path, message: `${what}と「${otherDef?.name ?? other.id}」は同時に付けられません` });
      }
    }
    for (const d of card.drawbacks) {
      if (def.conflicts?.includes(d.id)) {
        out.push({ code: 'ABILITY_CONFLICT', path, message: `${what}とデメリット「${getDrawback(d.id)?.name ?? d.id}」は同時に付けられません` });
      }
    }
    // 成長は使用時のダメージ効果が要る
    if (def.battle.grow && growHits(card.effects) === 0) {
      out.push({ code: 'GROW_WITHOUT_DAMAGE', path, message: `${what}は、使用時のダメージ・連撃の効果があるカードにしか付けられません` });
    }
    // ---- MTG 要素 ○ バッチC1
    // 起動・魂力は、そのタイミングの効果が要る
    if (def.requiresTiming && !card.effects.some((e) => e.timing === def.requiresTiming)) {
      out.push({
        code: ABILITY_TIMING_CODE[def.requiresTiming] ?? 'ABILITY_TIMING',
        path,
        message: `${what}は、「${TIMINGS[def.requiresTiming].label}」の効果があるカードにしか付けられません`,
      });
    }
    // 1回きり（プラン。MTG 要素 △ バッチA）は、そのチェックがある能力だけ
    if (a.once !== undefined && !def.onceOption) {
      out.push({ code: 'ABILITY_ONCE', path, message: `${what}には「1回きり」を付けられません` });
    }
    // 罠（MTG 要素 △ バッチA）：パワーの効果は罠のタイミングだけ（1つ以上）
    if (def.battle.trap) {
      const power = card.effects.filter((e) => isPowerTiming(e.timing, base));
      const bad = power.filter((e) => !TRAP_TIMINGS.includes(e.timing));
      if (power.length === 0 || bad.length > 0) {
        const ok = TRAP_TIMINGS.map((t) => `「${TIMINGS[t].label}」`).join('・');
        out.push({
          code: 'TRAP_TIMING',
          path,
          message: bad.length > 0 ? `${what}のパワーの効果は${ok}だけです（「${TIMINGS[bad[0]!.timing].label}」は使えません）` : `${what}は、${ok}の効果があるパワーのカードにしか付けられません`,
        });
      }
    }
    // 双呪（MTG 要素 ○ バッチC2）はモード選択のカードだけ
    if (def.battle.entwineCost && modeSets.size === 0) {
      out.push({ code: 'ENTWINE_WITHOUT_MODES', path, message: `${what}は、モード選択（次のうち1つを選ぶ）のカードにしか付けられません` });
    }
    // キッカーは「キッカーを払っていれば」の効果が要る
    if (def.battle.kickerCost && !card.effects.some((e) => e.condition === 'kicked')) {
      out.push({ code: 'KICKER_MISMATCH', path, message: `${what}は、条件「${CONDITIONS.kicked.label}」の効果があるカードにしか付けられません` });
    }
    // ---- MTG 要素 △ バッチB
    // 協約は「協約したなら」の効果が要る
    if (def.battle.sacrifice?.kind === 'bargain' && !card.effects.some((e) => e.condition === 'bargained')) {
      out.push({ code: 'BARGAIN_MISMATCH', path, message: `${what}は、条件「${CONDITIONS.bargained.label}」の効果があるカードにしか付けられません` });
    }
    // 放題・段階・最悪の二択はモード選択のカードだけ
    if (def.requiresModes && modeSets.size === 0) {
      out.push({ code: 'MODES_REQUIRED', path, message: `${what}は、モード選択（次のうち1つを選ぶ）のカードにしか付けられません` });
    }
    // 最悪の二択：モードはちょうど2つ、どちらのモードも相手に作用する効果
    if (def.battle.villain && modeSets.size > 0) {
      for (const [timing, set] of modeSets) {
        if (set.size !== 2) out.push({ code: 'VILLAIN_MODES', path, message: `${what}のモードはちょうど2つ（A・B）にしてください（「${TIMINGS[timing].label}」は${set.size}つ）` });
        for (const m of set) {
          const effs = card.effects.filter((e) => e.timing === timing && e.mode === m);
          if (!effs.some(actsOnOpponent)) {
            out.push({ code: 'VILLAIN_SELF', path, message: `${what}のモード${MODE_LABEL[m]}に、相手に作用する効果がありません（どちらも相手に不利な効果にします）` });
          }
        }
      }
    }
    // 現出・召集・探査は印刷コストが高いカードだけ
    if (def.minPrintedCost !== undefined && card.cost < def.minPrintedCost) {
      out.push({ code: 'MIN_COST', path, message: `${what}は、コスト${def.minPrintedCost}以上のカードにしか付けられません` });
    }
    // 切除は条件付きの効果（使用時・召喚時・捨て札から使ったとき）が要る
    if (def.battle.extraPay?.kind === 'cleave' && !card.effects.some((e) => e.condition !== null && MODE_TIMINGS.includes(e.timing))) {
      out.push({ code: 'CLEAVE_WITHOUT_CONDITION', path, message: `${what}は、条件付きの使用時（召喚時）の効果があるカードにしか付けられません` });
    }
    // 奮励は「選んだ1体（相手）」、超過は「選んだ1体」の使用時（召喚時）の効果が要る
    if (def.requiresChosen) {
      const timing = base === 'monster' ? 'summon' : 'play';
      const ok = card.effects.some((e) => {
        if (e.timing !== timing || e.target !== 'chosen') return false;
        const rule = getEffect(e.id)?.targetRule;
        return def.requiresChosen === 'any' || rule === 'enemyAny' || rule === 'enemyMonster' || rule === 'enemyMonsterOne';
      });
      if (!ok) {
        out.push({
          code: 'CHOSEN_REQUIRED',
          path,
          message: `${what}は、「選んだ1体${def.requiresChosen === 'enemy' ? '（相手）' : ''}」の${base === 'monster' ? '召喚時' : '使用時'}の効果があるカードにしか付けられません`,
        });
      }
    }
    // 試作の軽減・想起のコストは印刷コスト未満
    const altKind = def.battle.alt?.kind;
    if ((altKind === 'prototype' || altKind === 'evoke') && (a.value ?? 0) >= card.cost) {
      out.push({ code: 'ALT_COST', path: `${path}.value`, message: `${what}の${def.value?.label ?? '値'}は、印刷コスト（${card.cost}）より小さくしてください` });
    }
    // 血の支払いで払えるのは印刷コストまで
    if (def.battle.lifePay && (a.value ?? 0) > card.cost) {
      out.push({ code: 'LIFEPAY_COST', path: `${path}.value`, message: `${what}の数は、印刷コスト（${card.cost}）以下にしてください` });
    }
    // 親和は印刷コスト2以上のカードだけ（コスト1では軽減できない）
    if (a.id === 'affinity' && card.cost < BALANCE.abilities.affinity.minCost + 1) {
      out.push({ code: 'AFFINITY_LOW_COST', path, message: `${what}は、コスト${BALANCE.abilities.affinity.minCost + 1}以上のカードにしか付けられません` });
    }
    // 条件付き軽減は、コストの計算に使える条件が要る。それ以外の能力に条件は付けない
    if (def.takesCondition) {
      if (!a.condition || !costConditions().includes(a.condition)) {
        out.push({
          code: 'COST_CUT_CONDITION',
          path: `${path}.condition`,
          message: a.condition ? `条件「${CONDITIONS[a.condition]?.label ?? a.condition}」はコストの軽減には使えません` : `${what}の条件を選んでください`,
        });
      }
    } else if (a.condition !== undefined) {
      out.push({ code: 'ABILITY_CONDITION', path: `${path}.condition`, message: `${what}には条件を付けられません` });
    }
  });

  // 支払いの組み合わせ（MTG 要素 △ バッチB）：追加の支払い・代わりの使い方は1つ、差し出す能力は1つ、捨て札から使う能力は1つ、探査と脱出は同時に付けない
  const groupOf = (id: string) => getAbility(id)?.payGroup;
  const groupCheck = (group: 'extra' | 'sacrifice', code: string, label: string) => {
    const list = abilities.filter((a) => groupOf(a.id) === group);
    if (list.length > 1) {
      out.push({ code, path: 'abilities', message: `${label}（${list.map((a) => getAbility(a.id)!.name).join('・')}）は1枚に1つまでです` });
    }
  };
  groupCheck('extra', 'EXTRA_CONFLICT', '追加の支払い・代わりの使い方');
  groupCheck('sacrifice', 'SACRIFICE_CONFLICT', '差し出す能力');
  const fromDiscardList = abilities.filter((a) => getAbility(a.id)?.battle.fromDiscard);
  const coveredByConflicts = fromDiscardList.every((a, i) => fromDiscardList.slice(i + 1).every((b) => getAbility(a.id)?.conflicts?.includes(b.id) || getAbility(b.id)?.conflicts?.includes(a.id)));
  if (fromDiscardList.length > 1 && !coveredByConflicts) {
    out.push({ code: 'FROM_DISCARD_CONFLICT', path: 'abilities', message: `捨て札から使う能力（${fromDiscardList.map((a) => getAbility(a.id)!.name).join('・')}）は1枚に1つまでです` });
  }
  if (abilities.some((a) => a.id === 'delve') && abilities.some((a) => a.id === 'escape')) {
    out.push({ code: 'DELVE_ESCAPE', path: 'abilities', message: '探査と脱出は同時に付けられません（どちらも捨て札を除外するため）' });
  }

  // ポイント
  if (rarityOk && points.total > points.cap) {
    out.push({
      code: 'POINTS_OVER_CAP',
      path: 'points',
      message: `合計ポイントが上限を${points.total - points.cap}pt超えています（${points.total} / ${points.cap}）`,
    });
  }
  if (rarityOk && isCurseCard(card) && points.drawbackTotal < points.cap) {
    out.push({
      code: 'CURSE_TOO_WEAK',
      path: 'drawbacks',
      message: `呪いカードはデメリットの合計が${points.cap}pt以上必要です（いま${points.drawbackTotal}pt）`,
    });
  }

  return out;
}
