export type RouteType = { name: 'home' } | { name: 'player'; code: string };

const PLAYER_PATTERN = /^\/r\/([^/]+)\/?$/;

/** Maps a pathname to a route. `/r/:code` is the player; everything else is home. */
export function parseRoute(pathname: string): RouteType {
  const code = PLAYER_PATTERN.exec(pathname)?.[1];
  if (code !== undefined && code.length > 0) {
    return { name: 'player', code: decodeURIComponent(code) };
  }
  return { name: 'home' };
}

/** Pushes a new path and notifies listeners (History API; no router library). */
export function navigate(path: string): void {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function onNavigate(handler: () => void): () => void {
  window.addEventListener('popstate', handler);
  return (): void => {
    window.removeEventListener('popstate', handler);
  };
}

/** The local-mode access code, read from the URL fragment `#k=CODE`. */
export function codeFromHash(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  return new URLSearchParams(hash).get('k');
}
