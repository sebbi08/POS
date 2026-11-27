/** A controllable `prefers-color-scheme: dark` media query for theme tests. */
export function fakeMatchMedia(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    get matches() { return dark; },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  };
  window.matchMedia = (() => mql) as unknown as typeof window.matchMedia;
  return {
    setSystemDark(next: boolean) {
      dark = next;
      listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.size,
  };
}
