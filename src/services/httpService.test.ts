import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import { httpService } from './httpService';
import { createEmptyRequest, createKeyValuePair } from '../domain';
import type { HttpRequest } from '../domain';

const invokeMock = vi.mocked(invoke);

function rustResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: 200,
    status_text: 'OK',
    headers: { 'content-type': 'application/json' },
    body: '{"ok":true}',
    size: 11,
    time: 42,
    http_version: 'HTTP/1.1',
    remote_addr: '93.184.216.34:443',
    tls_verified: true,
    body_encoding: 'utf8',
    truncated: false,
    ...overrides,
  };
}

function sentParams(): Record<string, never> & {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeout_ms: number;
  max_response_bytes: number;
  follow_redirects: boolean;
  http_version: string;
  form_data?: Array<{ key: string; value: string; file_path?: string; content_type?: string }>;
  request_id?: string;
  proxy?: unknown;
} {
  const call = invokeMock.mock.calls.find(([command]) => command === 'send_request');
  if (!call) throw new Error('send_request was never called');
  return (call[1] as { params: never }).params;
}

function requestWith(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return { ...createEmptyRequest(), headers: [], ...overrides };
}

const SIGNED_JWT = 'header.payload.signature';

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (command: string) => {
    if (command === 'sign_jwt') return SIGNED_JWT;
    return rustResponse();
  });
});

function jwtAuth(overrides: Record<string, unknown> = {}) {
  return {
    type: 'jwt' as const,
    algorithm: 'HS256' as const,
    secret: 'my-secret',
    secretBase64Encoded: false,
    payload: '{"sub":"1"}',
    headerPrefix: 'Bearer',
    jwtHeaders: '{}',
    target: 'header' as const,
    queryParamName: 'token',
    ...overrides,
  };
}

// ============================================================
// Auth helpers
// ============================================================

describe('computeAuthHeader', () => {
  it('returns null for no auth', () => {
    expect(httpService.computeAuthHeader({ type: 'none' })).toBeNull();
  });

  it('base64-encodes basic credentials', () => {
    expect(
      httpService.computeAuthHeader({ type: 'basic', username: 'user', password: 'pass' })
    ).toBe('Basic dXNlcjpwYXNz');
  });

  it('builds a basic header even when only one of the two fields is filled', () => {
    expect(httpService.computeAuthHeader({ type: 'basic', username: 'user', password: '' })).toBe(
      'Basic dXNlcjo='
    );
  });

  it('returns null for basic auth with nothing filled in', () => {
    expect(
      httpService.computeAuthHeader({ type: 'basic', username: '', password: '' })
    ).toBeNull();
  });

  it('prefixes a bearer token', () => {
    expect(httpService.computeAuthHeader({ type: 'bearer', token: 'abc123' })).toBe(
      'Bearer abc123'
    );
  });

  it('returns null for an empty bearer token', () => {
    expect(httpService.computeAuthHeader({ type: 'bearer', token: '' })).toBeNull();
  });
});

describe('getAuthTypeLabel', () => {
  it('names every auth type', () => {
    expect(httpService.getAuthTypeLabel('none')).toBe('No Auth');
    expect(httpService.getAuthTypeLabel('basic')).toBe('Basic Auth');
    expect(httpService.getAuthTypeLabel('bearer')).toBe('Bearer Token');
    expect(httpService.getAuthTypeLabel('jwt')).toBe('JWT Bearer');
  });
});

describe('hasAuthHeader agrees with computeAuthHeader', () => {
  const cases: { name: string; auth: Parameters<typeof httpService.hasAuthHeader>[0] }[] = [
    { name: 'no auth', auth: { type: 'none' } },
    { name: 'filled basic', auth: { type: 'basic', username: 'u', password: 'p' } },
    { name: 'empty basic', auth: { type: 'basic', username: '', password: '' } },
    { name: 'filled bearer', auth: { type: 'bearer', token: 't' } },
    { name: 'empty bearer', auth: { type: 'bearer', token: '' } },
  ];

  for (const { name, auth } of cases) {
    it(`agrees for ${name}`, () => {
      expect(httpService.hasAuthHeader(auth)).toBe(httpService.computeAuthHeader(auth) !== null);
    });
  }

  // B3 is fixed: JWT is signed in the backend, so computeAuthHeader cannot return the
  // value synchronously. hasAuthHeader answers "will an Authorization header be sent",
  // and the request-building tests below prove one really is.
  it('reports that a filled-in JWT config will send an Authorization header', () => {
    expect(httpService.hasAuthHeader(jwtAuth())).toBe(true);
  });

  it('reports no Authorization header for a JWT with no secret', () => {
    expect(httpService.hasAuthHeader(jwtAuth({ secret: '' }))).toBe(false);
  });

  it('reports no Authorization header when the JWT goes into the query string', () => {
    expect(httpService.hasAuthHeader(jwtAuth({ target: 'query' }))).toBe(false);
  });
});

// ============================================================
// JWT (B3)
// ============================================================

describe('JWT auth', () => {
  it('signs the token in the backend and sends it as a bearer header', async () => {
    await httpService.sendRequest(requestWith({ auth: jwtAuth() }));

    expect(invokeMock).toHaveBeenCalledWith('sign_jwt', {
      params: {
        algorithm: 'HS256',
        secret: 'my-secret',
        secret_base64_encoded: false,
        payload: '{"sub":"1"}',
        jwt_headers: '{}',
      },
    });
    expect(sentParams().headers['Authorization']).toBe(`Bearer ${SIGNED_JWT}`);
  });

  it('honours a custom header prefix', async () => {
    await httpService.sendRequest(requestWith({ auth: jwtAuth({ headerPrefix: 'Token' }) }));

    expect(sentParams().headers['Authorization']).toBe(`Token ${SIGNED_JWT}`);
  });

  it('sends the bare token when the prefix is blank', async () => {
    await httpService.sendRequest(requestWith({ auth: jwtAuth({ headerPrefix: '  ' }) }));

    expect(sentParams().headers['Authorization']).toBe(SIGNED_JWT);
  });

  it('puts the token in the query string when that is the target', async () => {
    await httpService.sendRequest(
      requestWith({ url: 'https://api.test/x', auth: jwtAuth({ target: 'query' }) })
    );

    expect(sentParams().url).toBe(`https://api.test/x?token=${SIGNED_JWT}`);
    expect(sentParams().headers['Authorization']).toBeUndefined();
  });

  it('uses the configured query param name', async () => {
    await httpService.sendRequest(
      requestWith({
        url: 'https://api.test/x',
        auth: jwtAuth({ target: 'query', queryParamName: 'jwt' }),
      })
    );

    expect(sentParams().url).toBe(`https://api.test/x?jwt=${SIGNED_JWT}`);
  });

  it('appends the token alongside existing query params', async () => {
    await httpService.sendRequest(
      requestWith({
        url: 'https://api.test/x',
        params: [{ ...createKeyValuePair('page', '2'), enabled: true }],
        auth: jwtAuth({ target: 'query' }),
      })
    );

    expect(sentParams().url).toBe(`https://api.test/x?page=2&token=${SIGNED_JWT}`);
  });

  it('does not call the backend when the secret is empty', async () => {
    await httpService.sendRequest(requestWith({ auth: jwtAuth({ secret: '' }) }));

    const signCalls = invokeMock.mock.calls.filter(([command]) => command === 'sign_jwt');
    expect(signCalls).toHaveLength(0);
    expect(sentParams().headers['Authorization']).toBeUndefined();
  });

  it('still sends the request when signing fails, just without the header', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'sign_jwt') throw new Error('bad secret');
      return rustResponse();
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const state = await httpService.sendRequest(requestWith({ auth: jwtAuth() }));

    expect(state.status).toBe('success');
    expect(sentParams().headers['Authorization']).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('does not overwrite a manually set Authorization header', async () => {
    await httpService.sendRequest(
      requestWith({
        headers: [{ ...createKeyValuePair('Authorization', 'Manual xyz'), enabled: true }],
        auth: jwtAuth(),
      })
    );

    expect(sentParams().headers['Authorization']).toBe('Manual xyz');
  });
});

// ============================================================
// Request building
// ============================================================

describe('sendRequest — request building', () => {
  it('passes the method and url through', async () => {
    await httpService.sendRequest(requestWith({ method: 'POST', url: 'https://api.test/items' }));

    expect(sentParams().method).toBe('POST');
    expect(sentParams().url).toBe('https://api.test/items');
  });

  it('includes enabled headers and drops disabled ones', async () => {
    await httpService.sendRequest(
      requestWith({
        headers: [
          { ...createKeyValuePair('X-Keep', 'yes'), enabled: true },
          { ...createKeyValuePair('X-Drop', 'no'), enabled: false },
        ],
      })
    );

    expect(sentParams().headers).toEqual({ 'X-Keep': 'yes' });
  });

  it('drops headers whose name is blank', async () => {
    await httpService.sendRequest(
      requestWith({ headers: [{ ...createKeyValuePair('   ', 'orphan'), enabled: true }] })
    );

    expect(sentParams().headers).toEqual({});
  });

  it('appends enabled query params, url-encoding them', async () => {
    await httpService.sendRequest(
      requestWith({
        url: 'https://api.test/search',
        params: [
          { ...createKeyValuePair('q', 'a b&c'), enabled: true },
          { ...createKeyValuePair('skip', 'me'), enabled: false },
        ],
      })
    );

    expect(sentParams().url).toBe('https://api.test/search?q=a+b%26c');
  });

  it('uses & as the separator when the url already has a query string', async () => {
    await httpService.sendRequest(
      requestWith({
        url: 'https://api.test/search?page=2',
        params: [{ ...createKeyValuePair('q', 'x'), enabled: true }],
      })
    );

    expect(sentParams().url).toBe('https://api.test/search?page=2&q=x');
  });

  it('leaves the url alone when no param is enabled', async () => {
    await httpService.sendRequest(
      requestWith({
        url: 'https://api.test/items',
        params: [{ ...createKeyValuePair('q', 'x'), enabled: false }],
      })
    );

    expect(sentParams().url).toBe('https://api.test/items');
  });

  it('adds the Authorization header derived from auth config', async () => {
    await httpService.sendRequest(
      requestWith({ auth: { type: 'bearer', token: 'tok' } })
    );

    expect(sentParams().headers['Authorization']).toBe('Bearer tok');
  });

  it('does not overwrite a manually set Authorization header', async () => {
    await httpService.sendRequest(
      requestWith({
        headers: [{ ...createKeyValuePair('Authorization', 'Manual xyz'), enabled: true }],
        auth: { type: 'bearer', token: 'tok' },
      })
    );

    expect(sentParams().headers['Authorization']).toBe('Manual xyz');
  });

  it('respects a lowercase manual authorization header too', async () => {
    await httpService.sendRequest(
      requestWith({
        headers: [{ ...createKeyValuePair('authorization', 'Manual xyz'), enabled: true }],
        auth: { type: 'bearer', token: 'tok' },
      })
    );

    expect(sentParams().headers['Authorization']).toBeUndefined();
  });

  it('sends a raw body and infers its Content-Type from the format', async () => {
    const base = createEmptyRequest();
    await httpService.sendRequest(
      requestWith({
        body: { ...base.body, type: 'raw', raw: { content: '{"a":1}', format: 'json' } },
      })
    );

    expect(sentParams().body).toBe('{"a":1}');
    expect(sentParams().headers['Content-Type']).toBe('application/json');
  });

  it('does not override a manually set Content-Type', async () => {
    const base = createEmptyRequest();
    await httpService.sendRequest(
      requestWith({
        headers: [{ ...createKeyValuePair('Content-Type', 'application/graphql'), enabled: true }],
        body: { ...base.body, type: 'raw', raw: { content: '{}', format: 'json' } },
      })
    );

    expect(sentParams().headers['Content-Type']).toBe('application/graphql');
  });

  it('url-encodes a form body and sets the matching Content-Type', async () => {
    const base = createEmptyRequest();
    await httpService.sendRequest(
      requestWith({
        body: {
          ...base.body,
          type: 'x-www-form-urlencoded',
          urlencoded: [
            { ...createKeyValuePair('name', 'a b'), enabled: true },
            { ...createKeyValuePair('skip', 'x'), enabled: false },
          ],
        },
      })
    );

    expect(sentParams().body).toBe('name=a+b');
    expect(sentParams().headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('sends no body for a bodyless request', async () => {
    await httpService.sendRequest(requestWith({ method: 'GET' }));
    expect(sentParams().body).toBeUndefined();
  });

  it('sends no timeout when the caller does not ask for one', async () => {
    await httpService.sendRequest(requestWith());
    expect(sentParams().timeout_ms).toBe(0);
  });

  it('passes an explicit timeout through when one is given', async () => {
    await httpService.sendRequest(requestWith(), { timeoutMs: 5000 });
    expect(sentParams().timeout_ms).toBe(5000);
  });

  it('passes the response size limit through', async () => {
    await httpService.sendRequest(requestWith(), { maxResponseBytes: 1024 });
    expect(sentParams().max_response_bytes).toBe(1024);
  });

  it('defaults to following redirects', async () => {
    await httpService.sendRequest(requestWith());
    expect(sentParams().follow_redirects).toBe(true);
  });

  it('passes a request id so the request can be cancelled', async () => {
    await httpService.sendRequest(requestWith(), { requestId: 'abc' });
    expect(sentParams().request_id).toBe('abc');
  });

  it('adds the no-cache header only when asked', async () => {
    await httpService.sendRequest(requestWith());
    expect(sentParams().headers['Cache-Control']).toBeUndefined();

    invokeMock.mockClear();
    await httpService.sendRequest(requestWith(), { sendNoCacheHeader: true });
    expect(sentParams().headers['Cache-Control']).toBe('no-cache');
  });

  it('does not override a manually set Cache-Control header', async () => {
    await httpService.sendRequest(
      requestWith({
        headers: [{ ...createKeyValuePair('Cache-Control', 'max-age=60'), enabled: true }],
      }),
      { sendNoCacheHeader: true }
    );

    expect(sentParams().headers['Cache-Control']).toBe('max-age=60');
  });

  it('passes the requested HTTP version through', async () => {
    await httpService.sendRequest(requestWith(), { httpVersion: 'HTTP/2' });
    expect(sentParams().http_version).toBe('HTTP/2');
  });
});

// ============================================================
// Response handling
// ============================================================

describe('sendRequest — response handling', () => {
  it('maps a successful response onto the domain shape', async () => {
    const state = await httpService.sendRequest(requestWith());

    expect(state.status).toBe('success');
    if (state.status !== 'success') return;

    expect(state.response.status).toBe(200);
    expect(state.response.statusText).toBe('OK');
    expect(state.response.body).toBe('{"ok":true}');
    expect(state.response.size).toBe(11);
    expect(state.response.time).toBe(42);
    expect(state.response.networkInfo).toEqual({
      httpVersion: 'HTTP/1.1',
      remoteAddr: '93.184.216.34:443',
      tlsVerified: true,
    });
  });

  it('converts the response header map into key-value pairs with unique ids', async () => {
    invokeMock.mockResolvedValue(
      rustResponse({ headers: { 'content-type': 'application/json', server: 'nginx' } })
    );

    const state = await httpService.sendRequest(requestWith());
    if (state.status !== 'success') throw new Error('expected success');

    expect(state.response.headers).toHaveLength(2);
    expect(state.response.headers.map((h) => h.key).sort()).toEqual(['content-type', 'server']);
    expect(new Set(state.response.headers.map((h) => h.id)).size).toBe(2);
  });

  it('turns a rejected invoke into an error state rather than throwing', async () => {
    invokeMock.mockRejectedValue({
      message: 'connection refused',
      error_type: 'network',
      code: 'ECONNREFUSED',
    });

    const state = await httpService.sendRequest(requestWith());

    expect(state.status).toBe('error');
    if (state.status !== 'error') return;
    expect(state.error.message).toBe('connection refused');
    expect(state.error.type).toBe('network');
    expect(state.error.code).toBe('ECONNREFUSED');
  });

  it('falls back to a generic message when the backend gives none', async () => {
    invokeMock.mockRejectedValue({});

    const state = await httpService.sendRequest(requestWith());

    expect(state.status).toBe('error');
    if (state.status !== 'error') return;
    expect(state.error.message).toBe('Unknown error occurred');
    expect(state.error.type).toBe('unknown');
  });
});

// ============================================================
// Proxy
// ============================================================

describe('sendRequest — proxy config', () => {
  it('omits the proxy field when no config is given', async () => {
    await httpService.sendRequest(requestWith());
    expect(sentParams().proxy).toBeUndefined();
  });

  it('converts the custom proxy config to the backend snake_case shape', async () => {
    await httpService.sendRequest(requestWith(), {
      proxy: {
      mode: 'custom',
      customProxy: {
        url: 'http://proxy.test:8080',
        useForHttp: true,
        useForHttps: false,
        username: 'u',
        password: 'p',
        bypass: ['localhost'],
      },
    } });

    expect(sentParams().proxy).toEqual({
      mode: 'custom',
      custom_proxy: {
        url: 'http://proxy.test:8080',
        use_for_http: true,
        use_for_https: false,
        username: 'u',
        password: 'p',
        bypass: ['localhost'],
      },
    });
  });

  it('passes the bare mode through for none/env/system', async () => {
    await httpService.sendRequest(requestWith(), { proxy: { mode: 'env' } });
    expect(sentParams().proxy).toEqual({ mode: 'env' });
  });
});


// ============================================================
// Form data (B10)
// ============================================================

describe('multipart form data', () => {
  function withFormData(entries: Array<Record<string, unknown>>) {
    const base = createEmptyRequest();
    return requestWith({
      body: { ...base.body, type: 'form-data', formData: entries as never },
    });
  }

  it('sends the enabled text fields as multipart parts', async () => {
    await httpService.sendRequest(
      withFormData([
        { id: '1', key: 'title', value: 'hello', enabled: true },
        { id: '2', key: 'skipped', value: 'no', enabled: false },
      ])
    );

    expect(sentParams().form_data).toEqual([
      { key: 'title', value: 'hello', file_path: undefined, content_type: undefined },
    ]);
  });

  it('sends a file part with its path', async () => {
    await httpService.sendRequest(
      withFormData([
        { id: '1', key: 'upload', value: '', enabled: true, filePath: 'C:/tmp/a.pdf' },
      ])
    );

    expect(sentParams().form_data).toEqual([
      { key: 'upload', value: '', file_path: 'C:/tmp/a.pdf', content_type: undefined },
    ]);
  });

  it('passes an explicit content type for a file part', async () => {
    await httpService.sendRequest(
      withFormData([
        {
          id: '1',
          key: 'upload',
          value: '',
          enabled: true,
          filePath: 'C:/tmp/a.pdf',
          contentType: 'application/pdf',
        },
      ])
    );

    expect(sentParams().form_data?.[0].content_type).toBe('application/pdf');
  });

  it('drops rows with a blank key', async () => {
    await httpService.sendRequest(
      withFormData([{ id: '1', key: '   ', value: 'orphan', enabled: true }])
    );

    expect(sentParams().form_data).toEqual([]);
  });

  it('does not set a Content-Type header, so the multipart boundary is not broken', async () => {
    await httpService.sendRequest(
      withFormData([{ id: '1', key: 'title', value: 'hello', enabled: true }])
    );

    expect(sentParams().headers['Content-Type']).toBeUndefined();
    expect(sentParams().headers['content-type']).toBeUndefined();
  });

  it('strips a manually set Content-Type too', async () => {
    const base = createEmptyRequest();
    await httpService.sendRequest(
      requestWith({
        headers: [{ ...createKeyValuePair('Content-Type', 'multipart/form-data'), enabled: true }],
        body: {
          ...base.body,
          type: 'form-data',
          formData: [{ id: '1', key: 'a', value: 'b', enabled: true }] as never,
        },
      })
    );

    expect(sentParams().headers['Content-Type']).toBeUndefined();
  });

  it('sends no plain body alongside the multipart parts', async () => {
    await httpService.sendRequest(
      withFormData([{ id: '1', key: 'title', value: 'hello', enabled: true }])
    );

    expect(sentParams().body).toBeUndefined();
  });

  it('leaves form_data unset for other body types', async () => {
    await httpService.sendRequest(requestWith());

    expect(sentParams().form_data).toBeUndefined();
  });
});

// ============================================================
// Environment variables
// ============================================================

describe('variable substitution', () => {
  function vars(pairs: Record<string, string>) {
    return new Map(Object.entries(pairs));
  }

  it('substitutes into the url', async () => {
    await httpService.sendRequest(requestWith({ url: 'https://{{host}}/users' }), {
      variables: vars({ host: 'api.test' }),
    });

    expect(sentParams().url).toBe('https://api.test/users');
  });

  it('substitutes into header names and values', async () => {
    await httpService.sendRequest(
      requestWith({
        headers: [{ ...createKeyValuePair('X-{{name}}', '{{value}}'), enabled: true }],
      }),
      { variables: vars({ name: 'Tenant', value: 'acme' }) }
    );

    expect(sentParams().headers['X-Tenant']).toBe('acme');
  });

  it('substitutes into query params', async () => {
    await httpService.sendRequest(
      requestWith({
        url: 'https://api.test/x',
        params: [{ ...createKeyValuePair('key', '{{apiKey}}'), enabled: true }],
      }),
      { variables: vars({ apiKey: 'abc123' }) }
    );

    expect(sentParams().url).toBe('https://api.test/x?key=abc123');
  });

  it('substitutes into a raw body', async () => {
    const base = createEmptyRequest();
    await httpService.sendRequest(
      requestWith({
        body: { ...base.body, type: 'raw', raw: { content: '{"host":"{{host}}"}', format: 'json' } },
      }),
      { variables: vars({ host: 'api.test' }) }
    );

    expect(sentParams().body).toBe('{"host":"api.test"}');
  });

  it('substitutes into basic auth credentials', async () => {
    await httpService.sendRequest(
      requestWith({ auth: { type: 'basic', username: '{{user}}', password: '{{pass}}' } }),
      { variables: vars({ user: 'user', pass: 'pass' }) }
    );

    expect(sentParams().headers['Authorization']).toBe('Basic dXNlcjpwYXNz');
  });

  it('substitutes into a bearer token', async () => {
    await httpService.sendRequest(
      requestWith({ auth: { type: 'bearer', token: '{{token}}' } }),
      { variables: vars({ token: 'abc' }) }
    );

    expect(sentParams().headers['Authorization']).toBe('Bearer abc');
  });

  it('leaves an unknown placeholder visible rather than blanking it', async () => {
    await httpService.sendRequest(requestWith({ url: 'https://{{missing}}/x' }), {
      variables: vars({ host: 'api.test' }),
    });

    expect(sentParams().url).toBe('https://{{missing}}/x');
  });

  it('changes nothing when there is no environment', async () => {
    await httpService.sendRequest(requestWith({ url: 'https://{{host}}/x' }));

    expect(sentParams().url).toBe('https://{{host}}/x');
  });

  it('reports which names could not be resolved', () => {
    const { unresolved } = httpService.applyVariables(
      requestWith({ url: 'https://{{a}}/{{b}}' }),
      vars({ a: 'x' })
    );

    expect(unresolved).toEqual(['b']);
  });

  it('does not mutate the original request', () => {
    const original = requestWith({ url: 'https://{{host}}/x' });
    httpService.applyVariables(original, vars({ host: 'api.test' }));

    expect(original.url).toBe('https://{{host}}/x');
  });
});
