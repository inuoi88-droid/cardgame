/** ハッシュ（#/cards など）で画面を切り替える */
import { useEffect, useState } from 'react';

export type Route =
  | { page: 'cards' }
  | { page: 'cardEdit'; id: string | null }
  | { page: 'decks' }
  | { page: 'deckEdit'; id: string | null };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [section, id] = parts;
  if (section === 'decks') {
    if (id === undefined) return { page: 'decks' };
    return { page: 'deckEdit', id: id === 'new' ? null : id };
  }
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
