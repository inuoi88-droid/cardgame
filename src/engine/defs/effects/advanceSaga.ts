import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';
import { chapterOf } from '../../options.ts';
import type { EffectRuntime, PowerInst } from '../../battle/types.ts';

const B = BALANCE.effects.advanceSaga;

/** まだ最後の章まで進んでいない自分の英雄譚 */
function sagas(rt: EffectRuntime): PowerInst[] {
  return rt.player(rt.controller).powers.filter((pw) => {
    if (pw.chapter === undefined) return false;
    const last = Math.max(0, ...(rt.cardDef(pw.cardId)?.effects ?? []).map((e) => chapterOf(e.timing)));
    return pw.chapter < last;
  });
}

// 章を進める：MTG #157（伝承カウンター）。自分の英雄譚1つを次の章に進め、その章の効果を出す
export default defineEffect({
  id: 'advanceSaga',
  name: '章を進める',
  group: 'resource',
  order: 74.4,
  summary: '自分の英雄譚1つを次の章に進め、その章の効果を出す（2つ以上あれば選ぶ。最後の章まで進めると英雄譚は終わる。英雄譚が無ければ不発）',
  targetRule: 'self',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => '自分の英雄譚1つを次の章に進める',
  battle: {
    choose(rt) {
      const list = sagas(rt);
      if (list.length === 0) return null;
      return {
        prompt: '次の章に進める英雄譚を選んでください',
        options: list.map((pw) => ({ id: pw.uid, label: `${pw.name}（第${pw.chapter}章）`, cardId: pw.cardId })),
        min: 1,
        max: 1,
      };
    },
    resolve(rt, _e, picks) {
      const list = sagas(rt);
      const uid = picks?.[0] ?? list[0]?.uid;
      if (!uid) {
        rt.log('進められる英雄譚がない');
        return;
      }
      rt.advanceSaga(rt.controller, uid);
    },
  },
});
