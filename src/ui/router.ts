/** ハッシュ（#/cards など）で画面を切り替える */
import { useEffect, useState } from 'react';

export type Route =
  | { page: 'cards' }
  | { page: 'cardEdit'; id: string | null }
  | { page: 'decks' }
  | { page: 'deckEdit'; id: string | null }
  | { page: 'battleSetup' }
  | { page: 'battle' }
  | { page: 'draft' }
  | { page: 'official' }
  | { page: 'online'; code: string | null; tab?: 'friends' }
  /** 招待リンク（#/friend/<フレンドコード>/<鍵>/<名前>。決定事項 #123） */
  | { page: 'friendLink'; parts: string[] }
  | { page: 'onlineBattle' }
  | { page: 'rules'; section: string | null }
  | { page: 'credits' }
  /** 更新情報（パッチノート。決定事項 #131） */
  | { page: 'news' }
  | { page: 'uiKit' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [section, id, extra] = parts;
  if (section === 'online') {
    if (id === 'play') return { page: 'onlineBattle' };
    if (id === 'friends') return { page: 'online', code: null, tab: 'friends' };
    return { page: 'online', code: id === 'join' && extra ? extra : null };
  }
  if (section === 'friend') return { page: 'friendLink', parts: parts.slice(1) };
  if (section === 'battle') return id === 'play' ? { page: 'battle' } : id === 'draft' ? { page: 'draft' } : { page: 'battleSetup' };
  if (section === 'decks') {
    if (id === undefined) return { page: 'decks' };
    return { page: 'deckEdit', id: id === 'new' ? null : id };
  }
  if (section === 'rules') return { page: 'rules', section: id ?? null };
  if (section === 'ui-kit') return { page: 'uiKit' };
  if (section === 'credits') return { page: 'credits' };
  if (section === 'news') return { page: 'news' };
  if (section === 'official') return { page: 'official' };
  if (section === 'cards' && id !== undefined) return { page: 'cardEdit', id: id === 'new' ? null : id };
  return { page: 'cards' };
}

export function navigate(path: string): void {
  window.location.hash = path;
}

/**
 * 画面を離れる前の確認（未保存の編集があるときなど）。
 * 登録しておくと、ハッシュが変わったときに一度元に戻してから guard を呼び、true が返ったら改めて移動する。
 * 画面側は編集中だけ登録し、離れるとき（アンマウント・保存後）は null で外す。
 */
export type NavigationGuard = (to: string) => Promise<boolean>;
let guard: NavigationGuard | null = null;
let currentHash = window.location.hash;
let ignoreNextChange = false;

export function setNavigationGuard(g: NavigationGuard | null): void {
  guard = g;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      if (ignoreNextChange) {
        ignoreNextChange = false;
        return;
      }
      const next = window.location.hash;
      if (guard && next !== currentHash) {
        const ask = guard;
        ignoreNextChange = true;
        window.location.hash = currentHash;
        void ask(next).then((ok) => {
          if (!ok) return;
          guard = null;
          window.location.hash = next;
        });
        return;
      }
      currentHash = next;
      setRoute(parseRoute(next));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
