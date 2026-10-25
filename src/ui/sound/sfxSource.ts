/**
 * 効果音のファイルの読み方：ふつうの版（決定事項 #127）。sfx/*.mp3 は Vite がハッシュ付きのファイルにする（JS に埋め込まない：
 * vite.config.ts の assetsInlineLimit）。ここには URL の表だけが入り、音は鳴らすときに1つずつ fetch する。
 * このファイルは効果音をオンにしてから読む塊（player.ts）にだけ入る。
 * 1ファイル版（vite build --mode single）では sfxSource.single.ts に差し替わる（HTML に埋め込んだ base64 から読む）。
 */
const URLS = import.meta.glob<string>('./sfx/*.mp3', { query: '?url', import: 'default', eager: true });

const byId = new Map(Object.entries(URLS).map(([path, url]) => [path.slice('./sfx/'.length, -'.mp3'.length), url]));

/** 音のファイルの中身（無ければ null） */
export async function loadSfx(id: string): Promise<ArrayBuffer | null> {
  const url = byId.get(id);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sfx ${id}: ${res.status}`);
  return res.arrayBuffer();
}
