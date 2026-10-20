import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';
import { getKeyword } from '../../registry.ts';
import type { TargetRef } from '../../battle/types.ts';

const B = BALANCE.effects.backup;
/** 賛助で与えないキーワード（使い切り・手札に戻るもの） */
const SKIP = new Set(['doubleTeam', 'hitAndRun']);

// 賛助：MTG #373。召喚時、自分の他のモンスター1体の攻撃力と体力+N。さらにこのターンだけ、このモンスターのキーワードを与える
export default defineEffect({
  id: 'backup',
  name: '賛助',
  group: 'buff',
  order: 74.8,
  summary: '召喚時、自分の他のモンスター1体の攻撃力と体力+N（永続）。さらにこのターンだけ、このモンスターのキーワード（数値のないもの。分身・一撃離脱を除く）を与える（モンスターの召喚時だけ）',
  value: valueParam('上昇量', { default: 1, max: B.maxValue }),
  targetRule: 'allyMonsterOne',
  bases: ['monster'],
  timings: ['summon'],
  excludeTargets: ['thisMonster', 'allyMonsters', 'weakestAlly', 'tribeAllies', 'otherAllies'],
  notSelfAlly: true,
  basePoints: (e) => B.perValue * n(e) + B.base,
  baseFormula: (e) => `${n(e)}×${B.perValue}+${B.base}`,
  describe: (e, c) => `${c.target === 'ランダムな自分のモンスター1体' ? 'ランダムな自分の他のモンスター1体' : '自分の他のモンスター1体'}の攻撃力と体力を+${n(e)}し、このターンこのモンスターのキーワードを与える`,
  battle: {
    resolve(rt, e) {
      const self = rt.src.kind === 'monster' ? rt.monster({ kind: 'monster', uid: rt.src.uid }) : undefined;
      let targets = rt.targets.filter((t) => !(t.kind === 'monster' && t.uid === rt.src.uid));
      // ランダムで自分自身に当たったら、他のモンスターから選び直す
      if (targets.length === 0 && rt.targets.length > 0 && e.target === 'random') {
        const others = rt.player(rt.controller).board.filter((m) => m.uid !== rt.src.uid);
        const m = others[rt.randInt(others.length)];
        if (m) targets = [{ kind: 'monster', uid: m.uid } as TargetRef];
      }
      if (targets.length === 0) {
        rt.log('自分の他のモンスターがいないので何も起きない');
        return;
      }
      const ids: string[] = [];
      if (self && !self.sealed) {
        const lost = self.card.lostKeywords ?? [];
        const printed = (rt.cardDef(self.card.cardId)?.keywords ?? []).map((k) => k.id).filter((id) => !lost.includes(id));
        for (const id of [...printed, ...(self.granted ?? [])]) {
          if (SKIP.has(id) || ids.includes(id)) continue;
          const kd = getKeyword(id);
          if (kd && !kd.value) ids.push(id);
        }
      }
      for (const t of targets) {
        rt.changeStats(t, n(e), n(e));
        if (ids.length > 0) rt.tempGrant(t, ids);
      }
    },
  },
});
