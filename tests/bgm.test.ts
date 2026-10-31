// BGM（決定事項 #128）：曲のファイルと台帳・場面の決め方・曲の選び方・設定（既定はオフ）・1ファイル版と公開サイトの読み方・クレジット
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BGM_SCENES, BGM_STAMP, BGM_TRACKS, bgmTrack, pickTrack, type BgmScene } from '../src/ui/sound/bgmCatalog.ts';
import { effectiveScene, sceneForPage } from '../src/ui/sound/bgmScene.ts';
import { bgmUrl } from '../src/ui/sound/bgmSource.ts';
import { bgmUrl as singleUrl, BGM_REMOTE } from '../src/ui/sound/bgmSource.single.ts';
import { DEFAULT_MUSIC_PREF, DEFAULT_SOUND_PREF, getMusicPref, MUSIC_PREF_KEY, parseSoundPrefText, SOUND_PREF_KEY } from '../src/ui/sound/settings.ts';
import { PUBLIC_APP_URL } from '../src/ui/online/config.ts';

const ROOT = join(__dirname, '..');
const DIR = join(ROOT, 'public', 'bgm', BGM_STAMP);
const manifest = JSON.parse(readFileSync(join(ROOT, 'src/ui/sound/bgm.manifest.json'), 'utf8')) as {
  tracks: { id: string; license: string; page: string; kind: string; duration: number; bytes: number; loop?: { start: number; end: number; startFrame: number; lengthFrames: number }; loudness: { I: number; TP: number } }[];
};

describe('BGM のファイル', () => {
  it('台帳の曲がすべて public/bgm/<stamp>/<id>.mp3 にあり、余分なファイルも無い', () => {
    const files = readdirSync(DIR)
      .filter((f) => f.endsWith('.mp3'))
      .map((f) => f.slice(0, -4))
      .sort();
    expect(files).toEqual(BGM_TRACKS.map((t) => t.id).sort());
    let total = 0;
    for (const t of BGM_TRACKS) {
      const buf = readFileSync(join(DIR, `${t.id}.mp3`));
      total += buf.length;
      // MP3（ID3 かフレームの同期）
      expect(buf[0] === 0x49 || (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0), t.id).toBe(true);
      // 112kbps の長さの見込みと合う（±10%）
      expect(buf.length / ((t.duration * 112_000) / 8), t.id).toBeGreaterThan(0.9);
      expect(buf.length / ((t.duration * 112_000) / 8), t.id).toBeLessThan(1.1);
    }
    // 合わせて 12MB 未満（1ファイル版には入れない。ふつうの版でも流す曲だけを読む）
    expect(total).toBeLessThan(12 * 1024 * 1024);
  });

  it('台帳と bgm.manifest.json（加工の記録）が食い違わない', () => {
    expect(manifest.tracks.map((t) => t.id).sort()).toEqual(BGM_TRACKS.map((t) => t.id).sort());
    for (const m of manifest.tracks) {
      const t = bgmTrack(m.id)!;
      expect(t.license, m.id).toBe(m.license);
      expect(t.url, m.id).toBe(m.page);
      expect(Math.abs(t.duration - m.duration), m.id).toBeLessThan(0.01);
      expect(m.bytes, m.id).toBe(statSync(join(DIR, `${m.id}.mp3`)).size);
      expect(!!t.loop, m.id).toBe(m.kind === 'loop');
      // 音量は -18 LUFS 前後（ピークで頭打ちの曲は少し小さい）・真のピークは -1 dBTP 未満
      expect(m.loudness.I, m.id).toBeGreaterThan(-21);
      expect(m.loudness.I, m.id).toBeLessThan(-17.5);
      expect(m.loudness.TP, m.id).toBeLessThan(-1);
      if (t.loop && m.loop) {
        expect(t.loop.start, m.id).toBeCloseTo(m.loop.startFrame / 44100, 6);
        expect(t.loop.end, m.id).toBeCloseTo((m.loop.startFrame + m.loop.lengthFrames) / 44100, 6);
      }
    }
  });

  it('ループ曲は前後に1秒ずつのりしろがあり、くり返す区間はファイルの中', () => {
    for (const t of BGM_TRACKS) {
      if (!t.loop) continue;
      expect(t.loop.start, t.id).toBeCloseTo(1, 6);
      expect(t.duration - t.loop.end, t.id).toBeGreaterThan(0.99);
      expect(t.loop.end - t.loop.start, t.id).toBeGreaterThan(30);
    }
  });

  it('ライセンスは CC0 か CC BY 3.0 だけ。CC BY の曲はクレジット（画面と docs/CREDITS.md）に作者・題名・出典がある', () => {
    const credits = readFileSync(join(ROOT, 'docs/CREDITS.md'), 'utf8');
    const page = readFileSync(join(ROOT, 'src/ui/pages/CreditsPage.tsx'), 'utf8');
    expect(page).toContain('BGM_TRACKS.map');
    for (const t of BGM_TRACKS) {
      expect(['CC0 1.0', 'CC BY 3.0'], t.id).toContain(t.license);
      expect(credits, t.id).toContain(t.url);
      if (t.license === 'CC BY 3.0') {
        expect(credits).toContain(`"${t.title}" by ${t.author}`);
        expect(credits).toContain('https://creativecommons.org/licenses/by/3.0/');
      }
    }
  });
});

describe('場面と曲', () => {
  it('どの場面にも曲があり、台帳にある曲だけ。どの曲もどこかの場面で流れる', () => {
    const used = new Set<string>();
    for (const [scene, pool] of Object.entries(BGM_SCENES)) {
      expect(pool.length, scene).toBeGreaterThan(0);
      for (const id of pool) {
        expect(bgmTrack(id), `${scene}: ${id}`).toBeDefined();
        used.add(id);
      }
    }
    expect([...used].sort()).toEqual(BGM_TRACKS.map((t) => t.id).sort());
    // ユーザーの選んだ曲（ロビー A・デッキ B・ドラフト A・対戦は D と C とボス用の2曲を分けずに）
    expect(BGM_SCENES.lobby).toEqual(['old-tower-inn']);
    expect(BGM_SCENES.deck).toEqual(['exploration']);
    expect(BGM_SCENES.draft).toEqual(['bards-tale']);
    expect([...BGM_SCENES.battle].sort()).toEqual(['dark-descent', 'epic-boss-battle', 'final-battle', 'medieval-battle']);
  });

  it('画面から土台の場面が決まる（カード・デッキ作り／ドラフト／ほかはロビー。対戦の曲は盤面が上書きする）', () => {
    // router.ts の Route['page']
    const expected: Record<string, BgmScene> = {
      cards: 'deck',
      cardEdit: 'deck',
      decks: 'deck',
      deckEdit: 'deck',
      official: 'deck',
      officialEdit: 'deck',
      plaza: 'deck',
      presets: 'deck',
      presetEdit: 'deck',
      presetCard: 'deck',
      battleSetup: 'lobby',
      draft: 'draft',
      battle: 'lobby',
      online: 'lobby',
      onlineBattle: 'lobby',
      friendLink: 'lobby',
      rules: 'lobby',
      credits: 'lobby',
      news: 'lobby',
      uiKit: 'lobby',
    };
    for (const [page, scene] of Object.entries(expected)) expect(sceneForPage(page), page).toBe(scene);
    // 画面の一覧（router.ts）と食い違わない
    const pages = [...readFileSync(join(ROOT, 'src/ui/router.ts'), 'utf8').matchAll(/\{ page: '(\w+)'/g)].map((m) => m[1]!);
    expect([...new Set(pages)].sort()).toEqual(Object.keys(expected).sort());
  });

  it('上書きは後から登録したものが勝ち、null は「流さない」', () => {
    expect(effectiveScene('lobby', [])).toBe('lobby');
    expect(effectiveScene('lobby', [{ scene: 'battle' }])).toBe('battle');
    expect(effectiveScene('lobby', [{ scene: 'draft' }, { scene: null }])).toBe(null);
    expect(effectiveScene(null, [{ scene: 'draft' }])).toBe('draft');
  });

  it('対戦の曲は直前の曲を続けて選ばない（1曲だけの場面はいつもその曲）', () => {
    const pool = BGM_SCENES.battle;
    for (const last of pool) {
      for (let i = 0; i < 20; i++) {
        const r = i / 20;
        const id = pickTrack(pool, last, () => r);
        expect(id).not.toBe(last);
        expect(pool).toContain(id);
      }
    }
    // どの曲も選ばれうる
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(pickTrack(pool, null, () => i / 40));
    expect([...seen].sort()).toEqual([...pool].sort());
    expect(pickTrack(['only'], 'only', () => 0.99)).toBe('only');
    expect(pickTrack(pool, 'unknown', () => 0.999)).toBe(pool[pool.length - 1]);
  });
});

describe('設定と読み方', () => {
  it('BGM は効果音と別のキーで、既定はオフ', () => {
    expect(MUSIC_PREF_KEY).toBe('cardgame.v1.bgm');
    expect(MUSIC_PREF_KEY).not.toBe(SOUND_PREF_KEY);
    expect(DEFAULT_MUSIC_PREF.on).toBe(false);
    expect(getMusicPref().on).toBe(false);
    expect(parseSoundPrefText(null, DEFAULT_MUSIC_PREF)).toEqual(DEFAULT_MUSIC_PREF);
    expect(parseSoundPrefText('{"on":true,"volume":0.35}', DEFAULT_MUSIC_PREF)).toEqual({ on: true, volume: 0.35 });
    expect(parseSoundPrefText('{"on":"yes"}', DEFAULT_MUSIC_PREF)).toEqual({ on: false, volume: DEFAULT_MUSIC_PREF.volume });
    expect(parseSoundPrefText('壊れた', DEFAULT_MUSIC_PREF)).toEqual(DEFAULT_MUSIC_PREF);
    // 効果音の読み方は変わらない
    expect(parseSoundPrefText(null)).toEqual(DEFAULT_SOUND_PREF);
  });

  it('ふつうの版は同じサイトの public/bgm から、1ファイル版は公開サイトの同じ場所から読む', () => {
    expect(bgmUrl('dark-descent')).toBe(`bgm/${BGM_STAMP}/dark-descent.mp3`);
    expect(singleUrl('dark-descent')).toBe(`${PUBLIC_APP_URL}bgm/${BGM_STAMP}/dark-descent.mp3`);
    expect(BGM_REMOTE).toBe(true);
    // 1ファイル版の差し替え（vite.config.ts）と、公開サイトが file:// からの読み込みを許す（vercel.json）
    expect(readFileSync(join(ROOT, 'vite.config.ts'), 'utf8')).toContain("find: './bgmSource.ts'");
    const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
    const rule = vercel.headers.find((h) => h.source === '/bgm/:stamp/:file');
    expect(rule?.headers).toContainEqual({ key: 'Access-Control-Allow-Origin', value: '*' });
  });

  it('場面の名前はどれも台帳にある', () => {
    const scenes: BgmScene[] = ['lobby', 'deck', 'draft', 'battle'];
    expect(Object.keys(BGM_SCENES).sort()).toEqual([...scenes].sort());
  });
});
