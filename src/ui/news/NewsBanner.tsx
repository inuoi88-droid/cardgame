/**
 * 新しい更新のお知らせの帯（決定事項 #131）。まだ見ていない更新があるときだけ、画面の上（流れの中）に出す。
 * 「見る」で更新情報（#/news）へ、× で閉じる（どちらも「ここまで見た」になる）。対戦・ドラフトの画面と更新情報の画面には出さない（App）。
 */
import { navigate } from '../router.ts';
import { UiIcon } from '../components/UiIcon.tsx';
import { latestNo, noteDate, unseenNotes } from './newsLogic.ts';
import { markNewsSeen, useNewsSeen } from './newsStore.ts';
import { PATCH_NOTES } from './notes.ts';
import './news.css';

export function NewsBanner() {
  const seen = useNewsSeen();
  const fresh = unseenNotes(PATCH_NOTES, seen);
  const top = fresh[0];
  if (!top) return null;
  const close = () => markNewsSeen(latestNo(PATCH_NOTES));
  return (
    <div className="news-banner" role="status">
      <span className="news-banner__icon" aria-hidden="true">
        <UiIcon name="newspaper" />
      </span>
      <span className="news-banner__text">
        <b>更新しました：{top.title}</b>
        <small>
          {noteDate(top.date)}
          {fresh.length > 1 && `・ほかに${fresh.length - 1}件の更新`}
        </small>
      </span>
      <span className="news-banner__btns">
        <button
          type="button"
          className="btn btn--small"
          // 見たことにするのは更新情報の画面（開いたときに「新着」の札を付けてから印を進める）
          onClick={() => navigate('/news')}
        >
          見る
        </button>
        <button type="button" className="btn btn--small btn--ghost btn--icon" aria-label="お知らせを閉じる" onClick={close}>
          <UiIcon name="cancel" />
        </button>
      </span>
    </div>
  );
}
