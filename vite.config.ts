import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
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
});
