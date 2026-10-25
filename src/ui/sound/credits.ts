/**
 * 効果音の出典（決定事項 #127）。どれも CC0 1.0 の素材から作った（表記は必須ではないが、クレジットの画面と docs/CREDITS.md に載せる）。
 * sfx/manifest.json の sources から作った表（tests/sound.test.ts が食い違いを確かめる）。
 */
export interface SfxCredit {
  pack: string;
  author: string;
  url: string;
  /** この素材を使った音（sfx/<ID>.mp3） */
  sounds: string[];
}

export const SFX_CREDITS: readonly SfxCredit[] = [
  { pack: '100 CC0 SFX', author: 'rubberduck', url: 'https://opengameart.org/content/100-cc0-sfx', sounds: ['field'] },
  { pack: '75 CC0 breaking / falling / hit sfx', author: 'rubberduck', url: 'https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx', sounds: ['hit.small', 'spell.earth'] },
  { pack: '80 CC0 creture SFX #2', author: 'rubberduck', url: 'https://opengameart.org/content/80-cc0-creture-sfx-2', sounds: ['summon'] },
  { pack: '80 CC0 RPG SFX', author: 'rubberduck', url: 'https://opengameart.org/content/80-cc0-rpg-sfx', sounds: ['ui.confirm', 'card.play', 'energy.gain', 'target.lock', 'destroy', 'summon', 'spell.arcane', 'status.apply', 'bind', 'token.create'] },
  { pack: 'Card Game sounds (Cockatrice)', author: 'HaelDB', url: 'https://opengameart.org/content/card-game-sounds', sounds: ['ui.error', 'card.draw', 'card.discard'] },
  { pack: 'Cave In', author: 'StarNinjas', url: 'https://opengameart.org/content/cave-in', sounds: ['destroy'] },
  { pack: 'Energy Drain', author: 'qubodup', url: 'https://opengameart.org/content/energy-drain', sounds: ['debuff'] },
  { pack: 'Fire Staff Sound Effects', author: 'LEGIT Audio', url: 'https://opengameart.org/content/fire-staff-sound-effects', sounds: ['spell.fire'] },
  { pack: 'Heartbeat sounds', author: 'bart', url: 'https://opengameart.org/content/heartbeat-sounds', sounds: ['spell.blood'] },
  { pack: 'Ice breaking/shattering', author: 'IgnasD', url: 'https://opengameart.org/content/ice-breakingshattering', sounds: ['ward.break'] },
  { pack: 'Ice spells', author: 'bart', url: 'https://opengameart.org/content/ice-spells', sounds: ['spell.ice'] },
  { pack: 'Jump Landing', author: 'Macro', url: 'https://opengameart.org/content/jump-landing', sounds: ['summon'] },
  { pack: 'Kenney – Casino Audio', author: 'Kenney (kenney.nl)', url: 'https://kenney.nl/assets/casino-audio', sounds: ['card.shuffle', 'card.hover', 'card.play', 'card.play.enemy', 'card.mill', 'draft.pick', 'mulligan'] },
  { pack: 'Kenney – Impact Sounds', author: 'Kenney (kenney.nl)', url: 'https://kenney.nl/assets/impact-sounds', sounds: ['card.play', 'turn.mine', 'turn.enemy', 'hit.heavy', 'hit.player', 'destroy', 'summon', 'spell.blood', 'spell.earth', 'victory', 'defeat'] },
  { pack: 'Kenney – RPG Audio', author: 'Kenney (kenney.nl)', url: 'https://kenney.nl/assets/rpg-audio', sounds: ['ui.click', 'ui.cancel', 'ui.tab', 'turn.end', 'target.lock'] },
  { pack: 'Kenney – Sci-fi Sounds', author: 'Kenney (kenney.nl)', url: 'https://kenney.nl/assets/sci-fi-sounds', sounds: ['card.play.enemy', 'turn.mine', 'turn.enemy', 'field', 'hit.heavy', 'spell.blood', 'buff', 'defeat'] },
  { pack: 'Kenney – UI Audio', author: 'Kenney (kenney.nl)', url: 'https://kenney.nl/assets/ui-audio', sounds: ['ui.confirm', 'ui.toggle'] },
  { pack: 'Medieval sound effects – Weapon impacts', author: 'MedicineStorm（Still North Media）', url: 'https://opengameart.org/content/medieval-sound-effects-weapon-impacts', sounds: ['hit.medium', 'retaliate', 'shield.block'] },
  { pack: 'Misc SFX Pack', author: 'Timopy', url: 'https://opengameart.org/content/misc-sfx-pack', sounds: ['spell.dark', 'spell.holy', 'keyword.grant'] },
  { pack: 'Mystery Sting', author: 'railkill', url: 'https://opengameart.org/content/mystery-sting', sounds: ['draw-game'] },
  { pack: 'RPG Sound Pack', author: 'artisticdude', url: 'https://opengameart.org/content/rpg-sound-pack', sounds: ['spell.poison', 'shield.gain', 'buff'] },
  { pack: 'Spell sounds', author: 'HaelDB', url: 'https://opengameart.org/content/spell-sounds', sounds: ['heal'] },
  { pack: 'Swishes Sound Pack', author: 'artisticdude', url: 'https://opengameart.org/content/swishes-sound-pack', sounds: ['card.fly', 'attack.swing'] },
  { pack: 'UI Sound Effects (Button Clicks, User Feedback, Notifications)', author: 'Robin Lamb', url: 'https://opengameart.org/content/ui-sound-effects-button-clicks-user-feedback-notifications', sounds: ['invite.notify', 'victory'] },
];
