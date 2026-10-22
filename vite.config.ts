import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// mode 'single'（npm run build:single）：ダブルクリックで開く1ファイル版のために、動的に読む部分（カードの絵のシャード・選択パネルなど）も
// 1つの JS にまとめる（決定事項 #105。ふつうのビルドではシャードは public/icons から必要な分だけ fetch する）
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: './',
  build: mode === 'single' ? { rolldownOptions: { output: { codeSplitting: false } }, chunkSizeWarningLimit: 20_000, copyPublicDir: false } : undefined,
  // 1ファイル版はアイコンの形を fetch できない（file://）ので、JS に入れる読み方に差し替える
  resolve:
    mode === 'single'
      ? { alias: [{ find: './shardSource.ts', replacement: fileURLToPath(new URL('./src/ui/icons/shardSource.single.ts', import.meta.url)) }] }
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
