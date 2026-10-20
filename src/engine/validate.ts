/** カード作成ルールの検証。違反があれば理由を返す（空なら作成できる）。 */
import { BALANCE } from './balance.ts';
import { cardBase, classifyCard, isCurseCard, rarityRank } from './classify.ts';
import { drawbackValueSpec, type ParamSpec } from './define.ts';
import { CARD_TYPE_LABEL, RARITY_LABEL } from './labels.ts';
import { isIntInRange } from './math.ts';
import { effectPoints, modifierFits, rarityCap } from './points.ts';
import { CONDITIONS, TIMINGS, conditionsFor, targetLabel, targetsForEffect } from './options.ts';
import { getDrawback, getEffect, getKeyword, getModifier } from './registry.ts';
import { RARITIES, type CardDef, type PointSummary, type Violation } from './types.ts';

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
    checkParam(out, 'EFFECT_VALUE', `${path}.value`, what, def.value, e.value);
    checkParam(out, 'EFFECT_HITS', `${path}.hits`, what, def.hits, e.hits);
    if (def.option && e.option !== undefined && !def.option.choices.some((c) => c.id === e.option)) {
      out.push({ code: 'EFFECT_OPTION', path: `${path}.option`, message: `${what}の${def.option.label}が正しくありません` });
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
    if (!targetsForEffect(def, e.timing, base).includes(e.target)) {
      const label = BALANCE.target[e.target] !== undefined ? targetLabel(e.target, def.targetRule, e.timing) : e.target;
      out.push({ code: 'EFFECT_TARGET', path: `${path}.target`, message: `${what}（${timing.label}）の対象に「${label}」は選べません` });
    }
    if (e.condition !== null) {
      const cond = CONDITIONS[e.condition];
      if (!cond) {
        out.push({ code: 'EFFECT_CONDITION', path: `${path}.condition`, message: `${what}の条件が正しくありません` });
      } else if (!conditionsFor(e.timing, base).includes(e.condition)) {
        out.push({
          code: 'EFFECT_CONDITION',
          path: `${path}.condition`,
          message: `条件「${cond.label}」は「${timing.label}」では使えません`,
        });
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
      }
    }
  });

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
