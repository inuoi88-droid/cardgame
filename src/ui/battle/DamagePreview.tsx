/**
 * ダメージの見込みの札（決定事項 #137）：ドラッグ中に落とし先の上で、離したら起きること（減る HP・聖盾・シールド・守備力・やけど・脱力・
 * 倒せるか・受ける反撃）を、ダメージを受けるものの上に出す。位置は [data-fx]（モンスターは uid、プレイヤーは me / opp）の矩形。
 * 数字はエンジンの previewAction（実際の解決と同じ計算）。pointer-events: none
 */
import type { battle } from '../../engine/index.ts';
import { cx } from '../util.ts';
import { hitTexts } from './damagePreview.ts';

/** 札の中心を画面の端から離す（横にはみ出さないように） */
const EDGE = 64;

export function DamagePreview({
  preview,
  me,
  isMine,
  rootRef,
}: {
  preview: battle.ActionPreview | null;
  me: battle.PlayerId;
  /** 自分のもの（自分・自分のモンスター）か：反撃・自傷の札は色を変える */
  isMine: (t: battle.TargetRef) => boolean;
  rootRef: React.RefObject<HTMLElement | null>;
}) {
  const root = rootRef.current;
  if (!preview || !root) return null;
  return (
    <div className="dmg-preview" aria-hidden="true">
      {preview.hits.map((h) => {
        const fx = h.target.kind === 'player' ? (h.target.player === me ? 'me' : 'opp') : h.target.uid;
        const el = root.querySelector<HTMLElement>(`[data-fx="${CSS.escape(fx)}"]`);
        const r = el?.getBoundingClientRect();
        if (!r || (r.width === 0 && r.height === 0)) return null;
        const t = hitTexts(h);
        const mine = isMine(h.target);
        const x = Math.max(EDGE, Math.min(window.innerWidth - EDGE, r.left + r.width / 2));
        // 相手側は上の辺に、自分側（反撃・自傷）は下の辺に出す（攻撃の矢印と相手の札に重ねない）
        const y = mine ? Math.min(window.innerHeight - 4, r.bottom - 4) : Math.max(4, r.top + 4);
        return (
          <div key={fx} className={cx('dmg-tag', mine && 'is-mine', t.kill && 'is-kill', t.none && 'is-none')} style={{ left: x, top: y }}>
            <b className="dmg-tag__num">{t.num}</b>
            <span className="dmg-tag__hp">{t.hp}</span>
            {t.notes.map((n) => (
              <span key={n} className="dmg-tag__why">
                {n}
              </span>
            ))}
          </div>
        );
      })}
      {preview.ends && (
        <div className={cx('dmg-preview__end', preview.ends.winner !== me && 'is-lose')}>
          {preview.ends.winner === me ? 'この一手で勝ち' : preview.ends.winner === null ? 'この一手で引き分け' : 'この一手で負け'}
        </div>
      )}
    </div>
  );
}
