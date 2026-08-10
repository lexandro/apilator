import type { AuthConfig } from './auth';

// Injected at build time so the version is never retyped in two places.
declare const __APP_VERSION__: string | undefined;
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';
import { createNoAuth } from './auth';

// HTTP method types
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

// Key-value pair for headers, params, etc.
export interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

// Body content types
export type BodyType = 'none' | 'raw' | 'form-data' | 'x-www-form-urlencoded';

// Raw body format options
export type RawFormat = 'json' | 'xml' | 'text' | 'html';

/**
  * A multipart field. With filePath set the row is a file part; otherwise `value` is sent
  * as a plain text field.
  */
export interface FormDataEntry extends KeyValuePair {
  filePath?: string;
  contentType?: string;
}

// Request body configuration
export interface RequestBody {
  type: BodyType;
  raw: {
    content: string;
    format: RawFormat;
  };
  formData: FormDataEntry[];
  urlencoded: KeyValuePair[];
}

// Complete HTTP request definition
export interface HttpRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: KeyValuePair[];
  params: KeyValuePair[];
  body: RequestBody;
  auth: AuthConfig;
}

// Default headers for new requests
function createDefaultHeaders(): KeyValuePair[] {
  return [
    { id: crypto.randomUUID(), key: 'User-Agent', value: `Apilator/${APP_VERSION}`, enabled: true },
    { id: crypto.randomUUID(), key: 'Accept', value: '*/*', enabled: true },
    { id: crypto.randomUUID(), key: 'Accept-Encoding', value: 'gzip, deflate, br', enabled: true },
    { id: crypto.randomUUID(), key: 'Connection', value: 'keep-alive', enabled: true },
  ];
}

// Factory: Create empty request
export function createEmptyRequest(): HttpRequest {
  return {
    id: crypto.randomUUID(),
    name: 'New Request',
    method: 'GET',
    url: '',
    headers: createDefaultHeaders(),
    params: [],
    body: {
      type: 'none',
      raw: {
        content: '',
        format: 'json',
      },
      formData: [],
      urlencoded: [],
    },
    auth: createNoAuth(),
  };
}

export function createFormDataEntry(key = '', value = ''): FormDataEntry {
  return { id: crypto.randomUUID(), key, value, enabled: true };
}

// Factory: Create key-value pair
export function createKeyValuePair(key = '', value = ''): KeyValuePair {
  return {
    id: crypto.randomUUID(),
    key,
    value,
    enabled: true,
  };
}
