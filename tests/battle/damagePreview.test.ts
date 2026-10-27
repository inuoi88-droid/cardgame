// ダメージの見込みの札の言葉（決定事項 #138）
import { describe, expect, it } from 'vitest';
import type { battle } from '../../src/engine/index.ts';
import { hitTexts } from '../../src/ui/battle/damagePreview.ts';

const hit = (over: Partial<battle.PreviewHit>): battle.PreviewHit => ({
  target: { kind: 'monster', uid: 'm1' },
  hpLost: 0,
  hpBefore: 100,
  hpAfter: 100,
  dealt: 0,
  shieldUsed: 0,
  blocked: [],
  steps: [],
  destroyed: false,
  random: false,
  statuses: [],
  ...over,
});

describe('hitTexts', () => {
  it('減る体力と、守備力・やけど・脱力の理由', () => {
    const t = hitTexts(hit({ hpLost: 60, hpAfter: 40, dealt: 60, steps: ['やけどで100 → 脱力で100 → 守備力−40で60'] }));
    expect(t.num).toBe('−60');
    expect(t.hp).toBe('体力 100→40');
    expect(t.notes).toEqual(['やけどで3分の2', '脱力で100まで', '守備力−40']);
    expect(t.kill).toBe(false);
  });
  it('聖盾で0・倒せる・プレイヤーのシールド・ランダム', () => {
    expect(hitTexts(hit({ blocked: ['divineShield'] }))).toMatchObject({ num: '−0', notes: ['聖盾で0'], none: true });
    expect(hitTexts(hit({ hpLost: 100, hpAfter: 0, destroyed: true }))).toMatchObject({ num: '−100', hp: '倒せる', kill: true });
    expect(hitTexts(hit({ hpLost: 0, destroyed: true }))).toMatchObject({ num: '破壊' });
    const p = hitTexts(hit({ target: { kind: 'player', player: 1 }, hpBefore: 120, hpAfter: 100, hpLost: 20, shieldUsed: 40 }));
    expect(p).toMatchObject({ num: '−20', hp: 'HP 120→100', notes: ['シールドが40防ぐ'] });
    expect(hitTexts(hit({ random: true, hpLost: 20 }))).toMatchObject({ num: '？', notes: ['ランダム'] });
    // 状態異常：ダメージと一緒なら理由に、それだけなら大きく
    expect(hitTexts(hit({ hpLost: 20, dealt: 20, hpAfter: 80, statuses: [{ status: 'poison', amount: 20 }] })).notes).toEqual(['毒+20']);
    expect(hitTexts(hit({ statuses: [{ status: 'weak', amount: 2 }] }))).toMatchObject({ num: '脱力+2', none: false });
  });
});
