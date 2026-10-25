/**
 * 効果音のファイルの読み方：1ファイル版（npm run build:single。決定事項 #127）。
 * file:// では fetch できないので、scripts/build-single.mjs が sfx/*.mp3 を base64 にして
 * HTML に `<script type="text/plain" id="sfx-<ID>">` として埋め込む（JS としては解析されない）。鳴らすときに1つずつ読んで戻す。
 * JS は埋め込んだデータより前に async で動き出すので、文書を読み終わる（DOMContentLoaded）まで待ってから読む。
 */
const parsed: Promise<void> =
  typeof document === 'undefined' || document.readyState !== 'loading'
    ? Promise.resolve()
    : new Promise((resolve) => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));

export async function loadSfx(id: string): Promise<ArrayBuffer | null> {
  await parsed;
  const text = document.getElementById(`sfx-${id}`)?.textContent?.trim();
  if (!text) return null;
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
