import { invoke } from '@tauri-apps/api/core';
import type { HttpRequest } from '../domain';
import { credentialFieldOf } from '../domain';

/**
 * How a request credential is written to disk: DPAPI-encrypted for the current Windows
 * user. An object rather than a prefixed string, so an older build reading the file sees
 * an empty password instead of sending ciphertext as one.
 */
export interface SealedCredential {
  dpapi: string;
}

/** A request as it is written to disk, with its credential sealed. */
export type StoredRequest = Omit<HttpRequest, 'auth'> & { auth: Record<string, unknown> };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSealed(value: unknown): value is SealedCredential {
  return isRecord(value) && typeof value.dpapi === 'string';
}

/**
 * Plaintext to ciphertext for values already sealed. Saves run on every edit and on
 * unload; with the credentials unchanged they then need no round trip to the backend.
 */
const sealedCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 500;

async function sealAll(values: string[]): Promise<Map<string, string> | null> {
  const missing = [...new Set(values)].filter((value) => !sealedCache.has(value));

  if (missing.length > 0) {
    try {
      const sealed = await invoke<string[]>('protect_values', { values: missing });
      if (!Array.isArray(sealed) || sealed.length !== missing.length) {
        throw new Error('protect_values returned an unexpected result');
      }
      if (sealedCache.size + missing.length > MAX_CACHE_ENTRIES) sealedCache.clear();
      missing.forEach((value, i) => sealedCache.set(value, sealed[i]));
    } catch (error) {
      console.error('Failed to encrypt request credentials:', error);
      return null;
    }
  }

  return sealedCache;
}

/**
 * Replaces each request's credential with its sealed form. When sealing fails the
 * credential is left out: losing it is recoverable, writing it in the clear is not.
 */
async function sealRequests(requests: HttpRequest[]): Promise<StoredRequest[]> {
  const plaintexts = requests.flatMap((request) => {
    const field = credentialFieldOf(request.auth.type);
    const value = field ? (request.auth as unknown as UnknownRecord)[field] : '';
    return typeof value === 'string' && value ? [value] : [];
  });

  const sealed = plaintexts.length > 0 ? await sealAll(plaintexts) : sealedCache;

  return requests.map((request) => {
    const auth = { ...request.auth } as UnknownRecord;
    const field = credentialFieldOf(auth.type);

    if (field && typeof auth[field] === 'string' && auth[field]) {
      const ciphertext = sealed?.get(auth[field] as string);
      auth[field] = ciphertext ? ({ dpapi: ciphertext } satisfies SealedCredential) : '';
    }

    return { ...request, auth };
  });
}

/**
 * Takes requests as parsed from a file, which may be malformed, and returns them with
 * sealed credentials decrypted. A plaintext credential from before encryption passes
 * through untouched and is sealed by the next save. One that cannot be decrypted, such as
 * a file copied from another Windows account, comes back empty.
 */
async function openRequests(requests: unknown[]): Promise<unknown[]> {
  const sealed: string[] = [];

  for (const request of requests) {
    if (!isRecord(request) || !isRecord(request.auth)) continue;
    const field = credentialFieldOf(request.auth.type);
    const value = field ? request.auth[field] : undefined;
    if (isSealed(value)) sealed.push(value.dpapi);
  }

  let opened: (string | null)[] = [];
  if (sealed.length > 0) {
    try {
      const result = await invoke<(string | null)[]>('unprotect_values', { values: sealed });
      opened = Array.isArray(result) ? result : [];
    } catch (error) {
      console.error('Failed to decrypt request credentials:', error);
    }
  }

  let next = 0;
  return requests.map((request) => {
    if (!isRecord(request) || !isRecord(request.auth)) return request;
    const field = credentialFieldOf(request.auth.type);
    if (!field || !isSealed(request.auth[field])) return request;

    const plaintext = opened[next++];
    if (typeof plaintext !== 'string') {
      console.warn('A saved request credential could not be decrypted and was dropped');
    }
    return { ...request, auth: { ...request.auth, [field]: plaintext ?? '' } };
  });
}

/** Test hook: the cache otherwise carries sealed values from one test into the next. */
export function clearSealedCache(): void {
  sealedCache.clear();
}

export const credentialsService = {
  sealRequests,
  openRequests,
};
