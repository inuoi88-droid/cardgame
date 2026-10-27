/**
 * みんなの広場・運営・公式カードの上書き（決定事項 #141）の受付。純粋な処理（DB・時刻・ハッシュ・乱数は外から渡す）。
 * - 運営：パスワード（DB に塩つきの繰り返しハッシュだけ）で入る。間違いは回数を数えて止める
 * - 公開できるのは運営だけ。見るのは誰でも（鍵なし）。取り下げは持ち主か運営
 * - 公式カードの書き換えは運営だけ。保存した時点で全員に効き、履歴が残る（元に戻すも1行）
 */
import { analyzeCard } from '../../engine/analyze.ts';
import { parseCard } from '../../engine/io.ts';
import type { CardDef } from '../../engine/types.ts';
import { isOfficialCardId, officialEditProblem } from '../../official/index.ts';
import { cleanText } from '../codes.ts';
import { checkDeck } from '../room.ts';
import { RATE_WINDOW, type PlayerRecord, type SocialStore } from '../social/types.ts';
import type { PlazaErrorReason, PlazaOk, PlazaOp, PlazaReplies, PlazaRequest, PlazaResponse, PublicItemFull, PublicItemView } from './protocol.ts';
import {
  MAX_PUBLIC_ITEMS,
  OFFICIAL_HISTORY_LIMIT,
  PLAZA_PAGE,
  PUBLIC_ITEM_MAX_CHARS,
  PUBLIC_NAME_MAX,
  PUBLIC_TOTAL_MAX_CHARS,
  STAFF_FAIL_PER_CLIENT_HOUR,
  STAFF_FAIL_PER_HOUR,
  STAFF_FAIL_PER_PLAYER_HOUR,
  type PlazaStore,
  type PublicItemRecord,
  type PublicItemSummaryRecord,
} from './types.ts';

export interface PlazaDeps {
  plaza: PlazaStore;
  social: SocialStore;
  now: number;
  /** SHA-256 の16進 */
  hash(text: string): Promise<string>;
  /** 新しい乱数の16進（64文字。公開の ID に先頭16文字を使う） */
  newToken(): string;
  /** 送り元（IP のハッシュ）。無ければ送り元ごとの上限は見ない */
  clientKey?: string;
}

class PlazaFail extends Error {
  readonly reason: PlazaErrorReason;
  constructor(message: string, reason: PlazaErrorReason) {
    super(message);
    this.reason = reason;
  }
}

function fail(message: string, reason: PlazaErrorReason): never {
  throw new PlazaFail(message, reason);
}

const reply = <K extends PlazaOp>(op: K, body: PlazaReplies[K]): PlazaOk<K> => ({ ok: true, op, ...body }) as PlazaOk<K>;

/**
 * 運営のパスワードの保存値を作る（`<回数>$<塩>$<ハッシュ>`）。ハッシュは `cardgame-staff:<塩>:<パスワード>` の SHA-256 を回数だけ重ねたもの。
 * 保存値は DB にだけ置く（scripts/staff-password.mts で作る）
 */
export async function staffPasswordHash(password: string, salt: string, rounds: number, hash: (t: string) => Promise<string>): Promise<string> {
  let h = await hash(`cardgame-staff:${salt}:${password}`);
  for (let i = 1; i < rounds; i++) h = await hash(h);
  return `${rounds}$${salt}$${h}`;
}

/** 回数の上限（保存値の回数が大きすぎて止まらないように） */
const MAX_ROUNDS = 20_000;

async function passwordMatches(password: string, stored: string, hash: (t: string) => Promise<string>): Promise<boolean> {
  const [r, salt, expected] = stored.split('$');
  const rounds = Number(r);
  if (!salt || !expected || !Number.isInteger(rounds) || rounds < 1 || rounds > MAX_ROUNDS) return false;
  const got = (await staffPasswordHash(password, salt, rounds, hash)).split('$')[2]!;
  // 長さと中身を、途中で抜けずに比べる
  let diff = got.length ^ expected.length;
  for (let i = 0; i < Math.max(got.length, expected.length); i++) diff |= (got.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  return diff === 0;
}

export async function handlePlaza(req: PlazaRequest, deps: PlazaDeps): Promise<PlazaResponse> {
  try {
    return await dispatch(req, deps);
  } catch (e) {
    if (e instanceof PlazaFail) return { ok: false, error: e.message, reason: e.reason };
    throw e;
  }
}

async function me(secret: string, deps: PlazaDeps): Promise<PlayerRecord> {
  const p = await deps.social.playerBySecretHash(await deps.hash(secret));
  if (!p) fail('プレイヤー情報が見つかりません。引き継ぎコードを確かめてください', 'auth');
  return p;
}

async function staff(secret: string, deps: PlazaDeps): Promise<PlayerRecord> {
  const p = await me(secret, deps);
  if (!(await deps.plaza.isStaff(p.id))) fail('運営だけができます', 'staff');
  return p;
}

/** 持ち主の名前とフレンドコードを付けて、一覧の形にする */
async function views(rows: readonly PublicItemSummaryRecord[], deps: PlazaDeps): Promise<PublicItemView[]> {
  const owners = new Map((await deps.social.playersByIds([...new Set(rows.map((r) => r.ownerId))])).map((p) => [p.id, p]));
  return rows.map((r) => {
    const o = owners.get(r.ownerId);
    return {
      id: r.id,
      kind: r.kind,
      name: r.name,
      count: r.count,
      owner: { name: o?.name ?? '（退会したプレイヤー）', friendCode: o?.friendCode ?? '' },
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      cover: r.cover,
    };
  });
}

function summaryOf(r: PublicItemRecord): PublicItemSummaryRecord {
  const { card: _card, deck: _deck, cards: _cards, ...rest } = r;
  return rest;
}

/** カードを読み、ルール違反なら断る */
function checkedCard(raw: unknown): CardDef {
  const c = parseCard(raw);
  if (!c.ok) fail(`カードの形式が正しくありません：${c.error}`, 'invalid');
  const a = analyzeCard(c.value);
  if (!a.valid) fail(`カードがルール違反です：${a.violations[0]?.message ?? ''}`, 'invalid');
  return { ...c.value, name: cleanText(c.value.name, PUBLIC_NAME_MAX) || c.value.name };
}

async function dispatch(req: PlazaRequest, deps: PlazaDeps): Promise<PlazaResponse> {
  const { plaza, social, now } = deps;
  switch (req.op) {
    case 'staffLogin': {
      const p = await me(req.secret, deps);
      if (await plaza.isStaff(p.id)) return reply('staffLogin', { staff: true });
      const since = now - RATE_WINDOW.hour;
      const tooMany =
        (await social.countEvents('staffFail', p.id, since)) >= STAFF_FAIL_PER_PLAYER_HOUR ||
        (deps.clientKey !== undefined && (await social.countEvents('staffFail', deps.clientKey, since)) >= STAFF_FAIL_PER_CLIENT_HOUR) ||
        (await social.countEvents('staffFail', '*', since)) >= STAFF_FAIL_PER_HOUR;
      if (tooMany) fail('パスワードを間違えた回数が多すぎます。1時間ほどしてからお試しください', 'limit');
      const stored = await plaza.staffPassword();
      if (!stored) fail('運営の入口はまだ用意されていません', 'unsupported');
      if (!(await passwordMatches(req.password, stored, deps.hash))) {
        await social.addEvent('staffFail', p.id, now);
        if (deps.clientKey) await social.addEvent('staffFail', deps.clientKey, now);
        await social.addEvent('staffFail', '*', now);
        fail('パスワードが違います', 'denied');
      }
      await plaza.setStaff(p.id, true, now);
      return reply('staffLogin', { staff: true });
    }
    case 'staffLogout': {
      const p = await me(req.secret, deps);
      await plaza.setStaff(p.id, false, now);
      return reply('staffLogout', { staff: false });
    }
    case 'plazaMe': {
      const p = await me(req.secret, deps);
      const mine = (await plaza.itemsByOwner(p.id)).sort((a, b) => b.updatedAt - a.updatedAt);
      return reply('plazaMe', { staff: await plaza.isStaff(p.id), friendCode: p.friendCode, mine: await views(mine, deps) });
    }
    case 'plazaList': {
      const rows = await plaza.listItems({ ...(req.kind ? { kind: req.kind } : {}), ...(req.before ? { before: req.before } : {}), limit: PLAZA_PAGE + 1 });
      const page = rows.slice(0, PLAZA_PAGE);
      const last = page[page.length - 1];
      return reply('plazaList', { items: await views(page, deps), next: rows.length > PLAZA_PAGE && last ? { at: last.updatedAt, id: last.id } : null });
    }
    case 'plazaGet': {
      const item = await plaza.item(req.id);
      if (!item) fail('公開が見つかりません（取り下げられた可能性があります）', 'notFound');
      const [view] = await views([summaryOf(item)], deps);
      const full: PublicItemFull = { ...view!, ...(item.card ? { card: item.card } : {}), ...(item.deck ? { deck: item.deck, cards: item.cards ?? [] } : {}) };
      return reply('plazaGet', { item: full });
    }
    case 'plazaPublish': {
      const p = await staff(req.secret, deps);
      let draft: Omit<PublicItemRecord, 'id' | 'ownerId' | 'size' | 'createdAt' | 'updatedAt'>;
      if (req.kind === 'card') {
        const card = checkedCard(req.card);
        draft = { kind: 'card', sourceId: card.id, name: card.name, card, count: 1, cover: card };
      } else {
        const checked = checkDeck(req.deck, req.cards);
        if (!checked.ok) fail(checked.error, 'invalid');
        const { deck, cards } = checked.value;
        const top = [...deck.entries].sort((a, b) => b.count - a.count)[0];
        draft = {
          kind: 'deck',
          sourceId: deck.id,
          name: [...deck.name].slice(0, PUBLIC_NAME_MAX).join('') || 'デッキ',
          deck,
          cards,
          count: deck.entries.reduce((n, e) => n + e.count, 0),
          cover: cards.find((c) => c.id === top?.cardId) ?? null,
        };
      }
      const size = JSON.stringify(draft.card ?? { deck: draft.deck, cards: draft.cards }).length;
      if (size > PUBLIC_ITEM_MAX_CHARS) fail('データが大きすぎて公開できません', 'limit');
      const mine = await plaza.itemsByOwner(p.id);
      const others = mine.filter((m) => !(m.kind === draft.kind && m.sourceId === draft.sourceId));
      if (others.length >= MAX_PUBLIC_ITEMS) fail(`公開できるのは${MAX_PUBLIC_ITEMS}個までです`, 'limit');
      if (others.reduce((n, m) => n + m.size, 0) + size > PUBLIC_TOTAL_MAX_CHARS) fail('公開しているものが多すぎます。使わないものを取り下げてください', 'limit');
      const id = await plaza.putItem({ ...draft, id: deps.newToken().slice(0, 16), ownerId: p.id, size, createdAt: now, updatedAt: now });
      const saved = await plaza.item(id);
      const [view] = await views([summaryOf(saved!)], deps);
      return reply('plazaPublish', { item: view! });
    }
    case 'plazaRemove': {
      const p = await me(req.secret, deps);
      const item = await plaza.item(req.id);
      if (!item) fail('公開が見つかりません（取り下げられた可能性があります）', 'notFound');
      if (item.ownerId !== p.id && !(await plaza.isStaff(p.id))) fail('自分が公開したものだけ取り下げられます', 'staff');
      await plaza.removeItem(item.id);
      return reply('plazaRemove', { removed: item.id });
    }
    case 'officialList': {
      const o = await plaza.officialOverrides();
      return reply('officialList', req.since === o.version ? { version: o.version } : { version: o.version, cards: o.cards });
    }
    case 'officialSave': {
      const p = await staff(req.secret, deps);
      const card = checkedCard(req.card);
      const problem = officialEditProblem(card);
      if (problem) fail(problem, 'invalid');
      const version = await plaza.saveOfficial(card.id, card, p.id, now);
      return reply('officialSave', { version, card });
    }
    case 'officialReset': {
      const p = await staff(req.secret, deps);
      if (!isOfficialCardId(req.cardId)) fail('公式カードではありません', 'invalid');
      return reply('officialReset', { version: await plaza.saveOfficial(req.cardId, null, p.id, now) });
    }
    case 'officialHistory': {
      await staff(req.secret, deps);
      const rows = await plaza.officialHistory(req.cardId, OFFICIAL_HISTORY_LIMIT);
      const names = new Map((await social.playersByIds([...new Set(rows.map((r) => r.by))])).map((x) => [x.id, x.name]));
      return reply('officialHistory', { history: rows.map((r) => ({ version: r.version, card: r.card, by: names.get(r.by) ?? '（退会したプレイヤー）', at: r.at })) });
    }
  }
}
