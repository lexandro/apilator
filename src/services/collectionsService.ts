import { invoke } from '@tauri-apps/api/core';
import YAML from 'yaml';
import type { Collection, CollectionNode, HttpRequest } from '../domain';
import { createEmptyRequest, collectionFromOpenApi, isOpenApiSpec } from '../domain';

export const COLLECTIONS_VERSION = 1;

export interface CollectionsFile {
  version: number;
  collections: Collection[];
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Repairs rather than rejects, like the state loader: a damaged node is dropped, but one
 * bad entry never costs the whole file.
 */
function toRuntimeNode(value: unknown): CollectionNode | null {
  if (!isRecord(value)) return null;

  const id = str(value.id) || crypto.randomUUID();

  if (value.kind === 'folder') {
    const children = Array.isArray(value.children) ? value.children : [];
    return {
      kind: 'folder',
      id,
      name: str(value.name, 'Folder'),
      // Omitted when false so a round-trip is exact and the file stays small.
      ...(value.collapsed === true ? { collapsed: true } : {}),
      children: children.map(toRuntimeNode).filter((n): n is CollectionNode => n !== null),
    };
  }

  if (value.kind === 'request') {
    if (!isRecord(value.request)) return null;
    return {
      kind: 'request',
      id,
      name: str(value.name, 'Request'),
      request: { ...createEmptyRequest(), ...(value.request as Partial<HttpRequest>) },
    };
  }

  return null;
}

function toRuntimeCollection(value: unknown): Collection | null {
  if (!isRecord(value)) return null;

  const children = Array.isArray(value.children) ? value.children : [];

  return {
    id: str(value.id) || crypto.randomUUID(),
    name: str(value.name, 'Collection'),
    ...(value.collapsed === true ? { collapsed: true } : {}),
    children: children.map(toRuntimeNode).filter((n): n is CollectionNode => n !== null),
  };
}

export function parseCollections(raw: unknown): Collection[] | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== COLLECTIONS_VERSION) return null;
  if (!Array.isArray(raw.collections)) return null;

  return raw.collections
    .map(toRuntimeCollection)
    .filter((c): c is Collection => c !== null);
}

async function backupUnreadable(suffix: string): Promise<void> {
  try {
    const path = await invoke<string | null>('backup_data', { kind: 'collections', suffix });
    if (path) {
      console.warn(`Unreadable collections file was moved aside instead of deleted: ${path}`);
    }
  } catch (error) {
    console.error('Failed to back up the unreadable collections file:', error);
  }
}

async function load(): Promise<Collection[]> {
  let content: string | null;

  try {
    content = await invoke<string | null>('load_data', { kind: 'collections' });
  } catch (error) {
    console.error('Failed to read the collections file:', error);
    return [];
  }

  if (!content) return [];

  let parsed: unknown;
  try {
    parsed = YAML.parse(content);
  } catch (error) {
    console.error('Collections file is not valid YAML:', error);
    await backupUnreadable('corrupt');
    return [];
  }

  const collections = parseCollections(parsed);
  if (!collections) {
    const version = isRecord(parsed) && typeof parsed.version === 'number' ? parsed.version : null;
    console.error(`Collections file version ${version ?? 'unknown'} cannot be read`);
    await backupUnreadable(version === null ? 'unknown' : `v${version}`);
    return [];
  }

  return collections;
}

async function save(collections: Collection[]): Promise<void> {
  try {
    const file: CollectionsFile = { version: COLLECTIONS_VERSION, collections };
    const yamlContent = YAML.stringify(file, { indent: 2, lineWidth: 0 });
    await invoke('save_data', { kind: 'collections', yamlContent });
  } catch (error) {
    console.error('Failed to save collections:', error);
  }
}

/** Serialised form, for writing to a file the user chooses. */
export function serialize(collections: Collection[]): string {
  return YAML.stringify({ version: COLLECTIONS_VERSION, collections }, {
    indent: 2,
    lineWidth: 0,
  });
}

/** Parses an exported file. Returns null when it is not a collections file we understand. */
export function deserialize(content: string): Collection[] | null {
  try {
    return parseCollections(YAML.parse(content));
  } catch {
    return null;
  }
}

export type ImportKind = 'apilator' | 'openapi';

export interface ImportResult {
  collections: Collection[];
  kind: ImportKind;
  requestCount: number;
}

/**
 * Accepts either our own export or an OpenAPI 3 document, in JSON or YAML - both parse
 * through the YAML reader, since JSON is valid YAML.
 */
export function importFromText(content: string): ImportResult | null {
  let parsed: unknown;
  try {
    parsed = YAML.parse(content);
  } catch {
    return null;
  }

  const own = parseCollections(parsed);
  if (own) {
    const requestCount = own.reduce((total, collection) => total + countRequests(collection.children), 0);
    return { collections: own, kind: 'apilator', requestCount };
  }

  if (isOpenApiSpec(parsed)) {
    const imported = collectionFromOpenApi(parsed);
    if (imported) {
      return {
        collections: [imported.collection],
        kind: 'openapi',
        requestCount: imported.requestCount,
      };
    }
  }

  return null;
}

function countRequests(nodes: CollectionNode[]): number {
  return nodes.reduce(
    (total, node) => total + (node.kind === 'request' ? 1 : countRequests(node.children)),
    0
  );
}

export const collectionsService = {
  load,
  save,
  serialize,
  deserialize,
  importFromText,
};
