// ============================================================
// Theme Settings
// ============================================================

export type ThemeId = 'light' | 'dark' | 'solarized-light' | 'solarized-dark';
export type ThemeMode = 'manual' | 'system';

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  isDark: boolean;
}

export const THEMES: ThemeDefinition[] = [
  { id: 'light', name: 'Light', isDark: false },
  { id: 'dark', name: 'Dark', isDark: true },
  { id: 'solarized-light', name: 'Solarized Light', isDark: false },
  { id: 'solarized-dark', name: 'Solarized Dark', isDark: true },
];

export interface ThemeSettings {
  mode: ThemeMode;
  manualTheme: ThemeId;
  dayTheme: ThemeId;
  nightTheme: ThemeId;
}

// ============================================================
// Proxy Settings
// ============================================================

export interface CustomProxyConfig {
  useForHttp: boolean;
  useForHttps: boolean;
  protocol: 'http' | 'https';
  host: string;
  port: string;
  auth: boolean;
  username: string;
  password: string;
  bypass: string;
}

export interface ProxySettings {
  // Default proxy configuration
  defaultProxyAuth: boolean;
  defaultProxyUsername: string;
  defaultProxyPassword: string;

  // Proxy mode settings
  useSystemProxy: boolean;
  respectEnvVariables: boolean;
  useCustomProxy: boolean;

  // Custom proxy configuration
  customProxy: CustomProxyConfig;
}

// Config that will be sent to the backend
export interface ProxyConfigForRequest {
  mode: 'none' | 'system' | 'env' | 'custom';
  customProxy?: {
    url: string;
    useForHttp: boolean;
    useForHttps: boolean;
    username?: string;
    password?: string;
    bypass: string[];
  };
  systemProxyAuth?: {
    username: string;
    password: string;
  };
}

// ============================================================
// General Settings
// ============================================================

export type HttpVersion = 'HTTP/1.1' | 'HTTP/2';

export interface GeneralSettings {
  // Security settings
  verifyTls: boolean;

  // Request settings
  httpVersion: HttpVersion;
  requestTimeout: number; // milliseconds, 0 = no timeout
  maxResponseSize: number; // MB, 0 = no limit
  responseFormatDetection: boolean;

  // Header settings
  sendNoCacheHeader: boolean;
  autoFollowRedirects: boolean;
}

// ============================================================
// Default Values
// ============================================================

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  mode: 'manual',
  manualTheme: 'dark',
  dayTheme: 'light',
  nightTheme: 'dark',
};

export const DEFAULT_PROXY_SETTINGS: ProxySettings = {
  defaultProxyAuth: false,
  defaultProxyUsername: '',
  defaultProxyPassword: '',

  useSystemProxy: true,
  respectEnvVariables: false,
  useCustomProxy: false,

  customProxy: {
    useForHttp: true,
    useForHttps: true,
    protocol: 'http',
    host: '',
    port: '8080',
    auth: false,
    username: '',
    password: '',
    bypass: '',
  },
};

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  verifyTls: true,

  httpVersion: 'HTTP/1.1',
  requestTimeout: 30000,
  maxResponseSize: 50,
  responseFormatDetection: true,

  sendNoCacheHeader: false,
  autoFollowRedirects: true,
};
