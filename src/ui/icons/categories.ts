/**
 * アイコン選択パネルの分類（決定事項 #105）。アイコン名の英単語（"dragon-head" → dragon, head）から決める。純粋関数。
 * 判定は CATEGORY_RULES の上から順に、どれかの単語が当てはまった最初の分類（どれにも当たらなければ「その他」）。
 * 並び（チップの順）は CATEGORY_ORDER。
 */

export type IconCategory = 'creature' | 'undead' | 'monster' | 'weapon' | 'armor' | 'magic' | 'nature' | 'element' | 'tool' | 'treasure' | 'symbol' | 'other';

export const CATEGORY_LABEL: Record<IconCategory, string> = {
  creature: '生き物',
  undead: 'アンデッド',
  monster: '竜と怪物',
  weapon: '武器',
  armor: '防具',
  magic: '魔法',
  nature: '自然',
  element: '元素',
  tool: '道具',
  treasure: '宝',
  symbol: '記号',
  other: 'その他',
};

/** チップの並び */
export const CATEGORY_ORDER: readonly IconCategory[] = ['creature', 'undead', 'monster', 'weapon', 'armor', 'magic', 'nature', 'element', 'tool', 'treasure', 'symbol', 'other'];

const words = (s: string): string[] => s.split(/\s+/).filter(Boolean);

/** 判定の順（上ほど優先）。例：dragon-shield は竜と怪物、fire-shield は防具、wolf-trap は生き物 */
export const CATEGORY_RULES: readonly { category: IconCategory; tokens: readonly string[] }[] = [
  {
    category: 'undead',
    tokens: words(
      'skull skulls skeleton zombie ghost ghosts vampire vampiric dracula mummy lich bone bones grave graveyard tomb tombstone coffin reaper death dead undead crypt haunted spectre specter wraith soul souls banshee corpse ghoul carrion necromancy ossuary sarcophagus',
    ),
  },
  {
    category: 'monster',
    tokens: words(
      'dragon dragons drake wyvern hydra kraken monster monsters demon daemon devil troll ogre orc goblin imp gargoyle griffin gryphon minotaur cyclops centaur medusa harpy basilisk chimera cerberus behemoth leviathan tentacle tentacles alien aliens beholder golem giant kobold gremlin unicorn pegasus phoenix werewolf yeti sasquatch slime mimic manticore wendigo cthulhu eldritch fiend fairy elf elven dwarf mermaid sphinx abomination ent dryad satyr djinn genie oni kitsune lamia siren',
    ),
  },
  {
    category: 'creature',
    tokens: words(
      'wolf wolves bear lion tiger cat cats dog dogs hound fox rat mouse bat bats bird birds eagle hawk falcon owl raven crow parrot chicken rooster duck swan dove pigeon penguin fish shark whale dolphin octopus squid crab lobster shrimp snake snakes serpent cobra viper lizard frog toad turtle tortoise crocodile croc alligator spider spiders scorpion ant ants bee bees wasp beetle butterfly moth fly worm snail slug horse pony deer stag elk moose boar pig cow bull ox goat sheep ram rabbit hare monkey ape gorilla elephant rhinoceros hippo giraffe camel kangaroo panda koala squirrel hedgehog mole beaver otter seal walrus bison buffalo mammoth dinosaur raptor triceratops beast animal paw paws claw claws fang fangs feather feathers beak tusk tusks mane hoof jellyfish starfish seahorse mantis caterpillar ladybug cricket grasshopper dragonfly bug insect person people man men woman women child baby family warrior knight soldier soldiers archer ninja samurai pirate viking king queen prince princess monk priest nun hunter swordman swordwoman barbarian gladiator thief assassin spy cowboy farmer miner sailor jester guard guards egg eggs horn horns hive head heads hand hands eye eyes face faces body wing wings brain arm arms finger fingers mouth foot feet leg legs knee fist lips tail organ female male human humans player players meeple team doctor robber figure profile kick punch walking hobbit armadillo goose reptile fur heel skin hair beard teeth tooth tongue nose ear muscle biceps',
    ),
  },
  {
    category: 'weapon',
    tokens: words(
      'sword swords blade blades dagger daggers knife knives axe axes mace warhammer spear spears lance halberd trident bow crossbow arrow arrows gun guns pistol rifle revolver cannon bomb bombs grenade missile sling slingshot whip flail scythe sickle katana saber sabre rapier scimitar club shuriken kunai javelin harpoon glaive dart darts bullet bullets ammo musket shotgun sniper bazooka machete cleaver nunchaku tomahawk boomerang catapult trebuchet ballista broadsword claymore estoc stiletto switchblade wound wounds spiked spikes barbed shot turret laser bayonet dynamite explosive bombing bomber assault war battle strike striking slashes slash bolas arrowhead mine mines stab',
    ),
  },
  {
    category: 'armor',
    tokens: words(
      'shield shields helmet helm helms armor armour breastplate gauntlet gauntlets cuirass visor pauldrons greaves chainmail mail vest buckler boot boots hat hats cap shirt dress glove gloves shoes shoe belt jacket suit hood cloak cape mask masks slippers barbute collar glasses goggles robe tunic coat',
    ),
  },
  {
    category: 'magic',
    tokens: words(
      'magic magick magical spell spells wand staff rune runes potion potions aura portal orb orbs pentagram sigil enchant enchanted mystic mystical arcane ritual summon summoning curse cursed hex wizard witch warlock sorcery sorcerer mage alchemy elixir cauldron grimoire tarot totem charm amulet talisman divination oracle psychic telepathy hypnotic teleport beams sparkles sparkling glowing crystal crystals third mana spellbook evil life time power mighty ancient invisible idea duality horus mind psychic dream curse blessing holy unholy',
    ),
  },
  {
    category: 'element',
    tokens: words(
      'fire flame flames burning burn ice icy frost frozen snow snowflake cold lightning bolt thunder storm electric water waves wave drop droplet rain wind whirlwind tornado cloud clouds earth rock rocks stone lava magma volcano explosion smoke steam poison acid toxic radioactive fireball frostfire heat blizzard hurricane quake tsunami light beam beams energy blast impact spark sparks sonic electrical tesla shadow eclipse night solar air rays gas oil coal atom molecule comet meteor boulder fossil flash',
    ),
  },
  {
    category: 'nature',
    tokens: words(
      'tree trees leaf leaves flower flowers plant plants vine vines root roots forest grass mushroom mushrooms sun moon mountain mountains river lake sea ocean island desert cave sunrise sunset rainbow seed seeds sprout fruit apple berry berries rose oak pine palm cactus planet world globe field meadow bush herb wheat corn lotus clover bamboo coral shell',
    ),
  },
  {
    category: 'treasure',
    tokens: words(
      'gem gems jewel jewels jewelry diamond ruby emerald sapphire crown crowns coin coins gold golden money treasure chest ring rings necklace pendant earrings trophy medal chalice grail goblet pearl wealth cash',
    ),
  },
  {
    category: 'tool',
    tokens: words(
      'hammer wrench key keys lamp lantern torch rope bag backpack toolbox saw pickaxe shovel anvil gear gears cog cogs compass map telescope hourglass clock candle candles bucket bottle flask jar box crate book books scroll quill pen pencil scissors needle magnifying glass lock padlock chain chains ladder bell trumpet drum guitar harp flute dice cup mug pot pan fork spoon wheel cart ship boat car truck robot machine computer phone camera tv radio battery bulb plug cable tent broom hook net trap barrel pipe bottle vial syringe ball balls can paper tube chair table basket pin tape film mirror soap stapler megaphone speaker magnet screw nails wire mallet shears thermometer keyboard calendar folder tablet archive controller console cpu projector bandage medical capsule bike airplane plane rocket satellite tank bus wagon sailboat canoe subway helicopter jet scooter ambulance glider crane tire roller train tractor bicycle umbrella spray',
    ),
  },
  {
    category: 'symbol',
    tokens: words(
      'circle circles triangle square star stars cross plus minus check checkbox cancel stop info question exclamation sign emblem banner flag logo letter number card cards ace clubs spades hearts diamonds yin yang infinity spiral swirl triskelion pentacle ankh arrows rotation icon target abstract heart hearts love level logic button disc half double triple zigzag one two three four five rank signal chart test extra high up down back backward forward symbol trefoil hieroglyph knot ribbon cube pyramid dot dots line lines shape',
    ),
  },
];

const TOKEN_CATEGORY: ReadonlyMap<string, IconCategory> = (() => {
  const m = new Map<string, IconCategory>();
  // 上の規則ほど優先なので、まだ無い単語だけ入れる
  for (const r of CATEGORY_RULES) for (const t of r.tokens) if (!m.has(t)) m.set(t, r.category);
  return m;
})();

/** 単語の分類（複数形の s を落としても見る） */
function tokenCategory(t: string): IconCategory | undefined {
  return TOKEN_CATEGORY.get(t) ?? (t.length > 3 && t.endsWith('s') ? TOKEN_CATEGORY.get(t.slice(0, -1)) : undefined);
}

const RANK: ReadonlyMap<IconCategory, number> = new Map(CATEGORY_RULES.map((r, i) => [r.category, i]));

/** アイコン名の分類 */
export function categoryOf(name: string): IconCategory {
  let best: IconCategory = 'other';
  let rank = Infinity;
  for (const t of name.split('-')) {
    const c = tokenCategory(t);
    const r = c ? (RANK.get(c) ?? Infinity) : Infinity;
    if (c && r < rank) {
      best = c;
      rank = r;
    }
  }
  return best;
}
