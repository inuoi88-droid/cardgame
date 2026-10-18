// 多くのテストは倍率1（元の仕様の数字）で動かす。ルールの確認はこれで足りる。
// 実際の倍率での確認は tests/**/*.real.test.ts（このファイルを読まない）で行う。決定事項 #67
import { vi } from 'vitest';

vi.mock('../../src/engine/scale.ts', () => ({ SCALE: 1 }));
