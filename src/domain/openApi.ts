import type { Collection, CollectionNode } from './collection';
import { createCollection, createFolder, createRequestNode } from './collection';
import type { HttpMethod, HttpRequest, KeyValuePair } from './request';
import { createEmptyRequest } from './request';

type UnknownRecord = Record<string, unknown>;

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function pair(key: string, value: string, enabled: boolean): KeyValuePair {
  return { id: crypto.randomUUID(), key, value, enabled };
}

/** OpenAPI writes path parameters as {id}; our own placeholder syntax is {{id}}. */
export function pathToTemplate(path: string): string {
  return path.replace(/\{([^{}]+)\}/g, '{{$1}}');
}

export function baseUrlOf(spec: UnknownRecord): string {
  const servers = Array.isArray(spec.servers) ? spec.servers : [];
  const first = servers.find(isRecord);
  const url = str(first?.url).trim();

  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Follows a local JSON pointer such as #/components/schemas/User. A reference into another
 * document cannot be followed from here and resolves to undefined.
 */
function resolvePointer(root: unknown, ref: string): unknown {
  if (!ref.startsWith('#/')) return undefined;

  let node = root;
  for (const segment of ref.slice(2).split('/')) {
    if (!isRecord(node)) return undefined;
    node = node[decodeURIComponent(segment).replace(/~1/g, '/').replace(/~0/g, '~')];
  }

  return node;
}

const MAX_REF_CHAIN = 16;

/** A request body or parameter given as a $ref, replaced by what it points at. */
function dereference(value: unknown, root: unknown): unknown {
  let current = value;

  for (let i = 0; i < MAX_REF_CHAIN && isRecord(current); i++) {
    if (typeof current.$ref !== 'string') return current;
    current = resolvePointer(root, current.$ref);
  }

  return isRecord(current) && typeof current.$ref !== 'string' ? current : undefined;
}

/**
 * A small example value for a schema. Prefers whatever the spec states outright before
 * falling back to a placeholder for the type.
 *
 * `root` is the whole document, for resolving $ref. `seen` holds the references on the
 * current path only, so a schema used twice side by side is expanded both times while a
 * schema that contains itself stops at null.
 */
export function exampleForSchema(
  schema: unknown,
  root: unknown = null,
  depth = 0,
  seen: ReadonlySet<string> = new Set()
): unknown {
  if (!isRecord(schema) || depth > 6) return null;

  if (typeof schema.$ref === 'string') {
    if (seen.has(schema.$ref)) return null;
    const target = resolvePointer(root, schema.$ref);
    return exampleForSchema(target, root, depth, new Set([...seen, schema.$ref]));
  }

  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const own = isRecord(schema.properties) ? [{ properties: schema.properties }] : [];
    const parts = [...schema.allOf, ...own].map((part) => exampleForSchema(part, root, depth, seen));
    return parts.every(isRecord) ? Object.assign({}, ...parts) : (parts.find((p) => p !== null) ?? null);
  }

  const variants = Array.isArray(schema.oneOf) ? schema.oneOf : schema.anyOf;
  if (Array.isArray(variants) && variants.length > 0) {
    return exampleForSchema(variants[0], root, depth, seen);
  }

  const type = str(schema.type) || (isRecord(schema.properties) ? 'object' : '');

  switch (type) {
    case 'object': {
      const properties = isRecord(schema.properties) ? schema.properties : {};
      const result: UnknownRecord = {};
      for (const [name, child] of Object.entries(properties)) {
        result[name] = exampleForSchema(child, root, depth + 1, seen);
      }
      return result;
    }
    case 'array':
      return [exampleForSchema(schema.items, root, depth + 1, seen)];
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'string':
      return str(schema.format) === 'date-time' ? '1970-01-01T00:00:00Z' : 'string';
    default:
      return null;
  }
}

function requestBodyFor(
  operation: UnknownRecord,
  request: HttpRequest,
  root: UnknownRecord
): HttpRequest['body'] {
  const resolved = dereference(operation.requestBody, root);
  const body = isRecord(resolved) ? resolved : null;
  const content = body && isRecord(body.content) ? body.content : null;
  if (!content) return request.body;

  const json = Object.entries(content).find(([type]) => type.includes('json'));
  if (!json || !isRecord(json[1])) return request.body;

  const media = json[1];
  const example =
    media.example !== undefined ? media.example : exampleForSchema(media.schema, root);

  return {
    ...request.body,
    type: 'raw',
    raw: { content: JSON.stringify(example ?? {}, null, 2), format: 'json' },
  };
}

function parametersFor(
  operation: UnknownRecord,
  shared: unknown[],
  root: UnknownRecord
): { params: KeyValuePair[]; headers: KeyValuePair[] } {
  const own = Array.isArray(operation.parameters) ? operation.parameters : [];
  const params: KeyValuePair[] = [];
  const headers: KeyValuePair[] = [];

  for (const entry of [...shared, ...own]) {
    const raw = dereference(entry, root);
    if (!isRecord(raw)) continue;

    const name = str(raw.name);
    if (!name) continue;

    const example = exampleForSchema(raw.schema, root);
    const value = example === null || typeof example === 'object' ? '' : String(example);
    // Optional parameters come in disabled, so a freshly imported request runs as-is.
    const enabled = raw.required === true;

    if (raw.in === 'query') params.push(pair(name, value, enabled));
    else if (raw.in === 'header') headers.push(pair(name, value, enabled));
  }

  return { params, headers };
}

function operationName(method: string, path: string, operation: UnknownRecord): string {
  return str(operation.summary) || str(operation.operationId) || `${method} ${path}`;
}

/** First tag of an operation, which is how OpenAPI groups endpoints. */
function tagOf(operation: UnknownRecord): string | null {
  const tags = Array.isArray(operation.tags) ? operation.tags : [];
  const first = tags.find((t) => typeof t === 'string' && t.trim());
  return typeof first === 'string' ? first.trim() : null;
}

export interface OpenApiImportResult {
  collection: Collection;
  requestCount: number;
}

export function isOpenApiSpec(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.openapi === 'string' && isRecord(value.paths);
}

/**
 * Turns an OpenAPI 3 document into a collection, grouped into folders by the first tag of
 * each operation. Untagged operations sit at the collection root.
 */
export function collectionFromOpenApi(spec: unknown): OpenApiImportResult | null {
  if (!isOpenApiSpec(spec) || !isRecord(spec)) return null;

  const info = isRecord(spec.info) ? spec.info : {};
  const collection = createCollection(str(info.title, 'Imported API'));
  const baseUrl = baseUrlOf(spec);
  const paths = isRecord(spec.paths) ? spec.paths : {};

  const folders = new Map<string, CollectionNode[]>();
  const rootNodes: CollectionNode[] = [];
  let requestCount = 0;

  for (const [path, pathItemRaw] of Object.entries(paths)) {
    if (!isRecord(pathItemRaw)) continue;

    const shared = Array.isArray(pathItemRaw.parameters) ? pathItemRaw.parameters : [];

    for (const method of METHODS) {
      const operationRaw = pathItemRaw[method.toLowerCase()];
      if (!isRecord(operationRaw)) continue;

      const defaults = createEmptyRequest();
      const { params, headers } = parametersFor(operationRaw, shared, spec);

      const request: HttpRequest = {
        ...defaults,
        name: operationName(method, path, operationRaw),
        method,
        url: `${baseUrl}${pathToTemplate(path)}`,
        params,
        headers: [...defaults.headers, ...headers],
        body: requestBodyFor(operationRaw, defaults, spec),
      };

      const node = createRequestNode(request.name, request);
      requestCount++;

      const tag = tagOf(operationRaw);
      if (!tag) {
        rootNodes.push(node);
        continue;
      }

      const existing = folders.get(tag);
      if (existing) existing.push(node);
      else folders.set(tag, [node]);
    }
  }

  const folderNodes: CollectionNode[] = [...folders.entries()].map(([tag, children]) => ({
    ...createFolder(tag),
    children,
  }));

  return {
    collection: { ...collection, children: [...folderNodes, ...rootNodes] },
    requestCount,
  };
}
