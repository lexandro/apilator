// jsdom has no matchMedia, and settingsStore reads it at module scope.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// Node ships inert localStorage/sessionStorage globals that shadow jsdom's working
// implementation, so anything reading them gets an object with no setItem. Replace them
// with a real in-memory Storage when that happens.
function createMemoryStorage(): Storage {
  const entries = new Map<string, string>();

  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, String(value)),
    removeItem: (key: string) => void entries.delete(key),
    clear: () => entries.clear(),
  } as Storage;
}

if (typeof window !== 'undefined') {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    if (typeof window[name]?.setItem !== 'function') {
      Object.defineProperty(window, name, {
        value: createMemoryStorage(),
        configurable: true,
        writable: true,
      });
    }
  }
}
