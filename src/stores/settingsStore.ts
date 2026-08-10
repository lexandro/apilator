import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ThemeId,
  ThemeMode,
  ThemeSettings,
  ProxySettings,
  ProxyConfigForRequest,
  GeneralSettings,
  CustomProxyConfig,
} from '../domain';
import {
  DEFAULT_THEME_SETTINGS,
  DEFAULT_PROXY_SETTINGS,
  DEFAULT_GENERAL_SETTINGS,
} from '../domain';
import { secretsService, SECRET_KEYS } from '../services';

// ============================================================
// Store Interface
// ============================================================

interface SettingsState {
  // Theme State
  theme: ThemeSettings;
  systemPrefersDark: boolean;

  // Proxy State
  proxy: ProxySettings;

  // General State
  general: GeneralSettings;

  // UI State
  sidebarCollapsed: boolean;

  // Theme Actions
  setThemeMode: (mode: ThemeMode) => void;
  setManualTheme: (theme: ThemeId) => void;
  setDayTheme: (theme: ThemeId) => void;
  setNightTheme: (theme: ThemeId) => void;
  setSystemPrefersDark: (prefersDark: boolean) => void;

  // Theme Computed
  getActiveTheme: () => ThemeId;

  // Proxy Actions
  updateProxySettings: (updates: Partial<ProxySettings>) => void;
  updateCustomProxy: (updates: Partial<CustomProxyConfig>) => void;
  getProxyConfig: () => ProxyConfigForRequest;

  // Secrets (OS credential store, never localStorage)
  hydrateSecrets: () => Promise<void>;

  // General Actions
  updateGeneralSettings: (updates: Partial<GeneralSettings>) => void;
  getGeneralSettings: () => GeneralSettings;

  // UI Actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

// ============================================================
// Migration
// ============================================================

export const SETTINGS_VERSION = 1;

/**
 * v0 shipped the General settings without wiring them up, so whatever is stored there
 * never affected a request. requestTimeout in particular defaulted to 0, which now means
 * "wait forever" - existing users would silently lose the 30s timeout they used to get.
 */
export function migrateSettings(persisted: unknown, version: number): unknown {
  if (version >= SETTINGS_VERSION) return persisted;
  if (typeof persisted !== 'object' || persisted === null) return persisted;

  const state = persisted as Record<string, unknown>;
  const general = (state.general ?? {}) as Record<string, unknown>;

  return {
    ...state,
    general: {
      ...general,
      requestTimeout:
        general.requestTimeout === 0 || general.requestTimeout === undefined
          ? DEFAULT_GENERAL_SETTINGS.requestTimeout
          : general.requestTimeout,
    },
  };
}

// ============================================================
// Store Creation
// ============================================================

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // Initial State
      theme: DEFAULT_THEME_SETTINGS,
      systemPrefersDark: typeof window !== 'undefined'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false,
      proxy: DEFAULT_PROXY_SETTINGS,
      general: DEFAULT_GENERAL_SETTINGS,
      sidebarCollapsed: false,

      // Theme Actions
      setThemeMode: (mode) => {
        set((state) => ({
          theme: { ...state.theme, mode },
        }));
      },

      setManualTheme: (manualTheme) => {
        set((state) => ({
          theme: { ...state.theme, manualTheme },
        }));
      },

      setDayTheme: (dayTheme) => {
        set((state) => ({
          theme: { ...state.theme, dayTheme },
        }));
      },

      setNightTheme: (nightTheme) => {
        set((state) => ({
          theme: { ...state.theme, nightTheme },
        }));
      },

      setSystemPrefersDark: (prefersDark) => {
        set({ systemPrefersDark: prefersDark });
      },

      getActiveTheme: () => {
        const { theme, systemPrefersDark } = get();
        if (theme.mode === 'manual') {
          return theme.manualTheme;
        }
        return systemPrefersDark ? theme.nightTheme : theme.dayTheme;
      },

      // Proxy Actions
      updateProxySettings: (updates) => {
        if (updates.defaultProxyPassword !== undefined) {
          void secretsService.setSecret(
            SECRET_KEYS.defaultProxyPassword,
            updates.defaultProxyPassword
          );
        }

        set((state) => ({
          proxy: { ...state.proxy, ...updates },
        }));
      },

      updateCustomProxy: (updates) => {
        if (updates.password !== undefined) {
          void secretsService.setSecret(SECRET_KEYS.customProxyPassword, updates.password);
        }

        set((state) => ({
          proxy: {
            ...state.proxy,
            customProxy: { ...state.proxy.customProxy, ...updates },
          },
        }));
      },

      hydrateSecrets: async () => {
        const [customProxyPassword, defaultProxyPassword] = await Promise.all([
          secretsService.getSecret(SECRET_KEYS.customProxyPassword),
          secretsService.getSecret(SECRET_KEYS.defaultProxyPassword),
        ]);

        set((state) => ({
          proxy: {
            ...state.proxy,
            defaultProxyPassword,
            customProxy: { ...state.proxy.customProxy, password: customProxyPassword },
          },
        }));
      },

      getProxyConfig: (): ProxyConfigForRequest => {
        const { proxy } = get();

        if (proxy.useCustomProxy) {
          const { customProxy } = proxy;
          const proxyUrl = `${customProxy.protocol}://${customProxy.host}:${customProxy.port}`;

          return {
            mode: 'custom',
            customProxy: {
              url: proxyUrl,
              useForHttp: customProxy.useForHttp,
              useForHttps: customProxy.useForHttps,
              username: customProxy.auth ? customProxy.username : undefined,
              password: customProxy.auth ? customProxy.password : undefined,
              bypass: customProxy.bypass.split(',').map((s) => s.trim()).filter(Boolean),
            },
          };
        }

        if (proxy.respectEnvVariables) {
          return { mode: 'env' };
        }

        if (proxy.useSystemProxy) {
          return {
            mode: 'system',
            systemProxyAuth: proxy.defaultProxyAuth
              ? { username: proxy.defaultProxyUsername, password: proxy.defaultProxyPassword }
              : undefined,
          };
        }

        return { mode: 'none' };
      },

      // General Actions
      updateGeneralSettings: (updates) => {
        set((state) => ({
          general: { ...state.general, ...updates },
        }));
      },

      // Persisted settings from an older build can be missing newer keys, and a
      // hand-edited or partially written blob can hold explicit nulls. Both must fall
      // back to the default rather than reaching the request layer as undefined.
      getGeneralSettings: () => {
        const stored = get().general;
        const merged: GeneralSettings = { ...DEFAULT_GENERAL_SETTINGS };
        if (!stored) return merged;

        for (const key of Object.keys(merged) as (keyof GeneralSettings)[]) {
          const value = stored[key];
          if (value !== undefined && value !== null) {
            Object.assign(merged, { [key]: value });
          }
        }

        return merged;
      },

      // UI Actions
      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },

      setSidebarCollapsed: (collapsed) => {
        set({ sidebarCollapsed: collapsed });
      },
    }),
    {
      name: 'apilator-settings',
      version: SETTINGS_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: migrateSettings,
      // Passwords are deliberately blanked here: they belong in the OS credential
      // store, and hydrateSecrets() puts them back at startup.
      partialize: (state) => ({
        theme: state.theme,
        proxy: {
          ...state.proxy,
          defaultProxyPassword: '',
          customProxy: { ...state.proxy.customProxy, password: '' },
        },
        general: state.general,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);

// ============================================================
// Side Effects (theme application)
// ============================================================

// Apply theme to document when it changes
if (typeof window !== 'undefined') {
  // Initial application
  const initialTheme = useSettingsStore.getState().getActiveTheme();
  document.documentElement.setAttribute('data-theme', initialTheme);

  // Subscribe to changes
  useSettingsStore.subscribe((state) => {
    const activeTheme = state.getActiveTheme();
    document.documentElement.setAttribute('data-theme', activeTheme);
  });

  // Listen for system theme changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', (e) => {
    useSettingsStore.getState().setSystemPrefersDark(e.matches);
  });
}
