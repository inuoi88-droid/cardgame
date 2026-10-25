/** クリップボードへのコピーと、スマホの共有（Web Share API）。どちらも使えなければ false */

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 下の古いやり方を試す
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** 共有シートを出す。'shared'＝送った／'cancel'＝閉じた／'fail'＝使えない */
export async function shareLink(url: string, text: string): Promise<'shared' | 'cancel' | 'fail'> {
  if (!canShare()) return 'fail';
  try {
    await navigator.share({ title: 'フレンドの招待', text, url });
    return 'shared';
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError' ? 'cancel' : 'fail';
  }
}
