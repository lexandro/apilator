import type { KeyValuePair } from './request';

// Network connection info
export interface NetworkInfo {
  httpVersion: string;
  remoteAddr: string | null;
  tlsVerified: boolean;
}

// HTTP response from server
export type BodyEncoding = 'utf8' | 'base64';

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: KeyValuePair[];
  /** Text when bodyEncoding is utf8, base64 of the raw bytes otherwise. */
  body: string;
  bodyEncoding: BodyEncoding;
  /** True when the response hit the configured size limit and was cut short. */
  truncated: boolean;
  size: number; // bytes
  time: number; // milliseconds
  networkInfo: NetworkInfo;
}

// Error type categorization
export type ErrorType = 'network' | 'timeout' | 'parse' | 'cancelled' | 'unknown';

// Error during request
export interface ResponseError {
  message: string;
  code?: string;
  type?: ErrorType;
}

// Request state as discriminated union
export type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; response: HttpResponse }
  | { status: 'error'; error: ResponseError };
