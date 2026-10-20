// 自動生成ファイル。手で編集しないこと（scripts/gen-registry.mjs が生成する）
import type { DrawbackDef, EffectDef, KeywordDef, ModifierDef } from './define.ts';
import effects_attackUp from './defs/effects/attackUp.ts';
import effects_bleed from './defs/effects/bleed.ts';
import effects_bounce from './defs/effects/bounce.ts';
import effects_burn from './defs/effects/burn.ts';
import effects_cleanse from './defs/effects/cleanse.ts';
import effects_confuse from './defs/effects/confuse.ts';
import effects_counter from './defs/effects/counter.ts';
import effects_damage from './defs/effects/damage.ts';
import effects_defenseUp from './defs/effects/defenseUp.ts';
import effects_discount from './defs/effects/discount.ts';
import effects_dispel from './defs/effects/dispel.ts';
import effects_doom from './defs/effects/doom.ts';
import effects_double from './defs/effects/double.ts';
import effects_draw from './defs/effects/draw.ts';
import effects_drawJam from './defs/effects/drawJam.ts';
import effects_duplicate from './defs/effects/duplicate.ts';
import effects_energy from './defs/effects/energy.ts';
import effects_energyJam from './defs/effects/energyJam.ts';
import effects_execute from './defs/effects/execute.ts';
import effects_fight from './defs/effects/fight.ts';
import effects_focus from './defs/effects/focus.ts';
import effects_freeze from './defs/effects/freeze.ts';
import effects_grantKeyword from './defs/effects/grantKeyword.ts';
import effects_heal from './defs/effects/heal.ts';
import effects_loot from './defs/effects/loot.ts';
import effects_multiHit from './defs/effects/multiHit.ts';
import effects_noise from './defs/effects/noise.ts';
import effects_nullify from './defs/effects/nullify.ts';
import effects_poison from './defs/effects/poison.ts';
import effects_pump from './defs/effects/pump.ts';
import effects_purge from './defs/effects/purge.ts';
import effects_ready from './defs/effects/ready.ts';
import effects_recall from './defs/effects/recall.ts';
import effects_regen from './defs/effects/regen.ts';
import effects_repair from './defs/effects/repair.ts';
import effects_retain from './defs/effects/retain.ts';
import effects_revive from './defs/effects/revive.ts';
import effects_savings from './defs/effects/savings.ts';
import effects_scry from './defs/effects/scry.ts';
import effects_seal from './defs/effects/seal.ts';
import effects_search from './defs/effects/search.ts';
import effects_shield from './defs/effects/shield.ts';
import effects_steal from './defs/effects/steal.ts';
import effects_strength from './defs/effects/strength.ts';
import effects_token from './defs/effects/token.ts';
import effects_train from './defs/effects/train.ts';
import effects_vulnerable from './defs/effects/vulnerable.ts';
import effects_weak from './defs/effects/weak.ts';
import effects_weaken from './defs/effects/weaken.ts';
import effects_wipe from './defs/effects/wipe.ts';
import effects_wither from './defs/effects/wither.ts';
import modifiers_drain from './defs/modifiers/drain.ts';
import modifiers_perCardPlayed from './defs/modifiers/perCardPlayed.ts';
import modifiers_perEnemyMonster from './defs/modifiers/perEnemyMonster.ts';
import modifiers_pierce from './defs/modifiers/pierce.ts';
import modifiers_xEnergy from './defs/modifiers/xEnergy.ts';
import keywords_bushido from './defs/keywords/bushido.ts';
import keywords_deathtouch from './defs/keywords/deathtouch.ts';
import keywords_divineShield from './defs/keywords/divineShield.ts';
import keywords_doubleAttack from './defs/keywords/doubleAttack.ts';
import keywords_firstStrike from './defs/keywords/firstStrike.ts';
import keywords_flying from './defs/keywords/flying.ts';
import keywords_haste from './defs/keywords/haste.ts';
import keywords_hexproof from './defs/keywords/hexproof.ts';
import keywords_lifelink from './defs/keywords/lifelink.ts';
import keywords_selfRepair from './defs/keywords/selfRepair.ts';
import keywords_stealth from './defs/keywords/stealth.ts';
import keywords_taunt from './defs/keywords/taunt.ts';
import keywords_trample from './defs/keywords/trample.ts';
import keywords_undying from './defs/keywords/undying.ts';
import drawbacks_betrayal from './defs/drawbacks/betrayal.ts';
import drawbacks_decay from './defs/drawbacks/decay.ts';
import drawbacks_defender from './defs/drawbacks/defender.ts';
import drawbacks_discardRandom from './defs/drawbacks/discardRandom.ts';
import drawbacks_exhaust from './defs/drawbacks/exhaust.ts';
import drawbacks_gift from './defs/drawbacks/gift.ts';
import drawbacks_lifespan from './defs/drawbacks/lifespan.ts';
import drawbacks_parasite from './defs/drawbacks/parasite.ts';
import drawbacks_pollute from './defs/drawbacks/pollute.ts';
import drawbacks_recoil from './defs/drawbacks/recoil.ts';
import drawbacks_sacrifice from './defs/drawbacks/sacrifice.ts';
import drawbacks_selfBurn from './defs/drawbacks/selfBurn.ts';
import drawbacks_selfDamage from './defs/drawbacks/selfDamage.ts';
import drawbacks_selfPoison from './defs/drawbacks/selfPoison.ts';
import drawbacks_upkeep from './defs/drawbacks/upkeep.ts';

export const EFFECT_DEFS: readonly EffectDef[] = [
  effects_attackUp,
  effects_bleed,
  effects_bounce,
  effects_burn,
  effects_cleanse,
  effects_confuse,
  effects_counter,
  effects_damage,
  effects_defenseUp,
  effects_discount,
  effects_dispel,
  effects_doom,
  effects_double,
  effects_draw,
  effects_drawJam,
  effects_duplicate,
  effects_energy,
  effects_energyJam,
  effects_execute,
  effects_fight,
  effects_focus,
  effects_freeze,
  effects_grantKeyword,
  effects_heal,
  effects_loot,
  effects_multiHit,
  effects_noise,
  effects_nullify,
  effects_poison,
  effects_pump,
  effects_purge,
  effects_ready,
  effects_recall,
  effects_regen,
  effects_repair,
  effects_retain,
  effects_revive,
  effects_savings,
  effects_scry,
  effects_seal,
  effects_search,
  effects_shield,
  effects_steal,
  effects_strength,
  effects_token,
  effects_train,
  effects_vulnerable,
  effects_weak,
  effects_weaken,
  effects_wipe,
  effects_wither,
];
export const MODIFIER_DEFS: readonly ModifierDef[] = [
  modifiers_drain,
  modifiers_perCardPlayed,
  modifiers_perEnemyMonster,
  modifiers_pierce,
  modifiers_xEnergy,
];
export const KEYWORD_DEFS: readonly KeywordDef[] = [
  keywords_bushido,
  keywords_deathtouch,
  keywords_divineShield,
  keywords_doubleAttack,
  keywords_firstStrike,
  keywords_flying,
  keywords_haste,
  keywords_hexproof,
  keywords_lifelink,
  keywords_selfRepair,
  keywords_stealth,
  keywords_taunt,
  keywords_trample,
  keywords_undying,
];
export const DRAWBACK_DEFS: readonly DrawbackDef[] = [
  drawbacks_betrayal,
  drawbacks_decay,
  drawbacks_defender,
  drawbacks_discardRandom,
  drawbacks_exhaust,
  drawbacks_gift,
  drawbacks_lifespan,
  drawbacks_parasite,
  drawbacks_pollute,
  drawbacks_recoil,
  drawbacks_sacrifice,
  drawbacks_selfBurn,
  drawbacks_selfDamage,
  drawbacks_selfPoison,
  drawbacks_upkeep,
];
