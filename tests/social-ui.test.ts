// フレンド機能の画面の純粋な補助（決定事項 #123。src/ui/social/socialLogic.ts）
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SocialSnapshot } from '../src/online/social/protocol.ts';
import {
  agoText,
  badgeCount,
  distinctNames,
  isInAppBrowser,
  needsName,
  sourceLabel,
  formatFriendCode,
  formatSecret,
  friendLinkHash,
  friendLinkUrl,
  friendStateOf,
  identityKey,
  leftText,
  normalizeSecret,
  parseFriendLinkParts,
  parseIdentity,
  recordText,
  requestableOpponents,
  shareSignature,
  sharedDeckIds,
  waitingText,
} from '../src/ui/social/socialLogic.ts';
import type { CardDef, Deck } from '../src/engine/index.ts';

const SECRET = 'ab'.repeat(32);
const TOKEN = '0123456789abcdef0123456789abcdef';

function snap(over: Partial<SocialSnapshot> = {}): SocialSnapshot {
  return {
    me: { name: 'アキ', friendCode: 'AAAABBBB', inboxId: 'inbox' },
    friends: [],
    incoming: [],
    outgoing: [],
    invites: [],
    sentInvites: [],
    sharedDecks: [],
    serverNow: 0,
    ...over,
  };
}

describe('端末のプレイヤー情報', () => {
  it('本番と手元のサーバーでキーを分ける', () => {
    expect(identityKey(null)).toBe('cardgame.v1.player');
    expect(identityKey('http://localhost:8787/')).toBe('cardgame.v1.player@http://localhost:8787/');
  });

  it('壊れた保存は捨て、鍵はならす', () => {
    expect(parseIdentity(null)).toBeNull();
    expect(parseIdentity({ v: 1, secret: 'xyz', friendCode: 'A', inboxId: 'b' })).toBeNull();
    expect(parseIdentity({ v: 1, secret: SECRET.toUpperCase(), friendCode: 'AAAABBBB', inboxId: 'i', name: 'アキ' })).toEqual({
      v: 1,
      secret: SECRET,
      friendCode: 'AAAABBBB',
      inboxId: 'i',
      name: 'アキ',
    });
  });

  it('引き継ぎコードは空白・改行・ハイフン入りでも読める（64桁の16進だけ）', () => {
    expect(normalizeSecret(formatSecret(SECRET))).toBe(SECRET);
    expect(normalizeSecret(` ${SECRET.slice(0, 32)}\n${SECRET.slice(32)} `)).toBe(SECRET);
    expect(normalizeSecret(SECRET.slice(1))).toBeNull();
    expect(normalizeSecret('g'.repeat(64))).toBeNull();
    expect(formatSecret(SECRET).split(' ')).toHaveLength(8);
  });
});

describe('招待リンク', () => {
  it('作ったリンクを読み戻せる（名前は表示用に添えるだけ）', () => {
    const link = { friendCode: 'KU63TQPC', token: TOKEN, name: 'アキ' };
    const hash = friendLinkHash(link);
    expect(hash).toBe(`#/friend/KU63TQPC/${TOKEN}/${encodeURIComponent('アキ')}`);
    const parts = hash.replace(/^#\//, '').split('/').map(decodeURIComponent).slice(1);
    expect(parseFriendLinkParts(parts)).toEqual(link);
  });

  it('アプリの場所（?server= も残す）にハッシュを付ける。前のハッシュは捨てる', () => {
    // openExternalBrowser=1：LINE で開くと、LINE の中ではなくいつものブラウザで開く（決定事項 #124）
    expect(friendLinkUrl('http://localhost:5173/?server=http://localhost:8787', { friendCode: 'KU63TQPC', token: TOKEN, name: '' })).toBe(
      `http://localhost:5173/?server=http://localhost:8787&openExternalBrowser=1#/friend/KU63TQPC/${TOKEN}`,
    );
    expect(friendLinkUrl('https://x.example/#/online', { friendCode: 'KU63TQPC', token: TOKEN, name: '' })).toBe(
      `https://x.example/?openExternalBrowser=1#/friend/KU63TQPC/${TOKEN}`,
    );
    expect(friendLinkUrl('https://x.example/?openExternalBrowser=1', { friendCode: 'KU63TQPC', token: TOKEN, name: '' })).toBe(
      `https://x.example/?openExternalBrowser=1#/friend/KU63TQPC/${TOKEN}`,
    );
  });

  it('形の壊れたリンクは null（小文字・ハイフン入りのコードはならす）', () => {
    expect(parseFriendLinkParts([])).toBeNull();
    expect(parseFriendLinkParts(['KU63TQPC'])).toBeNull();
    expect(parseFriendLinkParts(['KU63TQPC', 'zz'])).toBeNull();
    expect(parseFriendLinkParts(['ku63-tqpc', TOKEN])).toEqual({ friendCode: 'KU63TQPC', token: TOKEN, name: '' });
  });
});

describe('表示の言葉', () => {
  it('フレンドコードを4文字ずつ区切る', () => {
    expect(formatFriendCode('KU63TQPC')).toBe('KU63-TQPC');
  });
  it('成績', () => {
    expect(recordText({ win: 0, loss: 0, draw: 0 })).toBe('まだ対戦していません');
    expect(recordText({ win: 3, loss: 2, draw: 0 })).toBe('3勝 2敗');
    expect(recordText({ win: 1, loss: 0, draw: 2 })).toBe('1勝 0敗 2分');
  });
  it('時間', () => {
    expect(agoText(10_000)).toBe('たった今');
    expect(agoText(5 * 60_000)).toBe('5分前');
    expect(agoText(3 * 3600_000)).toBe('3時間前');
    expect(agoText(50 * 3600_000)).toBe('2日前');
    expect(waitingText(8_000)).toBe('8秒待ち');
    expect(waitingText(125_000)).toBe('2分待ち');
    expect(leftText(30_000)).toBe('あと30秒');
    expect(leftText(9 * 60_000 + 1)).toBe('あと10分');
  });
});

describe('間柄と印', () => {
  const s = snap({
    friends: [{ friendCode: 'FRIEND01', name: 'ベン', presence: 'online', lastSeen: 0, since: 0, record: { win: 0, loss: 0, draw: 0 }, decks: 0 }],
    outgoing: [{ friendCode: 'OUTGOING', name: 'シオ', at: 0 }],
    incoming: [{ friendCode: 'INCOMING', name: 'ダイ', at: 0 }],
    invites: [{ id: 'x', from: { friendCode: 'FRIEND01', name: 'ベン' }, roomCode: 'ABC234', mode: 'deck', at: 0, expiresAt: 1 }],
  });
  it('friendStateOf', () => {
    expect(friendStateOf(s, 'AAAABBBB')).toBe('self');
    expect(friendStateOf(s, 'FRIEND01')).toBe('friend');
    expect(friendStateOf(s, 'OUTGOING')).toBe('outgoing');
    expect(friendStateOf(s, 'INCOMING')).toBe('incoming');
    expect(friendStateOf(s, 'NOBODY00')).toBe('none');
    expect(friendStateOf(null, 'FRIEND01')).toBe('none');
    expect(friendStateOf(s, undefined)).toBe('none');
  });
  it('オンラインのタブの印は届いた申請と招待の数', () => {
    expect(badgeCount(s)).toBe(2);
    expect(badgeCount(null)).toBe(0);
  });
  it('最近の対戦相手のうち申請できる人：新しい順・同じ人は1回・フレンドと申請中と自分は外す', () => {
    const h = [
      { friendCode: 'NEW00001', opponentName: 'A', at: 5 },
      { friendCode: 'FRIEND01', opponentName: 'ベン', at: 9 },
      { friendCode: 'NEW00001', opponentName: 'A', at: 1 },
      { opponentName: 'CPU', at: 8 },
      { friendCode: 'OUTGOING', opponentName: 'シオ', at: 7 },
      { friendCode: 'INCOMING', opponentName: 'ダイ', at: 6 },
      { friendCode: 'AAAABBBB', opponentName: '自分', at: 4 },
    ];
    expect(requestableOpponents(h, s).map((e) => e.friendCode)).toEqual(['INCOMING', 'NEW00001']);
  });
});

describe('公開デッキの送り直しの印', () => {
  const card = (id: string, name: string) => ({ id, name }) as unknown as CardDef;
  const deck: Deck = { v: 1, id: 'd1', name: '毒', entries: [{ cardId: 'c1', count: 2 }] };
  it('使っていないカードやカードの並びでは変わらず、中身が変われば変わる', () => {
    const a = shareSignature(deck, [card('c1', '毒針'), card('c2', '関係ない')]);
    expect(shareSignature(deck, [card('c2', '別'), card('c1', '毒針')])).toBe(a);
    expect(shareSignature(deck, [card('c1', '毒の針')])).not.toBe(a);
    expect(shareSignature({ ...deck, entries: [{ cardId: 'c1', count: 3 }] }, [card('c1', '毒針')])).not.toBe(a);
  });
  it('sharedDeckIds', () => {
    expect([...sharedDeckIds(snap({ sharedDecks: [{ deckId: 'd1', name: '毒', count: 30, updatedAt: 0 }] }))]).toEqual(['d1']);
  });
});

describe('画面の決まり', () => {
  const dir = join(__dirname, '..', 'src', 'ui', 'social');
  it('src/ui/social は絵文字を UI の記号に使わない', () => {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.tsx') || x.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
  it('socialLogic は React・DOM・localStorage を使わない（純粋）', () => {
    const src = readFileSync(join(dir, 'socialLogic.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(src).not.toMatch(/from 'react'|localStorage|document\.|window\.|Date\.now|Math\.random/);
  });
});

describe('名前を見分ける・名前を決める・アプリの中のブラウザ（決定事項 #124）', () => {
  it('同じ名前の人だけ、フレンドコードの先頭4文字を添える', () => {
    const m = distinctNames([
      { friendCode: '2NWHAAAA', name: 'プレイヤー' },
      { friendCode: 'KU63BBBB', name: 'プレイヤー' },
      { friendCode: 'ZZZZCCCC', name: 'アキ' },
      { friendCode: '2NWHAAAA', name: 'プレイヤー' },
    ]);
    expect(m.get('2NWHAAAA')).toBe('プレイヤー（2NWH）');
    expect(m.get('KU63BBBB')).toBe('プレイヤー（KU63）');
    expect(m.get('ZZZZCCCC')).toBe('アキ');
  });
  it('自動の「プレイヤー」と空は、名前を決めていない', () => {
    expect(needsName('')).toBe(true);
    expect(needsName(' プレイヤー ')).toBe(true);
    expect(needsName(null)).toBe(true);
    expect(needsName('アキ')).toBe(false);
  });
  it('コピーのグループの名前：「プレイヤー」のままの人はフレンドコードで分ける', () => {
    expect(sourceLabel('プレイヤー', 'KU63TQPC')).toBe('プレイヤー（KU63）');
    expect(sourceLabel('アキ', 'KU63TQPC')).toBe('アキ');
    expect(sourceLabel('プレイヤー', undefined)).toBe('プレイヤー');
  });
  it('LINE・Facebook・Instagram の中のブラウザを見分ける', () => {
    expect(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/13.1.0')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/400.0]')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) Instagram 300.0')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe(false);
  });
  it('作り直し中の鍵（pending）も読む。形が違えば捨てる', () => {
    const base = { v: 1, secret: SECRET, friendCode: 'AAAABBBB', inboxId: 'i', name: 'アキ' };
    expect(parseIdentity({ ...base, pending: 'cd'.repeat(32) })?.pending).toBe('cd'.repeat(32));
    expect(parseIdentity({ ...base, pending: 'nope' })).toEqual(base);
  });
});
