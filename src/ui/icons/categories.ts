/**
 * アイコン選択パネルの分類（決定事項 #105）。アイコン名の英単語（"dragon-head" → dragon, head）から決める。純粋関数。
 * 判定は CATEGORY_RULES の上から順に、どれかの単語が当てはまった最初の分類（どれにも当たらなければ「その他」）。
 * 並び（チップの順）は CATEGORY_ORDER。
 */

export type IconCategory = 'creature' | 'undead' | 'monster' | 'weapon' | 'armor' | 'magic' | 'nature' | 'element' | 'place' | 'food' | 'tool' | 'treasure' | 'symbol' | 'other';

export const CATEGORY_LABEL: Record<IconCategory, string> = {
  creature: '生き物',
  undead: 'アンデッド',
  monster: '竜と怪物',
  weapon: '武器',
  armor: '防具',
  magic: '魔法',
  nature: '自然',
  element: '元素',
  place: '建物と場所',
  food: '食べ物',
  tool: '道具',
  treasure: '宝',
  symbol: '記号',
  other: 'その他',
};

/** チップの並び */
export const CATEGORY_ORDER: readonly IconCategory[] = ['creature', 'undead', 'monster', 'weapon', 'armor', 'magic', 'nature', 'element', 'place', 'food', 'tool', 'treasure', 'symbol', 'other'];

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
      'lizardman fomorian frankenstein ophanim troglodyte octoman metroid klingon thwomp staryu ifrit anubis bastet icarus dragon dragons drake wyvern hydra kraken monster monsters demon daemon devil troll ogre orc goblin imp gargoyle griffin gryphon minotaur cyclops centaur medusa harpy basilisk chimera cerberus behemoth leviathan tentacle tentacles alien aliens beholder golem giant kobold gremlin unicorn pegasus phoenix werewolf yeti sasquatch slime mimic manticore wendigo cthulhu eldritch fiend fairy elf elven dwarf mermaid sphinx abomination ent dryad satyr djinn genie oni kitsune lamia siren',
    ),
  },
  {
    category: 'creature',
    tokens: words(
      'anteater axolotl badger capybara centipede clownfish dodo donkey eel ermine finch flamingo flatfish gecko heron hummingbird ibis mite mosquito ostrich pangolin piranha porcupine porcupinefish rattlesnake salamander salmon seagull sloth sparrow stork swallow tadpole tapir toucan trilobite vulture tick mussel oyster scallop manta pelican dimetrodon diplodocus pterodactylus plesiosaurus stegosaurus parasaurolophus velociraptor helicoprion earwig maggot trout ammonite feline cat bandit caveman clown convict cultist fencer juggler pianist pikeman prisoner rogue sergeant corporal spartan teacher bowman brute cook mechanic scientist sherlock luchador ringmaster contortionist eskimo minion minions character eyeball eyelashes fingernail forearm incisors jawbone kidneys liver lungs ribcage stomach bowels fetus embryo tumor snout udder footprint footsteps barefoot torso mustache cleopatra nefertiti caesar pharoah conqueror champions medallist gnome lovers dorsal chameleon swallower wolf wolves bear lion tiger cat cats dog dogs hound fox rat mouse bat bats bird birds eagle hawk falcon owl raven crow parrot chicken rooster duck swan dove pigeon penguin fish shark whale dolphin octopus squid crab lobster shrimp snake snakes serpent cobra viper lizard frog toad turtle tortoise crocodile croc alligator spider spiders scorpion ant ants bee bees wasp beetle butterfly moth fly worm snail slug horse pony deer stag elk moose boar pig cow bull ox goat sheep ram rabbit hare monkey ape gorilla elephant rhinoceros hippo giraffe camel kangaroo panda koala squirrel hedgehog mole beaver otter seal walrus bison buffalo mammoth dinosaur raptor triceratops beast animal paw paws claw claws fang fangs feather feathers beak tusk tusks mane hoof jellyfish starfish seahorse mantis caterpillar ladybug cricket grasshopper dragonfly bug insect person people man men woman women child baby family warrior knight soldier soldiers archer ninja samurai pirate viking king queen prince princess monk priest nun hunter swordman swordwoman barbarian gladiator thief assassin spy cowboy farmer miner sailor jester guard guards egg eggs horn horns hive head heads hand hands eye eyes face faces body wing wings brain arm arms finger fingers mouth foot feet leg legs knee fist lips tail organ female male human humans player players meeple team doctor robber figure profile kick punch walking hobbit armadillo goose reptile fur heel skin hair beard teeth tooth tongue nose ear muscle biceps',
    ),
  },
  {
    category: 'weapon',
    tokens: words(
      'ak47 ak47u autogun automatic blunderbuss c96 chaingun chakram colt famas flamethrower flamer fn glock gunshot luger mac mp mp5 mp5k p90 panzerfaust steyr tec uzi walther thompson enfield minigun molotov kusarigama sai torpedo caltrops gladius hatchet hatchets detonator headshot crosshair backstab minefield blaster chainsaw brass knuckles baton slingshot squib reticule sword swords blade blades dagger daggers knife knives axe axes mace warhammer spear spears lance halberd trident bow crossbow arrow arrows gun guns pistol rifle revolver cannon bomb bombs grenade missile sling slingshot whip flail scythe sickle katana saber sabre rapier scimitar club shuriken kunai javelin harpoon glaive dart darts bullet bullets ammo musket shotgun sniper bazooka machete cleaver nunchaku tomahawk boomerang catapult trebuchet ballista broadsword claymore estoc stiletto switchblade wound wounds spiked spikes barbed shot turret laser bayonet dynamite explosive bombing bomber assault war battle strike striking slashes slash bolas arrowhead mine mines stab',
    ),
  },
  {
    category: 'armor',
    tokens: words(
      'bandana balaclava fedora fez kimono poncho sombrero turban ushanka shorts trousers underwear socks sandal skirt hoodie corset tie sunglasses spectacles eyepatch tiara torc loincloth pickelhaube stahlhelm galea plastron lamellar kevlar bracer bracers pteruges toga clothes outfit sleeveless pants elbow flops swimfins snorkel shield shields helmet helm helms armor armour breastplate gauntlet gauntlets cuirass visor pauldrons greaves chainmail mail vest buckler boot boots hat hats cap shirt dress glove gloves shoes shoe belt jacket suit hood cloak cape mask masks slippers barbute collar glasses goggles robe tunic coat',
    ),
  },
  {
    category: 'magic',
    tokens: words(
      'voodoo caduceus asclepius ouroboros incense miracle remedy regeneration healing enlightenment meditation inspiration wisdom knowledge prayer martyr stigmata vortex magic magick magical spell spells wand staff rune runes potion potions aura portal orb orbs pentagram sigil enchant enchanted mystic mystical arcane ritual summon summoning curse cursed hex wizard witch warlock sorcery sorcerer mage alchemy elixir cauldron grimoire tarot totem charm amulet talisman divination oracle psychic telepathy hypnotic teleport beams sparkles sparkling glowing crystal crystals third mana spellbook evil life time power mighty ancient invisible idea duality horus mind psychic dream curse blessing holy unholy',
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
      'agave algae baobab beanstalk beech bud daisy fern flax hemp jasmine lily pads poppy reed seedling sunflower venus flytrap stump tumbleweed cliff crags hills hill peaks summits mountaintop valley waterfall jungle swamp oasis quicksand galaxy asteroid jupiter mars orbit horizon fog flood dew uluru fuji iceberg icebergs stalactites stalagtite tide tree trees leaf leaves flower flowers plant plants vine vines root roots forest grass mushroom mushrooms sun moon mountain mountains river lake sea ocean island desert cave sunrise sunset rainbow seed seeds sprout fruit apple berry berries rose oak pine palm cactus planet world globe field meadow bush herb wheat corn lotus clover bamboo coral shell',
    ),
  },
  {
    category: 'place',
    tokens: words(
      'arena bank barn barracks bridge bunker capitol castle church coliseum dam door doors doorway dungeon factory fort fortress gate granary greenhouse harbor hospital house hut huts igloo lighthouse obelisk observatory pagoda palace palisade saloon shop stable temple tipi tower village warehouse watchtower well windmill windpump cabin treehouse road railway rail stairs elevator escalator path crossroad maze menhir dolmen tumulus moai monument ruins wall walls brick bricks city garage office shelter sanctuary shrine cathedral mosque citadel oppidum pavilion pylon refinery reactor silo theater tribunal court alley rempart portculis drawbridge barricade fence window hatch floor ceiling chimney fireplace furnace platform bench akhet aqueduct triomphe opera pisa rialto basil qaitbay sydney africa algeria angola antarctica australia belgium bolivia brazil bulgaria cambodia colombia corsica egypt egyptian france guatemala hungary iceland india iraq italia japan kenya latvia libya mexico moldova mongolia nigeria paraguay peru poland portugal spain switzerland tanzania texas tunisia uruguay venezuela korea america sri lanka',
    ),
  },
  {
    category: 'food',
    tokens: words(
      'acorn almond avocado bacon banana beans beer beet blackcurrant boba bread broccoli butter cabbage cake candy carambola carrot cheese cherry chili chocolate coconuts coffee cookie croissant cupcake dango donut dumpling bao elderberry flour fries garlic grapes ham hamburger honey honeycomb hops jelly kebab ketchup leek lemon marshmallows meal meat melon milk nachos noodles oat olive orange peach peanut pear peas pickle pie pimiento pineapple pizza plum popcorn potato pretzel pumpkin raddish raspberry rice salt sandwich sausage steak strawberry sushis tacos tangerine tomato toast watermelon martini champagne booze artichoke asparagus aubergine bok choy charcuterie oden onigori spices sugar cane grain wheat corn apple fruit berries berry nectar barbecue drink drinking eating food cooker chanterelles',
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
      'apc battleship biplane bulldozer caravel caravan chariot cruiser dreadnought drakkar flatbed forklift galleon galley jeep paddle paddles raft sail submarine trireme tread unicycle velocipede skateboard snowboard skis spaceship starfighter shuttle steamroller van carrier propeller parachute ufo lunar module spoutnik sattelite accordion bagpipes banjo bassoon clarinet djembe gong lyre maracas ocarina saxophone tambourine trombone tuba viola violin carillon carnyx bugle metronome otamatone vuvuzelas windchimes piano armchair bathtub bed beds blanket blender bookshelf desk fridge pillow sofa shower toaster towel teapot saucepan wok ladle whisk chopsticks corkscrew crowbar chisel clamp drill funnel hanger lever pitchfork plow plunger rake screwdriver spanner trowel wheelbarrow scalpel stethoscope microscope binoculars spyglass sextant astrolabe periscope calculator laptop pc smartphone microchip processor server headphones earbuds microphone gamepad joystick vhs boombox flashlight lighter matchbox stopwatch watch envelope newspaper notebook passport ticket briefcase suitcase wallet knapsack lockpicks keyring handcuffs handcuffed manacles razor comb toothbrush lipstick pill pills medicine medicines medecine kit bandaged cassette abacus amphora vase pottery urns easel palette brush highlighter stamp gavel scales scale weight bellows jerrycan cannister cooler sink tap knob carabiner lasso stool lockers mailbox gyroscope radar dish sensor detector circuitry database network router headset kindle cootie catcher kite frisbee puzzle jigsaw domino tiles backgammon chessboard marbles pinball balloons pinata popper skateboarding surf board golf tee hockey shuttlecock tennis racket rugby basketball bowling spikeball tambourine turbine propulsion engine elevator escalator clothesline clothespin hourglass sundial pendulum hiking pick hammer wrench key keys lamp lantern torch rope bag backpack toolbox saw pickaxe shovel anvil gear gears cog cogs compass map telescope hourglass clock candle candles bucket bottle flask jar box crate book books scroll quill pen pencil scissors needle magnifying glass lock padlock chain chains ladder bell trumpet drum guitar harp flute dice cup mug pot pan fork spoon wheel cart ship boat car truck robot machine computer phone camera tv radio battery bulb plug cable tent broom hook net trap barrel pipe bottle vial syringe ball balls can paper tube chair table basket pin tape film mirror soap stapler megaphone speaker magnet screw nails wire mallet shears thermometer keyboard calendar folder tablet archive controller console cpu projector bandage medical capsule bike airplane plane rocket satellite tank bus wagon sailboat canoe subway helicopter jet scooter ambulance glider crane tire roller train tractor bicycle umbrella spray',
    ),
  },
  {
    category: 'symbol',
    tokens: words(
      'aquarius aries cancer capricorn gemini leo libra pisces sagittarius scorpio taurus virgo ophiuchus chess bishop pawn rook triforce triquetra trinacria fleur lys heptagram hexes omega lambda dwennimmen balkenkreuz rub hizb freemasonry anarchy biohazard nuclear radiations recycle rss wifi save help select settings share confirmed checklist histogram diagram organigram progression upgrade resize flip expand transform toggles halt interdiction tally mark position marker crossroad arrowed ascending pointing look circle circles triangle square star stars cross plus minus check checkbox cancel stop info question exclamation sign emblem banner flag logo letter number card cards ace clubs spades hearts diamonds yin yang infinity spiral swirl triskelion pentacle ankh arrows rotation icon target abstract heart hearts love level logic button disc half double triple zigzag one two three four five rank signal chart test extra high up down back backward forward symbol trefoil hieroglyph knot ribbon cube pyramid dot dots line lines shape',
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
