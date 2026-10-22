// カードの絵の読み込み（src/ui/icons/load.ts。決定事項 #106）：読めなかった絵は 'error' になり、あとで読み直して描ける
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchIconPath = vi.fn<(name: string) => Promise<string | null>>();
vi.mock('../src/ui/icons/iconSource.ts', () => ({
  fetchIconPath: (name: string) => fetchIconPath(name),
  fetchIconIndex: () => Promise.resolve({ names: [], ja: {} }),
}));

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('読み込みの失敗と読み直し', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    fetchIconPath.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('通信に失敗すると error、数秒後に読み直して形が入る', async () => {
    const { peekIconPath, preloadIcons } = await import('../src/ui/icons/load.ts');
    fetchIconPath.mockRejectedValueOnce(new Error('offline')).mockResolvedValue('M0 0h10v10z');
    expect(peekIconPath('dragon-head')).toBe('loading');
    preloadIcons(['gi:dragon-head', '🔥', 'gi:<bad>']);
    await flush();
    expect(peekIconPath('dragon-head')).toBe('error');
    expect(fetchIconPath).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    expect(peekIconPath('dragon-head')).toBe('M0 0h10v10z');
    expect(fetchIconPath).toHaveBeenCalledTimes(2);
  });

  it('無い名前は null（「？」）。読み直さない', async () => {
    const { peekIconPath, preloadIcons } = await import('../src/ui/icons/load.ts');
    fetchIconPath.mockResolvedValue(null);
    preloadIcons(['gi:no-such-icon']);
    await flush();
    expect(peekIconPath('no-such-icon')).toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchIconPath).toHaveBeenCalledTimes(1);
  });

  it('同時に読むのは8本まで。残りは前のものが終わってから', async () => {
    const { preloadIcons } = await import('../src/ui/icons/load.ts');
    const resolvers: (() => void)[] = [];
    fetchIconPath.mockImplementation(() => new Promise((r) => resolvers.push(() => r('M0 0z'))));
    preloadIcons(Array.from({ length: 20 }, (_, i) => `gi:icon-${i}`));
    await flush();
    expect(fetchIconPath).toHaveBeenCalledTimes(8);
    resolvers.splice(0, 3).forEach((f) => f());
    await flush();
    expect(fetchIconPath).toHaveBeenCalledTimes(11);
  });
});
