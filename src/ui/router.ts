/** ハッシュ（#/cards など）で画面を切り替える */
import { useEffect, useState } from 'react';

export type Route =
  | { page: 'cards' }
  | { page: 'cardEdit'; id: string | null }
  | { page: 'decks' }
  | { page: 'deckEdit'; id: string | null }
  | { page: 'battleSetup' }
  | { page: 'battle' }
  | { page: 'online'; code: string | null }
  | { page: 'onlineBattle' }
  | { page: 'rules'; section: string | null }
  | { page: 'uiKit' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [section, id, extra] = parts;
  if (section === 'online') {
    if (id === 'play') return { page: 'onlineBattle' };
    return { page: 'online', code: id === 'join' && extra ? extra : null };
  }
  if (section === 'battle') return id === 'play' ? { page: 'battle' } : { page: 'battleSetup' };
  if (section === 'decks') {
    if (id === undefined) return { page: 'decks' };
    return { page: 'deckEdit', id: id === 'new' ? null : id };
  }
  if (section === 'rules') return { page: 'rules', section: id ?? null };
  if (section === 'ui-kit') return { page: 'uiKit' };
  if (section === 'cards' && id !== undefined) return { page: 'cardEdit', id: id === 'new' ? null : id };
  return { page: 'cards' };
}

export function navigate(path: string): void {
  window.location.hash = path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
