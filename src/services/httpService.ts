import { invoke } from '@tauri-apps/api/core';
import { computeAuthHeader, hasAuthHeader, getAuthTypeLabel, resolveVariables } from '../domain';
import type {
  HttpRequest,
  KeyValuePair,
  RequestState,
  ErrorType,
  ProxyConfigForRequest,
  AuthConfig,
} from '../domain';

// ============================================================
// Rust Backend Types (snake_case for Serde)
// ============================================================

interface RustResponse {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
  size: number;
  time: number;
  http_version: string;
  remote_addr: string | null;
  tls_verified: boolean;
  body_encoding: string;
  truncated: boolean;
}

/**
 * Per-request knobs that come from settings rather than from the request itself.
 * Phase 6 extends this with timeout, max response size and redirect handling.
 */
export interface SendRequestOptions {
  proxy?: ProxyConfigForRequest;
  verifyTls?: boolean;
  timeoutMs?: number;
  maxResponseBytes?: number;
  followRedirects?: boolean;
  sendNoCacheHeader?: boolean;
  /** Environment variables substituted into the request before it is sent. */
  variables?: Map<string, string>;
  httpVersion?: 'HTTP/1.1' | 'HTTP/2';
  /** Pass this to make the request cancellable via cancelRequest. */
  requestId?: string;
}

interface RustError {
  message: string;
  error_type: string;
  code?: string;
}

interface RustFormPart {
  key: string;
  value: string;
  file_path?: string;
  content_type?: string;
}

interface RustProxyConfig {
  mode: string;
  custom_proxy?: {
    url: string;
    use_for_http: boolean;
    use_for_https: boolean;
    username?: string;
    password?: string;
    bypass: string[];
  };
  system_proxy_auth?: {
    username: string;
    password: string;
  };
}

// ============================================================
// Helper Functions
// ============================================================

export interface ResolvedAuth {
  header?: string;
  queryParam?: { name: string; value: string };
}

async function signJwt(auth: Extract<AuthConfig, { type: 'jwt' }>): Promise<string | null> {
  try {
    return await invoke<string>('sign_jwt', {
      params: {
        algorithm: auth.algorithm,
        secret: auth.secret,
        secret_base64_encoded: auth.secretBase64Encoded,
        payload: auth.payload,
        jwt_headers: auth.jwtHeaders,
      },
    });
  } catch (error) {
    console.error('Failed to sign JWT:', error);
    return null;
  }
}

/**
 * Turns an auth config into what actually goes on the wire. Async because JWT signing
 * happens in the backend.
 */
async function resolveAuth(auth: AuthConfig): Promise<ResolvedAuth> {
  if (auth.type !== 'jwt') {
    const header = computeAuthHeader(auth);
    return header ? { header } : {};
  }

  if (!auth.secret) return {};

  const token = await signJwt(auth);
  if (!token) return {};

  if (auth.target === 'query') {
    return { queryParam: { name: auth.queryParamName || 'token', value: token } };
  }

  const prefix = auth.headerPrefix.trim();
  return { header: prefix ? `${prefix} ${token}` : token };
}

/**
 * Convert frontend proxy config to Rust format.
 */
function toRustProxyConfig(config: ProxyConfigForRequest): RustProxyConfig {
  const result: RustProxyConfig = {
    mode: config.mode,
  };

  if (config.customProxy) {
    result.custom_proxy = {
      url: config.customProxy.url,
      use_for_http: config.customProxy.useForHttp,
      use_for_https: config.customProxy.useForHttps,
      username: config.customProxy.username,
      password: config.customProxy.password,
      bypass: config.customProxy.bypass,
    };
  }

  if (config.systemProxyAuth) {
    result.system_proxy_auth = {
      username: config.systemProxyAuth.username,
      password: config.systemProxyAuth.password,
    };
  }

  return result;
}

// ============================================================
// HTTP Service
// ============================================================

/**
 * Send HTTP request via Rust backend.
 */
/**
 * Substitutes environment variables everywhere the user can type: url, header and param
 * keys and values, the raw and form bodies, and the auth fields. Unresolved names are
 * collected so the caller can warn rather than silently sending a literal {{name}}.
 */
export function applyVariables(
  request: HttpRequest,
  values: Map<string, string>
): { request: HttpRequest; unresolved: string[] } {
  if (values.size === 0) return { request, unresolved: [] };

  const unresolved: string[] = [];

  const sub = (text: string): string => {
    const result = resolveVariables(text, values);
    for (const name of result.unresolved) {
      if (!unresolved.includes(name)) unresolved.push(name);
    }
    return result.text;
  };

  const subPairs = <T extends { key: string; value: string }>(pairs: T[]): T[] =>
    pairs.map((pair) => ({ ...pair, key: sub(pair.key), value: sub(pair.value) }));

  const auth = { ...request.auth };
  if (auth.type === 'basic') {
    auth.username = sub(auth.username);
    auth.password = sub(auth.password);
  } else if (auth.type === 'bearer') {
    auth.token = sub(auth.token);
  } else if (auth.type === 'jwt') {
    auth.secret = sub(auth.secret);
    auth.payload = sub(auth.payload);
  }

  return {
    request: {
      ...request,
      url: sub(request.url),
      headers: subPairs(request.headers),
      params: subPairs(request.params),
      auth,
      body: {
        ...request.body,
        raw: { ...request.body.raw, content: sub(request.body.raw.content) },
        formData: subPairs(request.body.formData),
        urlencoded: subPairs(request.body.urlencoded),
      },
    },
    unresolved,
  };
}

async function sendRequest(
  original: HttpRequest,
  options: SendRequestOptions = {}
): Promise<RequestState> {
  const { request } = applyVariables(original, options.variables ?? new Map());

  try {
    // Convert KeyValuePair[] headers to Record<string, string>
    const headers: Record<string, string> = {};
    for (const h of request.headers) {
      if (h.enabled && h.key.trim()) {
        headers[h.key] = h.value;
      }
    }

    if (options.sendNoCacheHeader && !headers['Cache-Control'] && !headers['cache-control']) {
      headers['Cache-Control'] = 'no-cache';
    }

    const manualAuth = !!(headers['Authorization'] || headers['authorization']);
    const resolvedAuth = request.auth ? await resolveAuth(request.auth) : {};

    if (resolvedAuth.header && !manualAuth) {
      headers['Authorization'] = resolvedAuth.header;
    }

    // Build URL with query params
    let url = request.url;
    const searchParams = new URLSearchParams();

    for (const p of request.params) {
      if (p.enabled && p.key.trim()) searchParams.append(p.key, p.value);
    }
    if (resolvedAuth.queryParam) {
      searchParams.append(resolvedAuth.queryParam.name, resolvedAuth.queryParam.value);
    }

    const query = searchParams.toString();
    if (query) {
      url = `${url}${url.includes('?') ? '&' : '?'}${query}`;
    }

    // Prepare body based on type
    let body: string | undefined;
    let formData: RustFormPart[] | undefined;

    if (request.body.type === 'form-data') {
      formData = request.body.formData
        .filter((entry) => entry.enabled && entry.key.trim())
        .map((entry) => ({
          key: entry.key,
          value: entry.value,
          file_path: entry.filePath,
          content_type: entry.contentType,
        }));
      // reqwest sets the multipart Content-Type with its own boundary; a manual one breaks it.
      delete headers['Content-Type'];
      delete headers['content-type'];
    } else if (request.body.type === 'raw') {
      body = request.body.raw.content;
      // Set Content-Type if not already set
      if (!headers['Content-Type'] && !headers['content-type']) {
        const formatToContentType: Record<string, string> = {
          json: 'application/json',
          xml: 'application/xml',
          text: 'text/plain',
          html: 'text/html',
        };
        headers['Content-Type'] = formatToContentType[request.body.raw.format] || 'text/plain';
      }
    } else if (request.body.type === 'x-www-form-urlencoded') {
      const formParams = new URLSearchParams();
      for (const p of request.body.urlencoded) {
        if (p.enabled && p.key.trim()) {
          formParams.append(p.key, p.value);
        }
      }
      body = formParams.toString();
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }

    // Build params for Rust
    const params: Record<string, unknown> = {
      method: request.method,
      url,
      headers,
      body,
      form_data: formData,
      timeout_ms: options.timeoutMs ?? 0,
      verify_tls: options.verifyTls ?? true,
      max_response_bytes: options.maxResponseBytes ?? 0,
      follow_redirects: options.followRedirects ?? true,
      http_version: options.httpVersion ?? 'HTTP/1.1',
      request_id: options.requestId,
    };

    // Add proxy config if provided
    if (options.proxy) {
      params.proxy = toRustProxyConfig(options.proxy);
    }

    // Invoke Rust command
    const result = await invoke<RustResponse>('send_request', { params });

    // Convert response headers from Record to KeyValuePair[]
    const responseHeaders: KeyValuePair[] = Object.entries(result.headers).map(
      ([key, value]) => ({
        id: crypto.randomUUID(),
        key,
        value,
        enabled: true,
      })
    );

    return {
      status: 'success',
      response: {
        status: result.status,
        statusText: result.status_text,
        headers: responseHeaders,
        body: result.body,
        size: result.size,
        time: result.time,
        bodyEncoding: result.body_encoding === 'base64' ? 'base64' : 'utf8',
        truncated: result.truncated,
        networkInfo: {
          httpVersion: result.http_version,
          remoteAddr: result.remote_addr,
          tlsVerified: result.tls_verified,
        },
      },
    };
  } catch (err: unknown) {
    const rustError = err as RustError;
    return {
      status: 'error',
      error: {
        message: rustError.message || 'Unknown error occurred',
        code: rustError.code,
        type: (rustError.error_type as ErrorType) || 'unknown',
      },
    };
  }
}

// ============================================================
// Service Export
// ============================================================

async function cancelRequest(requestId: string): Promise<boolean> {
  try {
    return await invoke<boolean>('cancel_request', { requestId });
  } catch (error) {
    console.error('Failed to cancel request:', error);
    return false;
  }
}

export const httpService = {
  sendRequest,
  applyVariables,
  cancelRequest,
  resolveAuth,
  computeAuthHeader,
  hasAuthHeader,
  getAuthTypeLabel,
};
