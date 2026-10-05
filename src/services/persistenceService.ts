import { invoke } from '@tauri-apps/api/core';
import YAML from 'yaml';
import type {
  Tab,
  HistoryEntry,
  HttpRequest,
  RequestBody,
  BodyType,
  RawFormat,
  AuthConfig,
  HttpMethod,
} from '../domain';
import { createNoAuth, createEmptyRequest, createJwtAuth } from '../domain';
import { credentialsService, type StoredRequest } from './credentialsService';

export const STATE_VERSION = 2;

export interface AppState {
  version: number;
  tabs: SavedTab[];
  activeTabId: string;
  history: HistoryEntry[];
  closedTabs?: SavedTab[];
}

interface SavedTab {
  id: string;
  request: HttpRequest | StoredRequest;
  isDirty: boolean;
  name?: string;
  color?: string | null;
  pinned?: boolean;
}

type UnknownRecord = Record<string, unknown>;

/** Keyed by the version being migrated FROM. Each entry must bump `version`. */
type Migration = (state: UnknownRecord) => UnknownRecord;

/**
 * v1 stored the whole HttpResponse, body included, in every history entry. Nothing ever
 * read it back, and it was the single largest cost in the state file.
 */
function dropHistoryResponseBodies(state: UnknownRecord): UnknownRecord {
  const history = Array.isArray(state.history) ? state.history : [];

  return {
    ...state,
    version: 2,
    history: history.map((entry) => {
      if (!isRecord(entry)) return entry;
      if (!isRecord(entry.response)) return { ...entry, response: EMPTY_SUMMARY };

      const { status, statusText, size, time } = entry.response;

      return {
        ...entry,
        response: {
          status: typeof status === 'number' ? status : 0,
          statusText: typeof statusText === 'string' ? statusText : '',
          size: typeof size === 'number' ? size : 0,
          time: typeof time === 'number' ? time : 0,
        },
      };
    }),
  };
}

const EMPTY_SUMMARY = { status: 0, statusText: '', size: 0, time: 0 };

export const MIGRATIONS: Record<number, Migration> = {
  1: dropHistoryResponseBodies,
};

// ============================================================
// Validation
// ============================================================

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidAppState(value: unknown): value is AppState {
  if (!isRecord(value)) return false;
  if (value.version !== STATE_VERSION) return false;
  if (!Array.isArray(value.tabs)) return false;
  if (typeof value.activeTabId !== 'string') return false;
  if (value.history !== undefined && !Array.isArray(value.history)) return false;
  if (value.closedTabs !== undefined && !Array.isArray(value.closedTabs)) return false;
  return true;
}

function isValidHistoryEntry(value: unknown): value is HistoryEntry {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (typeof value.timestamp !== 'number') return false;
  return isRecord(value.request) && typeof value.request.url === 'string';
}

/**
 * Belt and braces on top of the v1 migration: a history entry must never carry a body,
 * whatever route it took to get here.
 */
function toHistorySummary(value: unknown): HistoryEntry['response'] {
  if (!isRecord(value)) return { ...EMPTY_SUMMARY };

  return {
    status: typeof value.status === 'number' ? value.status : 0,
    statusText: typeof value.statusText === 'string' ? value.statusText : '',
    size: typeof value.size === 'number' ? value.size : 0,
    time: typeof value.time === 'number' ? value.time : 0,
  };
}

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const BODY_TYPES: BodyType[] = ['none', 'raw', 'form-data', 'x-www-form-urlencoded'];
const RAW_FORMATS: RawFormat[] = ['json', 'xml', 'text', 'html'];

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && (allowed as string[]).includes(value)
    ? (value as T)
    : fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toRuntimeBody(value: unknown, defaults: RequestBody): RequestBody {
  if (!isRecord(value)) return defaults;

  const raw = isRecord(value.raw) ? value.raw : null;

  return {
    type: oneOf(value.type, BODY_TYPES, defaults.type),
    raw: {
      content: str(raw?.content, defaults.raw.content),
      format: oneOf(raw?.format, RAW_FORMATS, defaults.raw.format),
    },
    formData: Array.isArray(value.formData) ? value.formData : defaults.formData,
    urlencoded: Array.isArray(value.urlencoded) ? value.urlencoded : defaults.urlencoded,
  };
}

function toRuntimeAuth(value: unknown): AuthConfig {
  if (!isRecord(value)) return createNoAuth();

  switch (value.type) {
    case 'basic':
      return { type: 'basic', username: str(value.username), password: str(value.password) };
    case 'bearer':
      return { type: 'bearer', token: str(value.token) };
    case 'jwt': {
      const defaults = createJwtAuth();
      return {
        ...defaults,
        algorithm: oneOf(value.algorithm, ['HS256', 'HS384', 'HS512'], defaults.algorithm),
        secret: str(value.secret, defaults.secret),
        secretBase64Encoded: value.secretBase64Encoded === true,
        payload: str(value.payload, defaults.payload),
        headerPrefix: str(value.headerPrefix, defaults.headerPrefix),
        jwtHeaders: str(value.jwtHeaders, defaults.jwtHeaders),
        target: oneOf(value.target, ['header', 'query'], defaults.target),
        queryParamName: str(value.queryParamName, defaults.queryParamName),
      };
    }
    default:
      return createNoAuth();
  }
}

/**
 * Repairs rather than rejects: a tab that has a usable request but lost a field to a
 * partial write or an older format comes back with defaults filled in.
 */
function toRuntimeTab(saved: unknown): Tab | null {
  if (!isRecord(saved)) return null;
  if (!isRecord(saved.request)) return null;

  const raw = saved.request;
  if (typeof raw.url !== 'string' || typeof raw.method !== 'string') return null;

  const defaults = createEmptyRequest();

  const request: HttpRequest = {
    id: str(raw.id) || crypto.randomUUID(),
    name: str(raw.name, defaults.name),
    method: oneOf(raw.method, HTTP_METHODS, defaults.method),
    url: raw.url,
    headers: Array.isArray(raw.headers) ? raw.headers : defaults.headers,
    params: Array.isArray(raw.params) ? raw.params : defaults.params,
    body: toRuntimeBody(raw.body, defaults.body),
    auth: toRuntimeAuth(raw.auth),
  };

  return {
    id: typeof saved.id === 'string' ? saved.id : crypto.randomUUID(),
    request,
    requestState: { status: 'idle' },
    isDirty: saved.isDirty === true,
    name: typeof saved.name === 'string' ? saved.name : undefined,
    color: (typeof saved.color === 'string' ? saved.color : null) as Tab['color'],
    pinned: saved.pinned === true,
  };
}

// ============================================================
// Migration
// ============================================================

/**
 * Returns null when the state cannot be brought to STATE_VERSION. Callers must back the
 * file up rather than discard it.
 */
export function migrateState(state: unknown): UnknownRecord | null {
  if (!isRecord(state)) return null;
  if (typeof state.version !== 'number' || !Number.isInteger(state.version)) return null;
  if (state.version > STATE_VERSION) return null;

  let current = state;

  while ((current.version as number) < STATE_VERSION) {
    const from = current.version as number;
    const migration = MIGRATIONS[from];
    if (!migration) return null;

    const next = migration(current);
    if (!isRecord(next)) return null;

    // Guards against a migration that forgets to bump the version and spins forever.
    if (typeof next.version !== 'number' || next.version <= from) return null;

    current = next;
  }

  return current;
}

// ============================================================
// Persistence
// ============================================================

async function backupCorruptState(suffix: string): Promise<void> {
  try {
    const path = await invoke<string | null>('backup_data', { kind: 'state', suffix });
    if (path) {
      console.warn(`Unreadable state file was moved aside instead of being deleted: ${path}`);
    }
  } catch (error) {
    console.error('Failed to back up the unreadable state file:', error);
  }
}

async function loadAppState(): Promise<AppState | null> {
  let yamlContent: string | null;

  try {
    yamlContent = await invoke<string | null>('load_data', { kind: 'state' });
  } catch (error) {
    console.error('Failed to read state file:', error);
    return null;
  }

  if (!yamlContent) return null;

  let parsed: unknown;
  try {
    parsed = YAML.parse(yamlContent);
  } catch (error) {
    console.error('State file is not valid YAML:', error);
    await backupCorruptState('corrupt');
    return null;
  }

  const version = isRecord(parsed) && typeof parsed.version === 'number' ? parsed.version : null;

  const migrated = migrateState(parsed);
  if (!migrated) {
    console.error(`State file version ${version ?? 'unknown'} cannot be migrated`);
    await backupCorruptState(version === null ? 'unknown' : `v${version}`);
    return null;
  }

  if (!isValidAppState(migrated)) {
    console.error('State file has an unexpected shape');
    await backupCorruptState('invalid');
    return null;
  }

  return openCredentials(migrated);
}

/** Decrypts the credentials of every saved request: open tabs, closed tabs and history. */
async function openCredentials(state: AppState): Promise<AppState> {
  const groups: unknown[][] = [state.tabs, state.closedTabs ?? [], state.history ?? []];
  const opened = await credentialsService.openRequests(
    groups.flat().map((item) => (isRecord(item) ? item.request : undefined))
  );

  let next = 0;
  const reattach = (list: unknown[]) =>
    list.map((item) => {
      const request = opened[next++];
      return isRecord(item) ? { ...item, request } : item;
    });

  const tabs = reattach(state.tabs);
  const closedTabs = state.closedTabs && reattach(state.closedTabs);
  const history = state.history && reattach(state.history);

  return { ...state, tabs, closedTabs, history } as AppState;
}

/**
 * Saves run one after another. Sealing credentials makes a save asynchronous before it
 * writes, and without the queue a slow earlier save could land after a later one.
 */
let saveQueue: Promise<void> = Promise.resolve();

function saveAppState(
  tabs: Tab[],
  activeTabId: string,
  history: HistoryEntry[],
  closedTabs: Tab[] = []
): Promise<void> {
  saveQueue = saveQueue.then(() => writeAppState(tabs, activeTabId, history, closedTabs));
  return saveQueue;
}

async function writeAppState(
  tabs: Tab[],
  activeTabId: string,
  history: HistoryEntry[],
  closedTabs: Tab[]
): Promise<void> {
  try {
    const stored = await credentialsService.sealRequests([
      ...tabs.map((tab) => tab.request),
      ...closedTabs.map((tab) => tab.request),
      ...history.map((entry) => entry.request),
    ]);

    let next = 0;
    const toSavedTab = (tab: Tab): SavedTab => ({
      id: tab.id,
      request: stored[next++],
      isDirty: tab.isDirty,
      name: tab.name,
      color: tab.color,
      pinned: tab.pinned,
    });

    const savedTabs = tabs.map(toSavedTab);
    const savedClosedTabs = closedTabs.map(toSavedTab);
    const savedHistory = history.map((entry) => ({
      ...entry,
      request: stored[next++] as unknown as HttpRequest,
      response: toHistorySummary(entry.response),
    }));

    const state: AppState = {
      version: STATE_VERSION,
      tabs: savedTabs,
      activeTabId,
      history: savedHistory,
      closedTabs: savedClosedTabs,
    };

    const yamlContent = YAML.stringify(state, { indent: 2, lineWidth: 0 });

    await invoke('save_data', { kind: 'state', yamlContent });
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}

function stateToTabs(state: AppState): Tab[] {
  return state.tabs.map(toRuntimeTab).filter((tab): tab is Tab => tab !== null);
}

function stateToClosedTabs(state: AppState): Tab[] {
  if (!state.closedTabs) return [];
  return state.closedTabs.map(toRuntimeTab).filter((tab): tab is Tab => tab !== null);
}

function stateToHistory(state: AppState): HistoryEntry[] {
  if (!state.history) return [];

  return state.history
    .filter(isValidHistoryEntry)
    .map((entry) => ({ ...entry, response: toHistorySummary(entry.response) }));
}

async function getDataPath(): Promise<string> {
  return invoke<string>('get_data_path');
}

export const persistenceService = {
  loadAppState,
  saveAppState,
  stateToTabs,
  stateToClosedTabs,
  stateToHistory,
  getDataPath,
};
