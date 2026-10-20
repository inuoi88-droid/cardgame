// 自動生成ファイル。手で編集しないこと（scripts/gen-registry.mjs が生成する）
import type { AbilityDef, DrawbackDef, EffectDef, KeywordDef, ModifierDef } from './define.ts';
import effects_advanceSaga from './defs/effects/advanceSaga.ts';
import effects_amass from './defs/effects/amass.ts';
import effects_attackUp from './defs/effects/attackUp.ts';
import effects_backup from './defs/effects/backup.ts';
import effects_bank from './defs/effects/bank.ts';
import effects_bleed from './defs/effects/bleed.ts';
import effects_boon from './defs/effects/boon.ts';
import effects_borrow from './defs/effects/borrow.ts';
import effects_bounce from './defs/effects/bounce.ts';
import effects_bounty from './defs/effects/bounty.ts';
import effects_burn from './defs/effects/burn.ts';
import effects_cascade from './defs/effects/cascade.ts';
import effects_cleanse from './defs/effects/cleanse.ts';
import effects_cloneToken from './defs/effects/cloneToken.ts';
import effects_confuse from './defs/effects/confuse.ts';
import effects_conjure from './defs/effects/conjure.ts';
import effects_counter from './defs/effects/counter.ts';
import effects_crown from './defs/effects/crown.ts';
import effects_damage from './defs/effects/damage.ts';
import effects_defenseUp from './defs/effects/defenseUp.ts';
import effects_discount from './defs/effects/discount.ts';
import effects_discover from './defs/effects/discover.ts';
import effects_dispel from './defs/effects/dispel.ts';
import effects_doom from './defs/effects/doom.ts';
import effects_double from './defs/effects/double.ts';
import effects_draw from './defs/effects/draw.ts';
import effects_drawJam from './defs/effects/drawJam.ts';
import effects_duplicate from './defs/effects/duplicate.ts';
import effects_energy from './defs/effects/energy.ts';
import effects_energyJam from './defs/effects/energyJam.ts';
import effects_equip from './defs/effects/equip.ts';
import effects_execute from './defs/effects/execute.ts';
import effects_exileMill from './defs/effects/exileMill.ts';
import effects_explore from './defs/effects/explore.ts';
import effects_extraTurn from './defs/effects/extraTurn.ts';
import effects_fateseal from './defs/effects/fateseal.ts';
import effects_fight from './defs/effects/fight.ts';
import effects_finality from './defs/effects/finality.ts';
import effects_focus from './defs/effects/focus.ts';
import effects_freeze from './defs/effects/freeze.ts';
import effects_gainExp from './defs/effects/gainExp.ts';
import effects_grantKeyword from './defs/effects/grantKeyword.ts';
import effects_guard from './defs/effects/guard.ts';
import effects_harness from './defs/effects/harness.ts';
import effects_heal from './defs/effects/heal.ts';
import effects_heist from './defs/effects/heist.ts';
import effects_iceLock from './defs/effects/iceLock.ts';
import effects_incubate from './defs/effects/incubate.ts';
import effects_infight from './defs/effects/infight.ts';
import effects_loot from './defs/effects/loot.ts';
import effects_manifest from './defs/effects/manifest.ts';
import effects_mill from './defs/effects/mill.ts';
import effects_multiHit from './defs/effects/multiHit.ts';
import effects_noise from './defs/effects/noise.ts';
import effects_nullify from './defs/effects/nullify.ts';
import effects_offspring from './defs/effects/offspring.ts';
import effects_perpetual from './defs/effects/perpetual.ts';
import effects_poison from './defs/effects/poison.ts';
import effects_populate from './defs/effects/populate.ts';
import effects_prepare from './defs/effects/prepare.ts';
import effects_proliferate from './defs/effects/proliferate.ts';
import effects_pump from './defs/effects/pump.ts';
import effects_purge from './defs/effects/purge.ts';
import effects_quash from './defs/effects/quash.ts';
import effects_rad from './defs/effects/rad.ts';
import effects_ramp from './defs/effects/ramp.ts';
import effects_ready from './defs/effects/ready.ts';
import effects_recall from './defs/effects/recall.ts';
import effects_recruit from './defs/effects/recruit.ts';
import effects_regen from './defs/effects/regen.ts';
import effects_repair from './defs/effects/repair.ts';
import effects_retain from './defs/effects/retain.ts';
import effects_revive from './defs/effects/revive.ts';
import effects_savings from './defs/effects/savings.ts';
import effects_scry from './defs/effects/scry.ts';
import effects_seal from './defs/effects/seal.ts';
import effects_search from './defs/effects/search.ts';
import effects_seek from './defs/effects/seek.ts';
import effects_shield from './defs/effects/shield.ts';
import effects_siege from './defs/effects/siege.ts';
import effects_slay from './defs/effects/slay.ts';
import effects_startEngine from './defs/effects/startEngine.ts';
import effects_steal from './defs/effects/steal.ts';
import effects_strength from './defs/effects/strength.ts';
import effects_suspect from './defs/effects/suspect.ts';
import effects_swapHp from './defs/effects/swapHp.ts';
import effects_token from './defs/effects/token.ts';
import effects_train from './defs/effects/train.ts';
import effects_vulnerable from './defs/effects/vulnerable.ts';
import effects_weak from './defs/effects/weak.ts';
import effects_weaken from './defs/effects/weaken.ts';
import effects_wipe from './defs/effects/wipe.ts';
import effects_wither from './defs/effects/wither.ts';
import modifiers_drain from './defs/modifiers/drain.ts';
import modifiers_gamble from './defs/modifiers/gamble.ts';
import modifiers_nextTurn from './defs/modifiers/nextTurn.ts';
import modifiers_perCardPlayed from './defs/modifiers/perCardPlayed.ts';
import modifiers_perDiscardMonster from './defs/modifiers/perDiscardMonster.ts';
import modifiers_perEnemyMonster from './defs/modifiers/perEnemyMonster.ts';
import modifiers_perExp from './defs/modifiers/perExp.ts';
import modifiers_perTribeAlly from './defs/modifiers/perTribeAlly.ts';
import modifiers_pierce from './defs/modifiers/pierce.ts';
import modifiers_witherDmg from './defs/modifiers/witherDmg.ts';
import modifiers_xEnergy from './defs/modifiers/xEnergy.ts';
import keywords_bushido from './defs/keywords/bushido.ts';
import keywords_deathtouch from './defs/keywords/deathtouch.ts';
import keywords_divineShield from './defs/keywords/divineShield.ts';
import keywords_doubleAttack from './defs/keywords/doubleAttack.ts';
import keywords_doubleTeam from './defs/keywords/doubleTeam.ts';
import keywords_enlist from './defs/keywords/enlist.ts';
import keywords_firstStrike from './defs/keywords/firstStrike.ts';
import keywords_flying from './defs/keywords/flying.ts';
import keywords_haste from './defs/keywords/haste.ts';
import keywords_hexproof from './defs/keywords/hexproof.ts';
import keywords_hitAndRun from './defs/keywords/hitAndRun.ts';
import keywords_inspire from './defs/keywords/inspire.ts';
import keywords_lifelink from './defs/keywords/lifelink.ts';
import keywords_menace from './defs/keywords/menace.ts';
import keywords_onslaught from './defs/keywords/onslaught.ts';
import keywords_reach from './defs/keywords/reach.ts';
import keywords_selfRepair from './defs/keywords/selfRepair.ts';
import keywords_skulk from './defs/keywords/skulk.ts';
import keywords_stealth from './defs/keywords/stealth.ts';
import keywords_taunt from './defs/keywords/taunt.ts';
import keywords_trample from './defs/keywords/trample.ts';
import keywords_undying from './defs/keywords/undying.ts';
import keywords_ward from './defs/keywords/ward.ts';
import drawbacks_betrayal from './defs/drawbacks/betrayal.ts';
import drawbacks_blight from './defs/drawbacks/blight.ts';
import drawbacks_cumulativeUpkeep from './defs/drawbacks/cumulativeUpkeep.ts';
import drawbacks_decay from './defs/drawbacks/decay.ts';
import drawbacks_defender from './defs/drawbacks/defender.ts';
import drawbacks_discardRandom from './defs/drawbacks/discardRandom.ts';
import drawbacks_dormant from './defs/drawbacks/dormant.ts';
import drawbacks_exert from './defs/drawbacks/exert.ts';
import drawbacks_exhaust from './defs/drawbacks/exhaust.ts';
import drawbacks_exileDiscard from './defs/drawbacks/exileDiscard.ts';
import drawbacks_gift from './defs/drawbacks/gift.ts';
import drawbacks_legendary from './defs/drawbacks/legendary.ts';
import drawbacks_lifespan from './defs/drawbacks/lifespan.ts';
import drawbacks_parasite from './defs/drawbacks/parasite.ts';
import drawbacks_pollute from './defs/drawbacks/pollute.ts';
import drawbacks_recoil from './defs/drawbacks/recoil.ts';
import drawbacks_sacrifice from './defs/drawbacks/sacrifice.ts';
import drawbacks_selfBurn from './defs/drawbacks/selfBurn.ts';
import drawbacks_selfDamage from './defs/drawbacks/selfDamage.ts';
import drawbacks_selfPoison from './defs/drawbacks/selfPoison.ts';
import drawbacks_upkeep from './defs/drawbacks/upkeep.ts';
import abilities_activate from './defs/abilities/activate.ts';
import abilities_adventure from './defs/abilities/adventure.ts';
import abilities_affinity from './defs/abilities/affinity.ts';
import abilities_altWin from './defs/abilities/altWin.ts';
import abilities_bargain from './defs/abilities/bargain.ts';
import abilities_buyback from './defs/abilities/buyback.ts';
import abilities_casualty from './defs/abilities/casualty.ts';
import abilities_channel from './defs/abilities/channel.ts';
import abilities_charge from './defs/abilities/charge.ts';
import abilities_cleave from './defs/abilities/cleave.ts';
import abilities_convoke from './defs/abilities/convoke.ts';
import abilities_costCut from './defs/abilities/costCut.ts';
import abilities_cycling from './defs/abilities/cycling.ts';
import abilities_delve from './defs/abilities/delve.ts';
import abilities_devour from './defs/abilities/devour.ts';
import abilities_disguise from './defs/abilities/disguise.ts';
import abilities_dredge from './defs/abilities/dredge.ts';
import abilities_embalm from './defs/abilities/embalm.ts';
import abilities_emblem from './defs/abilities/emblem.ts';
import abilities_emerge from './defs/abilities/emerge.ts';
import abilities_entwine from './defs/abilities/entwine.ts';
import abilities_escape from './defs/abilities/escape.ts';
import abilities_evoke from './defs/abilities/evoke.ts';
import abilities_evolve from './defs/abilities/evolve.ts';
import abilities_flashback from './defs/abilities/flashback.ts';
import abilities_forecast from './defs/abilities/forecast.ts';
import abilities_foretell from './defs/abilities/foretell.ts';
import abilities_grow from './defs/abilities/grow.ts';
import abilities_harmonize from './defs/abilities/harmonize.ts';
import abilities_jumpStart from './defs/abilities/jumpStart.ts';
import abilities_kicker from './defs/abilities/kicker.ts';
import abilities_levelUp from './defs/abilities/levelUp.ts';
import abilities_lifePay from './defs/abilities/lifePay.ts';
import abilities_loyalty from './defs/abilities/loyalty.ts';
import abilities_mayhem from './defs/abilities/mayhem.ts';
import abilities_overload from './defs/abilities/overload.ts';
import abilities_pitch from './defs/abilities/pitch.ts';
import abilities_plot from './defs/abilities/plot.ts';
import abilities_prototype from './defs/abilities/prototype.ts';
import abilities_quest from './defs/abilities/quest.ts';
import abilities_rebound from './defs/abilities/rebound.ts';
import abilities_renew from './defs/abilities/renew.ts';
import abilities_retrace from './defs/abilities/retrace.ts';
import abilities_shuffleBack from './defs/abilities/shuffleBack.ts';
import abilities_spree from './defs/abilities/spree.ts';
import abilities_squad from './defs/abilities/squad.ts';
import abilities_strive from './defs/abilities/strive.ts';
import abilities_suspend from './defs/abilities/suspend.ts';
import abilities_tiered from './defs/abilities/tiered.ts';
import abilities_trap from './defs/abilities/trap.ts';
import abilities_unearth from './defs/abilities/unearth.ts';
import abilities_unleash from './defs/abilities/unleash.ts';
import abilities_villain from './defs/abilities/villain.ts';
import abilities_warp from './defs/abilities/warp.ts';

export const EFFECT_DEFS: readonly EffectDef[] = [
  effects_advanceSaga,
  effects_amass,
  effects_attackUp,
  effects_backup,
  effects_bank,
  effects_bleed,
  effects_boon,
  effects_borrow,
  effects_bounce,
  effects_bounty,
  effects_burn,
  effects_cascade,
  effects_cleanse,
  effects_cloneToken,
  effects_confuse,
  effects_conjure,
  effects_counter,
  effects_crown,
  effects_damage,
  effects_defenseUp,
  effects_discount,
  effects_discover,
  effects_dispel,
  effects_doom,
  effects_double,
  effects_draw,
  effects_drawJam,
  effects_duplicate,
  effects_energy,
  effects_energyJam,
  effects_equip,
  effects_execute,
  effects_exileMill,
  effects_explore,
  effects_extraTurn,
  effects_fateseal,
  effects_fight,
  effects_finality,
  effects_focus,
  effects_freeze,
  effects_gainExp,
  effects_grantKeyword,
  effects_guard,
  effects_harness,
  effects_heal,
  effects_heist,
  effects_iceLock,
  effects_incubate,
  effects_infight,
  effects_loot,
  effects_manifest,
  effects_mill,
  effects_multiHit,
  effects_noise,
  effects_nullify,
  effects_offspring,
  effects_perpetual,
  effects_poison,
  effects_populate,
  effects_prepare,
  effects_proliferate,
  effects_pump,
  effects_purge,
  effects_quash,
  effects_rad,
  effects_ramp,
  effects_ready,
  effects_recall,
  effects_recruit,
  effects_regen,
  effects_repair,
  effects_retain,
  effects_revive,
  effects_savings,
  effects_scry,
  effects_seal,
  effects_search,
  effects_seek,
  effects_shield,
  effects_siege,
  effects_slay,
  effects_startEngine,
  effects_steal,
  effects_strength,
  effects_suspect,
  effects_swapHp,
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
  modifiers_gamble,
  modifiers_nextTurn,
  modifiers_perCardPlayed,
  modifiers_perDiscardMonster,
  modifiers_perEnemyMonster,
  modifiers_perExp,
  modifiers_perTribeAlly,
  modifiers_pierce,
  modifiers_witherDmg,
  modifiers_xEnergy,
];
export const KEYWORD_DEFS: readonly KeywordDef[] = [
  keywords_bushido,
  keywords_deathtouch,
  keywords_divineShield,
  keywords_doubleAttack,
  keywords_doubleTeam,
  keywords_enlist,
  keywords_firstStrike,
  keywords_flying,
  keywords_haste,
  keywords_hexproof,
  keywords_hitAndRun,
  keywords_inspire,
  keywords_lifelink,
  keywords_menace,
  keywords_onslaught,
  keywords_reach,
  keywords_selfRepair,
  keywords_skulk,
  keywords_stealth,
  keywords_taunt,
  keywords_trample,
  keywords_undying,
  keywords_ward,
];
export const DRAWBACK_DEFS: readonly DrawbackDef[] = [
  drawbacks_betrayal,
  drawbacks_blight,
  drawbacks_cumulativeUpkeep,
  drawbacks_decay,
  drawbacks_defender,
  drawbacks_discardRandom,
  drawbacks_dormant,
  drawbacks_exert,
  drawbacks_exhaust,
  drawbacks_exileDiscard,
  drawbacks_gift,
  drawbacks_legendary,
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
export const ABILITY_DEFS: readonly AbilityDef[] = [
  abilities_activate,
  abilities_adventure,
  abilities_affinity,
  abilities_altWin,
  abilities_bargain,
  abilities_buyback,
  abilities_casualty,
  abilities_channel,
  abilities_charge,
  abilities_cleave,
  abilities_convoke,
  abilities_costCut,
  abilities_cycling,
  abilities_delve,
  abilities_devour,
  abilities_disguise,
  abilities_dredge,
  abilities_embalm,
  abilities_emblem,
  abilities_emerge,
  abilities_entwine,
  abilities_escape,
  abilities_evoke,
  abilities_evolve,
  abilities_flashback,
  abilities_forecast,
  abilities_foretell,
  abilities_grow,
  abilities_harmonize,
  abilities_jumpStart,
  abilities_kicker,
  abilities_levelUp,
  abilities_lifePay,
  abilities_loyalty,
  abilities_mayhem,
  abilities_overload,
  abilities_pitch,
  abilities_plot,
  abilities_prototype,
  abilities_quest,
  abilities_rebound,
  abilities_renew,
  abilities_retrace,
  abilities_shuffleBack,
  abilities_spree,
  abilities_squad,
  abilities_strive,
  abilities_suspend,
  abilities_tiered,
  abilities_trap,
  abilities_unearth,
  abilities_unleash,
  abilities_villain,
  abilities_warp,
];
