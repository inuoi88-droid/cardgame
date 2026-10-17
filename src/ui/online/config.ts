/**
 * オンライン対戦のつなぎ先。ここにあるのはブラウザに埋め込む前提の公開してよい値だけ
 * （DB を読み書きする強い鍵は Edge Function の中だけで使う。決定事項 #58）。
 */
export const SUPABASE_URL = 'https://hefydmrqrdumpifbqlfp.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_qK8Kaict2u9sttUfYd0Zqw_3cPmvpZt';
/** DB と同じ東京で動かす（遠い地域で動くと、DB とのやりとりのたびに往復が増えて遅くなる） */
export const FUNCTION_REGION = 'ap-northeast-1';
export const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/cardgame?forceFunctionRegion=${FUNCTION_REGION}`;

/** 状態を取りに行く間隔（接続中の目印も兼ねる）。通知が届かなくても、この間隔で最新になる */
export const POLL_MS = 4000;
/** 締め切りを過ぎてから、時間切れの処理を頼みに行くまでの間 */
export const DEADLINE_GRACE_MS = 800;
/** 残り時間がこの秒数以下になったら目立たせる */
export const WARN_SECONDS = 15;
