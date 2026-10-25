/**
 * BGM の台帳（決定事項 #128）。曲はユーザーが試聴して選んだ7曲で、ファイルは public/bgm/<BGM_STAMP>/<id>.mp3
 * （ふつうの版は同じサイトから、1ファイル版は公開サイトから読む：bgmSource.ts）。中身を変えたら BGM_STAMP を上げる（古いキャッシュを使わない）。
 *
 * - 場面ごとの曲は BGM_SCENES。対戦は4曲を順不同で流す（ユーザーの決定：通常と接戦で分けない）
 * - ループ曲（loop あり）は前後に1秒の「のりしろ」（ループの終わり1秒・始め1秒の写し）を付けてあり、loop.start〜loop.end をくり返す。
 *   MP3 の頭の無音をブラウザが削っても削らなくても、継ぎ目の前後は同じ中身なのでずれない
 * - ループでない曲は最後まで流し、少し間をあけて次の曲（同じ場面の曲が1つならもう一度）
 * - 音量はどの曲も -18 LUFS 前後にそろえてある（真のピーク -1.5 dBTP 以下。出典と加工は bgm.manifest.json）
 */
export type BgmScene = 'lobby' | 'deck' | 'draft' | 'battle';

export const BGM_SCENE_LABEL: Record<BgmScene, string> = {
  lobby: 'ロビー・メニュー',
  deck: 'カード・デッキ作り',
  draft: 'ドラフト',
  battle: '対戦',
};

/** public/bgm/<BGM_STAMP>/ */
export const BGM_STAMP = '1';

export type BgmLicense = 'CC0 1.0' | 'CC BY 3.0';

export interface BgmTrack {
  id: string;
  title: string;
  author: string;
  license: BgmLicense;
  /** 出典（OpenGameArt のページ） */
  url: string;
  /** ファイル全体の長さ（秒） */
  duration: number;
  /** ループ曲：くり返す区間（秒。ファイルの時刻）。無ければ最後まで流す */
  loop?: { start: number; end: number };
}

export const BGM_TRACKS: readonly BgmTrack[] = [
  {
    id: 'old-tower-inn',
    title: 'Medieval: The Old Tower Inn',
    author: 'RandomMind',
    license: 'CC0 1.0',
    url: 'https://opengameart.org/content/medieval-the-old-tower-inn',
    duration: 51.951,
    loop: { start: 1, end: 1 + 2202856 / 44100 },
  },
  {
    id: 'exploration',
    title: 'Medieval: Exploration',
    author: 'RandomMind',
    license: 'CC0 1.0',
    url: 'https://opengameart.org/content/medieval-exploration',
    duration: 234.913,
  },
  {
    id: 'bards-tale',
    title: "Medieval: The Bard's Tale",
    author: 'RandomMind',
    license: 'CC0 1.0',
    url: 'https://opengameart.org/content/medieval-the-bards-tale',
    duration: 59.73,
    loop: { start: 1, end: 1 + 2545887 / 44100 },
  },
  {
    id: 'dark-descent',
    title: 'Dark Descent',
    author: 'Matthew Pablo',
    license: 'CC BY 3.0',
    url: 'https://opengameart.org/content/dark-descent',
    duration: 79.754,
  },
  {
    id: 'medieval-battle',
    title: 'Medieval: Battle',
    author: 'RandomMind',
    license: 'CC0 1.0',
    url: 'https://opengameart.org/content/medieval-battle',
    duration: 74.586,
  },
  {
    id: 'epic-boss-battle',
    title: 'Epic Boss Battle',
    author: 'Juhani Junkala（SubspaceAudio）',
    license: 'CC0 1.0',
    url: 'https://opengameart.org/content/boss-battle-music',
    duration: 125.429,
    loop: { start: 1, end: 1 + 5443201 / 44100 },
  },
  {
    id: 'final-battle',
    title: 'The Final Battle',
    author: 'skrjablin',
    license: 'CC0 1.0',
    url: 'https://opengameart.org/content/the-final-battle',
    duration: 145.821,
  },
];

/** 場面ごとに流す曲（2曲以上なら、続けて同じ曲にならないように順不同で） */
export const BGM_SCENES: Record<BgmScene, readonly string[]> = {
  lobby: ['old-tower-inn'],
  deck: ['exploration'],
  draft: ['bards-tale'],
  battle: ['dark-descent', 'medieval-battle', 'epic-boss-battle', 'final-battle'],
};

export const LICENSE_URL: Record<BgmLicense, string> = {
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/deed.ja',
  'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/deed.ja',
};

export function bgmTrack(id: string): BgmTrack | undefined {
  return BGM_TRACKS.find((t) => t.id === id);
}

/** 次に流す曲：場面の曲から、直前の曲を避けて選ぶ（1曲ならそれ）。rand は 0 以上 1 未満 */
export function pickTrack(pool: readonly string[], last: string | null, rand: () => number): string {
  const choices = pool.length > 1 && last !== null && pool.includes(last) ? pool.filter((id) => id !== last) : pool;
  return choices[Math.min(choices.length - 1, Math.floor(rand() * choices.length))]!;
}
