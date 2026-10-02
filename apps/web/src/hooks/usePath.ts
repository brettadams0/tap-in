import { useEffect, useState } from 'react';

/** Tiny router: the app only has "/", "/:code" and "/sync-test". */
export function usePath(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = (): void => {
      setPath(location.pathname);
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, []);
  return path;
}

export function navigate(to: string, replace = false): void {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
