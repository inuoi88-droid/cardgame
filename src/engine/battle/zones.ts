/** カードの移動：ドロー、召喚、ノイズ、バウンス、奪取、コピー、蘇生、解除 */
import { BALANCE } from '../balance.ts';
import { getDrawback, getEffect } from '../registry.ts';
import { TIMINGS } from '../options.ts';
import { cardName, emptyStatuses, findMonster, isEnded, log, monsterLabel, newUid, turnLimits } from './core.ts';
import { keywordFlags, onLeaveBoard } from './damage.ts';
import { pick, randInt, shuffle } from './rng.ts';
import { makeRuntime } from './runtime.ts';
import { enqueueCardTiming, enqueueMonsters, enqueuePowers } from './triggers.ts';
import type { CardDef } from '../types.ts';
import {
  ARMY_CARD_ID,
  NOISE_CARD_ID,
  TOKEN_CARD_ID,
  type CardInst,
  type ChoiceOption,
  type Chosen,
  type GameState,
  type Monster,
  type PlayerId,
  type SourceRef,
  type TokenSpec,
} from './types.ts';

/** 山札が尽きたら捨て札をシャッフルして山札にする。引けた枚数を返す */
export function drawCards(g: GameState, p: PlayerId, count: number, depth: number): number {
  const ps = g.players[p];
  const drawn: CardInst[] = [];
  // 1ターンに引ける枚数の上限（対戦前の手札・マリガンは数えない）
  const limits = g.phase === 'main' ? turnLimits(g, ps) : null;
  const maxDraw = BALANCE.battle.maxDrawPerTurn;
  let capped = false;
  for (let i = 0; i < count; i++) {
    if (limits && limits.drawn >= maxDraw) {
      capped = true;
      break;
    }
    if (ps.deck.length === 0) {
      if (ps.discard.length === 0) break;
      ps.deck = ps.discard;
      ps.discard = [];
      shuffle(g, ps.deck);
      log(g, depth, `${ps.name}の山札が尽きたので、捨て札${ps.deck.length}枚をシャッフルして山札にした`, 'info');
    }
    const card = ps.deck.shift()!;
    ps.hand.push(card);
    drawn.push(card);
    if (limits) limits.drawn += 1;
  }
  if (capped) log(g, depth, `${ps.name}はこのターンもう引けない（1ターン${maxDraw}枚まで）`, 'info');
  if (drawn.length > 0) {
    log(g, depth, `${ps.name}はカードを${drawn.length}枚引いた`, 'info', undefined, { kind: 'draw', player: p, amount: drawn.length });
    log(g, depth, `引いたカード：${drawn.map((c) => cardName(g, c.cardId)).join('、')}`, 'info', p);
  } else if (count > 0) {
    log(g, depth, `${ps.name}は引けるカードがなかった`, 'info');
  }
  afterDrawn(g, p, drawn, depth);
  return drawn.length;
}

/**
 * 山札の特定のカードを引く（発見・探検。MTG 要素 ○ バッチB）。1ターンに引ける枚数に数え、引いたときの効果も出る。
 * 上限で引けなければ山札に残して false
 */
export function drawSpecific(g: GameState, p: PlayerId, uid: string, depth: number): boolean {
  const ps = g.players[p];
  const i = ps.deck.findIndex((c) => c.uid === uid);
  if (i < 0) return false;
  const limits = g.phase === 'main' ? turnLimits(g, ps) : null;
  if (limits && limits.drawn >= BALANCE.battle.maxDrawPerTurn) {
    log(g, depth, `${ps.name}はこのターンもう引けない（1ターン${BALANCE.battle.maxDrawPerTurn}枚まで）`, 'info');
    return false;
  }
  const [card] = ps.deck.splice(i, 1);
  ps.hand.push(card!);
  if (limits) limits.drawn += 1;
  log(g, depth, `${ps.name}はカードを1枚手札に加えた`, 'info', undefined, { kind: 'draw', player: p, amount: 1 });
  log(g, depth, `手札に加えたカード：${cardName(g, card!.cardId)}`, 'info', p);
  afterDrawn(g, p, [card!], depth);
  return true;
}

/** 引いたあとの処理：引いたときのデメリット（寄生）と、タイミング「引いたとき」 */
function afterDrawn(g: GameState, p: PlayerId, drawn: CardInst[], depth: number): void {
  const ps = g.players[p];
  // 引いたときのデメリット（寄生：決定事項 #70 R7）。カード名は相手に見せない
  for (const card of drawn) {
    const def = g.cards[card.cardId];
    for (const d of def?.drawbacks ?? []) {
      const hook = getDrawback(d.id)?.battle.onDrawn;
      if (!hook) continue;
      if (isEnded(g)) return;
      const src: SourceRef = { kind: 'card', uid: card.uid, cardId: card.cardId, name: def!.name, controller: p };
      log(g, depth, `${ps.name}が引いたカードのデメリット：${getDrawback(d.id)!.name}`, 'effect');
      hook(makeRuntime(g, src, [], { depth: depth + 1, attackCard: false }), d);
    }
  }
  // 「引いたとき」（MTG 要素 ○ バッチA）：対戦が始まってから引いたカードだけ（配った手札・マリガンでは出ない）。
  // 引いた順に、この処理のあとで解決する。効果が出ると、引いたカードが相手にも分かる
  if (g.phase === 'main') {
    for (const card of drawn) {
      const def = g.cards[card.cardId];
      if (!def || card.cardId === NOISE_CARD_ID) continue;
      if (!def.effects.some((e) => e.timing === 'drawn') && !def.drawbacks.some((d) => d.timing === 'drawn')) continue;
      const src: SourceRef = { kind: 'card', uid: card.uid, cardId: card.cardId, name: def.name, controller: p };
      log(g, depth, `${ps.name}は「${def.name}」を引いた（引いたときの効果）`, 'effect', undefined, { kind: 'status', player: p, cardId: card.cardId, uid: card.uid, status: 'drawn' });
      enqueueCardTiming(g, src, def, 'drawn', {}, depth + 1, {});
    }
  }
}

/** モンスターを場に出す（召喚時の効果は呼び出し側で積む）。トークンは CardInst.token の強さで出る */
export function placeMonster(g: GameState, p: PlayerId, card: CardInst, depth: number): Monster | undefined {
  const def = g.cards[card.cardId];
  if (!def?.stats) return undefined;
  const attack = card.token?.attack ?? def.stats.attack;
  const hp = card.token?.hp ?? def.stats.hp;
  const defense = card.token ? (card.token.defense ?? 0) : def.stats.defense;
  const m: Monster = {
    uid: card.uid,
    card,
    owner: card.owner,
    controller: p,
    attack,
    hp,
    maxHp: hp,
    defense,
    enteredTurn: g.turnIndex,
    attacksUsed: 0,
    sealed: false,
    undyingUsed: false,
    stealth: false,
    betraying: false,
    counters: {},
    status: emptyStatuses(),
  };
  // 応召の一時トークンは速攻を持つ（MTG 要素 ○ バッチB）
  if (card.token?.temp) m.granted = ['haste'];
  m.stealth = keywordFlags(g, m).stealthOnSummon === true;
  g.players[p].board.push(m);
  const kind = card.token?.copy ? '（コピー）' : card.token?.temp ? '（ターン終了時に消える）' : '';
  log(g, depth, `${g.players[p].name}の場に「${def.name}」${kind}が出た（攻撃力${m.attack}・体力${m.hp}・守備力${m.defense}）`, 'effect', undefined, {
    kind: 'summon',
    player: p,
    cardId: card.cardId,
    uid: m.uid,
  });
  return m;
}

/** 召喚：場に出して、召喚時のデメリットと効果を積む */
export function summon(g: GameState, p: PlayerId, card: CardInst, chosen: Chosen, depth: number, protectKey?: string): Monster | undefined {
  const m = placeMonster(g, p, card, depth);
  if (!m) return undefined;
  const def = g.cards[card.cardId]!;
  const src: SourceRef = { kind: 'monster', uid: m.uid, cardId: card.cardId, name: def.name, controller: p, ...(card.token ? { token: true } : {}) };
  enqueueCardTiming(g, src, def, 'summon', chosen, depth + 1, protectKey ? { protectKey } : {});
  onMonsterEntered(g, m, depth + 1);
  return m;
}

/**
 * モンスターが場に出たときの共通処理（召喚・蘇生。奪取は入場に数えない）。召喚時の効果を積んだあとに呼ぶ。
 * 手番のプレイヤーの場に出たら「このターンに出した数」を数え、持ち主のパワー → 場のモンスター（左から、出たモンスター自身を除く）の
 * 「自分のモンスターが出るたび」を積む（「出たモンスター」はそのモンスター）
 */
export function onMonsterEntered(g: GameState, m: Monster, depth: number): void {
  if (g.phase === 'main' && m.controller === g.active) {
    const turn = g.players[g.active].turn;
    turn.summoned = (turn.summoned ?? 0) + 1;
  }
  const chosen: Chosen = { ally: m.uid };
  enqueuePowers(g, m.controller, 'allySummoned', depth, { chosen });
  enqueueMonsters(g, m.controller, 'allySummoned', depth, { chosen, excludeUid: m.uid });
}

/** ノイズを山札のランダムな位置に混ぜる */
export function addNoise(g: GameState, p: PlayerId, count: number, depth: number): void {
  const ps = g.players[p];
  for (let i = 0; i < count; i++) {
    const card: CardInst = { uid: newUid(g, 'n'), cardId: NOISE_CARD_ID, owner: p };
    ps.deck.splice(randInt(g, ps.deck.length + 1), 0, card);
  }
  log(g, depth, `${ps.name}の山札にノイズを${count}枚混ぜた`);
}

/** 手札をランダムに捨てる。手札がなければ、代わりに次のターンに引く枚数が1枚減る（決定事項 #70 R7） */
export function discardRandom(g: GameState, p: PlayerId, count: number, depth: number): void {
  const ps = g.players[p];
  for (let i = 0; i < count; i++) {
    const card = pick(g, ps.hand);
    if (!card) {
      const rest = count - i;
      ps.next.draw -= rest;
      log(g, depth, `${ps.name}の手札がないので、代わりに次のターンに引く枚数−${rest}`);
      return;
    }
    ps.hand.splice(ps.hand.indexOf(card), 1);
    discardCard(g, card);
    log(g, depth, `${ps.name}は手札の「${cardName(g, card.cardId)}」を捨てた`);
  }
}

/** 捨て札に置く（残らないコピーは除外。トークンはどこにも行かない）。元の持ち主の捨て札へ */
export function discardCard(g: GameState, card: CardInst): void {
  if (card.token) return;
  const owner = g.players[card.owner];
  if (card.copy === 'temp') owner.exile.push(card);
  else owner.discard.push(card);
}

export function removeFromBoard(g: GameState, m: Monster): void {
  const board = g.players[m.controller].board;
  const i = board.findIndex((x) => x.uid === m.uid);
  if (i >= 0) board.splice(i, 1);
}

export function bounce(g: GameState, uid: string, depth: number): void {
  const m = findMonster(g, uid);
  if (!m) return;
  const label = monsterLabel(g, m);
  removeFromBoard(g, m);
  // トークンは手札に戻らず消える
  if (m.card.token) {
    log(g, depth, `${label}は場を離れて消えた（トークン）`, 'effect', undefined, { kind: 'destroy', player: m.controller, cardId: m.card.cardId, uid: m.uid });
    onLeaveBoard(g, m, depth + 1, false);
    return;
  }
  g.players[m.card.owner].hand.push(m.card);
  log(g, depth, `${label}を持ち主（${g.players[m.card.owner].name}）の手札に戻した`);
  onLeaveBoard(g, m, depth + 1, false);
}

/** 場から消す（破壊ではない。応召の一時トークンの退場。MTG 要素 ○ バッチB） */
export function vanish(g: GameState, m: Monster, depth: number, text: string): void {
  if (!findMonster(g, m.uid)) return;
  removeFromBoard(g, m);
  log(g, depth, text, 'effect', undefined, { kind: 'destroy', player: m.controller, cardId: m.card.cardId, uid: m.uid });
  onLeaveBoard(g, m, depth + 1, false);
}

/** モンスターを別のプレイヤーの場へ移す（奪取・借用・借用の期限）。入場には数えない */
function moveMonster(g: GameState, m: Monster, to: PlayerId): void {
  removeFromBoard(g, m);
  m.controller = to;
  m.stealth = false;
  // 消耗は前の持ち主のターンで数えていたので消す
  delete m.counters.exertTurn;
  // 借用の期限も消す（奪い直された・期限で戻った）
  delete m.counters.borrowLeft;
  delete m.counters.borrowFrom;
  g.players[to].board.push(m);
}

export function steal(g: GameState, uid: string, to: PlayerId, depth: number): void {
  const m = findMonster(g, uid);
  if (!m || m.controller === to) return;
  const label = monsterLabel(g, m);
  moveMonster(g, m, to);
  m.enteredTurn = g.turnIndex;
  m.attacksUsed = 0;
  log(g, depth, `${label}を奪って${g.players[to].name}の場に移した（次の自分のターンから攻撃できる）`);
}

/** 借用（MTG 要素 ○ バッチB）：turns ターンの間、自分の場に移す。すぐ攻撃できる。奪った側のターン終了時に数え、0 で戻す */
export function borrow(g: GameState, uid: string, to: PlayerId, turns: number, depth: number): void {
  const m = findMonster(g, uid);
  if (!m || m.controller === to) return;
  const label = monsterLabel(g, m);
  const from = m.controller;
  moveMonster(g, m, to);
  // 速攻と同じ扱い：このターンに攻撃できる
  m.enteredTurn = g.turnIndex - 1;
  m.attacksUsed = 0;
  m.counters.borrowLeft = turns;
  m.counters.borrowFrom = from;
  log(g, depth, `${label}を${turns}ターンの間借りて${g.players[to].name}の場に移した（すぐ攻撃できる）`);
}

/** 借用の期限が来たモンスターを、借りた元のプレイヤーの場へ戻す（召喚酔いなし。受けたダメージ・強化はそのまま） */
export function returnBorrowed(g: GameState, m: Monster, depth: number): void {
  const from = (m.counters.borrowFrom ?? m.owner) as PlayerId;
  const label = monsterLabel(g, m);
  moveMonster(g, m, from);
  m.enteredTurn = g.turnIndex;
  m.attacksUsed = 0;
  log(g, depth, `${label}は借用の期限で${g.players[from].name}の場に戻った`);
}

export function takeFromDeck(g: GameState, p: PlayerId, cardUid: string, depth: number): void {
  const ps = g.players[p];
  const i = ps.deck.findIndex((c) => c.uid === cardUid);
  if (i < 0) return;
  const [card] = ps.deck.splice(i, 1);
  ps.hand.push(card!);
  shuffle(g, ps.deck);
  log(g, depth, `${ps.name}は山札からカードを1枚手札に加え、山札をシャッフルした`);
  log(g, depth, `手札に加えたカード：${cardName(g, card!.cardId)}`, 'info', p);
}

export function takeFromDiscard(g: GameState, p: PlayerId, cardUid: string, depth: number): void {
  const ps = g.players[p];
  const i = ps.discard.findIndex((c) => c.uid === cardUid);
  if (i < 0) return;
  const [card] = ps.discard.splice(i, 1);
  ps.hand.push(card!);
  log(g, depth, `${ps.name}は捨て札から「${cardName(g, card!.cardId)}」を手札に加えた`);
}

export function copyFromHand(g: GameState, p: PlayerId, cardUid: string, keep: boolean, depth: number): void {
  const ps = g.players[p];
  const original = ps.hand.find((c) => c.uid === cardUid);
  if (!original) return;
  const copy: CardInst = { uid: newUid(g, 'c'), cardId: original.cardId, owner: p, copy: keep ? 'keep' : 'temp' };
  ps.hand.push(copy);
  log(g, depth, `${ps.name}は手札のカード1枚のコピーを手札に加えた（${keep ? 'この試合のデッキに残る' : '使うかターン終了で除外'}）`);
  log(g, depth, `コピーしたカード：${cardName(g, original.cardId)}`, 'info', p);
}

/** 蘇生：捨て札のモンスターを召喚扱いで場に出す（「選んだ1体」は選ぶ場面がないので不発） */
export function reviveFromDiscard(g: GameState, p: PlayerId, cardUid: string, depth: number): void {
  const ps = g.players[p];
  const i = ps.discard.findIndex((c) => c.uid === cardUid);
  if (i < 0) return;
  const [card] = ps.discard.splice(i, 1);
  log(g, depth, `${ps.name}は捨て札から「${cardName(g, card!.cardId)}」を蘇生した`);
  summon(g, p, card!, {}, depth);
}

// ---------------------------------------------------------------- 解除（決定事項 #41）

/** 解除で選べる効果：筋力（合計）と、パワーの持続効果（種類＋タイミングごと） */
export function dispelOptions(g: GameState, p: PlayerId): ChoiceOption[] {
  const ps = g.players[p];
  const out: ChoiceOption[] = [];
  if (ps.status.strength > 0) out.push({ id: 'strength', label: `筋力（合計${ps.status.strength}）` });
  const groups = new Map<string, number>();
  for (const power of ps.powers) {
    for (const x of power.effects) {
      if (x.removed) continue;
      const key = `${x.effect.id}:${x.effect.timing}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of groups) {
    const [id, timing] = key.split(':') as [string, keyof typeof TIMINGS];
    const name = getEffect(id)?.name ?? id;
    out.push({ id: `power:${key}`, label: `${TIMINGS[timing]?.label ?? timing}の${name}（${count}つ）` });
  }
  return out;
}

export function dispel(g: GameState, p: PlayerId, key: string, depth: number): void {
  const ps = g.players[p];
  if (key === 'strength') {
    log(g, depth, `${ps.name}の筋力${ps.status.strength}をすべて消した`);
    ps.status.strength = 0;
    return;
  }
  const [, id, timing] = key.split(':');
  let count = 0;
  for (const power of ps.powers) {
    for (const x of power.effects) {
      if (!x.removed && x.effect.id === id && x.effect.timing === timing) {
        x.removed = true;
        count++;
      }
    }
  }
  ps.powers = ps.powers.filter((pw) => pw.effects.some((x) => !x.removed) || pw.drawbacks.length > 0);
  const name = getEffect(id ?? '')?.name ?? id;
  log(g, depth, `${ps.name}の持続効果「${name}」を${count}つ消した`);
}

// ---------------------------------------------------------------- MTG 要素バッチ2

/** トークンのカード定義（名前・アイコンは balance.ts。強さは CardInst.token が決める） */
export function tokenDef(): CardDef {
  const B = BALANCE.battle;
  return {
    v: 1,
    id: TOKEN_CARD_ID,
    name: B.tokenName,
    icon: B.tokenIcon,
    rarity: 'common',
    cost: 0,
    stats: { attack: 0, hp: 1, defense: 0 },
    keywords: [],
    effects: [],
    drawbacks: [],
  };
}

/** 場のトークンの数 */
export function tokenCount(g: GameState, p: PlayerId): number {
  return g.players[p].board.filter((m) => m.card.token).length;
}

/** 軍団（動員）のカード定義（MTG 要素 ○ バッチB） */
export function armyDef(): CardDef {
  const B = BALANCE.battle;
  return { ...tokenDef(), id: ARMY_CARD_ID, name: B.armyName, icon: B.armyIcon };
}

/** トークンを出す（1体ずつ場に出て「自分のモンスターが出るたび」が働く）。場のトークンの上限を超える分は出ない */
export function createTokens(g: GameState, p: PlayerId, attack: number, hp: number, count: number, depth: number, temp = false): void {
  for (let i = 0; i < count; i++) {
    if (!createToken(g, p, null, { attack, hp, ...(temp ? { temp: true } : {}) }, depth)) return;
  }
}

/**
 * トークンを1体出す（MTG 要素 ○ バッチB）。cardId が null なら小鬼、ARMY_CARD_ID なら軍団、それ以外は複写トークン
 * （元のカードの効果・キーワード・デメリットを持ち、召喚扱いで召喚時の効果も出る）。上限なら出さずに undefined
 */
export function createToken(g: GameState, p: PlayerId, cardId: string | null, token: TokenSpec, depth: number): Monster | undefined {
  const max = BALANCE.battle.maxTokens;
  if (tokenCount(g, p) >= max) {
    log(g, depth, `トークンは1人${max}体までなので、これ以上出せない`);
    return undefined;
  }
  const id = cardId ?? TOKEN_CARD_ID;
  if (id === TOKEN_CARD_ID) g.cards[TOKEN_CARD_ID] ??= tokenDef();
  if (id === ARMY_CARD_ID) g.cards[ARMY_CARD_ID] ??= armyDef();
  const card: CardInst = { uid: newUid(g, 'tk'), cardId: id, owner: p, token: { ...token } };
  if (token.copy) return summon(g, p, card, {}, depth);
  const m = placeMonster(g, p, card, depth);
  if (m) onMonsterEntered(g, m, depth + 1);
  return m;
}

/** 動員（MTG 要素 ○ バッチB）：自分の軍団（いなければ攻撃力0・体力0で出す）の攻撃力と体力を+n。出せなければ何もしない */
export function amass(g: GameState, p: PlayerId, n: number, depth: number): Monster | undefined {
  let army = g.players[p].board.find((m) => m.card.cardId === ARMY_CARD_ID);
  if (!army) {
    if (g.players[p].board.filter((m) => m.card.cardId === ARMY_CARD_ID).length >= BALANCE.battle.maxArmy) return undefined;
    army = createToken(g, p, ARMY_CARD_ID, { attack: 0, hp: 0 }, depth);
    if (!army) return undefined;
  }
  const before = { attack: army.attack, hp: army.hp };
  army.attack += n;
  army.maxHp += n;
  army.hp += n;
  log(g, depth, `動員${n}：${monsterLabel(g, army)}の攻撃力 ${before.attack}→${army.attack}、体力 ${before.hp}→${army.hp}`);
  return army;
}

/** 山札の uids を捨て札へ（切削・発見の残り・探検。名前は公開） */
export function deckToDiscard(g: GameState, p: PlayerId, uids: string[], why: string, depth: number): void {
  const ps = g.players[p];
  const set = new Set(uids);
  const moved = ps.deck.filter((c) => set.has(c.uid));
  if (moved.length === 0) return;
  ps.deck = ps.deck.filter((c) => !set.has(c.uid));
  for (const c of moved) discardCard(g, c);
  log(g, depth, `${ps.name}の山札から${moved.length}枚を捨て札に置いた（${why}）：${moved.map((c) => cardName(g, c.cardId)).join('、')}`);
}

/** 山札の uids を、元の並びのまま山札の下へ（続唱でめくったカード） */
export function deckToBottom(g: GameState, p: PlayerId, uids: string[], depth: number): void {
  const ps = g.players[p];
  const set = new Set(uids);
  const moved = ps.deck.filter((c) => set.has(c.uid));
  if (moved.length === 0) return;
  ps.deck = [...ps.deck.filter((c) => !set.has(c.uid)), ...moved];
  log(g, depth, `${ps.name}はめくった${moved.length}枚を山札の下に置いた`, 'info');
}

/** 山札のカードを、順番を変えずに手札へ（抽出。引いた扱いではない。名前は本人だけ） */
export function seekFromDeck(g: GameState, p: PlayerId, uid: string, depth: number): void {
  const ps = g.players[p];
  const i = ps.deck.findIndex((c) => c.uid === uid);
  if (i < 0) return;
  const [card] = ps.deck.splice(i, 1);
  ps.hand.push(card!);
  log(g, depth, `${ps.name}は山札からカードを1枚手札に加えた`);
  log(g, depth, `手札に加えたカード：${cardName(g, card!.cardId)}`, 'info', p);
}

/** 手札か捨て札のカードを除外する（処分） */
export function exileCard(g: GameState, p: PlayerId, cardUid: string, depth: number): void {
  const ps = g.players[p];
  for (const [zone, label] of [
    [ps.hand, '手札'],
    [ps.discard, '捨て札'],
  ] as const) {
    const i = zone.findIndex((c) => c.uid === cardUid);
    if (i < 0) continue;
    const [card] = zone.splice(i, 1);
    if (!card!.token) ps.exile.push(card!);
    log(g, depth, `${ps.name}は${label}の「${cardName(g, card!.cardId)}」を除外した`);
    return;
  }
}

/** 占術：山札の上の uids を、元の並びのまま山札の下か捨て札へ（下に置いたカードの名前は公開しない） */
export function scryMove(g: GameState, p: PlayerId, uids: string[], toDiscard: boolean, depth: number): void {
  const ps = g.players[p];
  const set = new Set(uids);
  const moved = ps.deck.filter((c) => set.has(c.uid));
  if (moved.length === 0) {
    log(g, depth, `${ps.name}は山札の上のカードをそのまま残した`);
    return;
  }
  ps.deck = ps.deck.filter((c) => !set.has(c.uid));
  if (toDiscard) {
    for (const c of moved) discardCard(g, c);
    log(g, depth, `${ps.name}は山札の上から${moved.length}枚を捨て札に置いた：${moved.map((c) => cardName(g, c.cardId)).join('、')}`);
  } else {
    ps.deck.push(...moved);
    log(g, depth, `${ps.name}は山札の上から${moved.length}枚を山札の下に置いた`);
  }
}

/** 手札を選んで捨てる（手札整理）。捨てても何も誘発しない */
export function discardChosen(g: GameState, p: PlayerId, uids: string[], depth: number): void {
  const ps = g.players[p];
  for (const uid of uids) {
    const i = ps.hand.findIndex((c) => c.uid === uid);
    if (i < 0) continue;
    const [card] = ps.hand.splice(i, 1);
    discardCard(g, card!);
    log(g, depth, `${ps.name}は手札の「${cardName(g, card!.cardId)}」を捨てた`, 'info', undefined, { kind: 'discard', player: p, amount: 1 });
  }
}

/** 新しい対戦用カード（ID の付け直しは setup で済ませる） */
export function newCardInst(g: GameState, cardId: string, owner: PlayerId): CardInst {
  return { uid: newUid(g, 'c'), cardId, owner };
}

