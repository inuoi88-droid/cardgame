import { defineConfig } from 'vitest/config';
import type { HtmlTagDescriptor, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// 見出し用の明朝（src/ui/theme/fonts/ui-mincho.woff2。決定事項 #111）を先に読み始める <link rel="preload">。
// ファイル名にハッシュが付くので、ビルドの結果から探して index.html に足す（1ファイル版は CSS に埋め込むので何もしない）
function preloadDisplayFont(): Plugin {
  return {
    name: 'preload-display-font',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx): HtmlTagDescriptor[] {
        const asset = Object.values(ctx.bundle ?? {}).find((a) => a.type === 'asset' && /ui-mincho[^/]*\.woff2$/.test(a.fileName));
        if (!asset) return [];
        return [{ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `./${asset.fileName}`, crossorigin: '' }, injectTo: 'head' }];
      },
    },
  };
}

// mode 'single'（npm run build:single）：ダブルクリックで開く1ファイル版のために、動的に読む部分（選択パネルなど）も
// 1つの JS にまとめる。カードの絵の形と索引は JS に入れず、scripts/build-single.mjs が HTML に JSON として埋め込む
// （決定事項 #105・#106。ふつうのビルドでは形は public/icons から1つずつ fetch する）
export default defineConfig(({ mode }) => ({
  plugins: [react(), preloadDisplayFont()],
  base: './',
  // 1ファイル版は書体（woff2）も CSS のデータ URI に埋め込む（ネットなしで開いても見出しの明朝が出る）
  build:
    mode === 'single'
      ? { rolldownOptions: { output: { codeSplitting: false } }, chunkSizeWarningLimit: 20_000, copyPublicDir: false, assetsInlineLimit: 100_000_000 }
      : undefined,
  // 1ファイル版はアイコンの形を fetch できない（file://）ので、HTML に埋め込んだ JSON から読む読み方に差し替える
  resolve:
    mode === 'single'
      ? { alias: [{ find: './iconSource.ts', replacement: fileURLToPath(new URL('./src/ui/icons/iconSource.single.ts', import.meta.url)) }] }
      : undefined,
  test: {
    projects: [
      {
        // 倍率1（元の仕様の数字）で動かすテスト
        extends: true,
        test: {
          name: 'base',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/**/*.real.test.ts'],
          setupFiles: ['tests/setup/base-scale.ts'],
        },
      },
      {
        // 実際のインフレ倍率で動かすテスト
        extends: true,
        test: { name: 'real', include: ['tests/**/*.real.test.ts'] },
      },
    ],
  },
}));
