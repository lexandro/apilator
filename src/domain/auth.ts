// Auth type options
export type AuthType = 'none' | 'basic' | 'bearer' | 'jwt';

// JWT Algorithm options
/**
 * HMAC only. The asymmetric families need a private key, which the form has no input for,
 * so offering them would mean advertising something the app cannot sign.
 */
export type JwtAlgorithm = 'HS256' | 'HS384' | 'HS512';

export const JWT_ALGORITHMS: JwtAlgorithm[] = ['HS256', 'HS384', 'HS512'];

// JWT target: header or query param
export type JwtTarget = 'header' | 'query';

// No authentication
export interface NoAuthConfig {
  type: 'none';
}

// Basic Auth configuration
export interface BasicAuthConfig {
  type: 'basic';
  username: string;
  password: string;
}

// Bearer Token configuration
export interface BearerAuthConfig {
  type: 'bearer';
  token: string;
}

// JWT Bearer configuration
export interface JwtAuthConfig {
  type: 'jwt';
  algorithm: JwtAlgorithm;
  secret: string;
  secretBase64Encoded: boolean;
  payload: string;           // JSON string, default: "{}"
  headerPrefix: string;      // default: "Bearer"
  jwtHeaders: string;        // JSON string for custom JWT headers, default: "{}"
  target: JwtTarget;
  queryParamName: string;    // default: "token"
}

// Union type for all auth configurations
export type AuthConfig = NoAuthConfig | BasicAuthConfig | BearerAuthConfig | JwtAuthConfig;

// Factory functions
export function createNoAuth(): NoAuthConfig {
  return { type: 'none' };
}

export function createBasicAuth(): BasicAuthConfig {
  return {
    type: 'basic',
    username: '',
    password: '',
  };
}

export function createBearerAuth(): BearerAuthConfig {
  return {
    type: 'bearer',
    token: '',
  };
}

export function createJwtAuth(): JwtAuthConfig {
  return {
    type: 'jwt',
    algorithm: 'HS256',
    secret: '',
    secretBase64Encoded: false,
    payload: '{}',
    headerPrefix: 'Bearer',
    jwtHeaders: '{}',
    target: 'header',
    queryParamName: 'token',
  };
}

export type CredentialField = 'password' | 'token' | 'secret';

/** The field of an auth config that holds its credential, which must not reach a file in the clear. */
export function credentialFieldOf(type: unknown): CredentialField | null {
  switch (type) {
    case 'basic':
      return 'password';
    case 'bearer':
      return 'token';
    case 'jwt':
      return 'secret';
    default:
      return null;
  }
}

/** The same config with its credential blanked, for sharing with someone else. */
export function withoutCredential(auth: AuthConfig): AuthConfig {
  const field = credentialFieldOf(auth.type);
  return field ? ({ ...auth, [field]: '' } as AuthConfig) : auth;
}

/**
 * The Authorization header value this config produces, or null when it produces none.
 * JWT returns null here because signing needs the backend; see httpService.resolveAuth.
 */
export function computeAuthHeader(auth: AuthConfig): string | null {
  switch (auth.type) {
    case 'basic': {
      if (!auth.username && !auth.password) return null;
      return `Basic ${btoa(`${auth.username}:${auth.password}`)}`;
    }
    case 'bearer':
      return auth.token ? `Bearer ${auth.token}` : null;
    case 'jwt':
    case 'none':
    default:
      return null;
  }
}

/** Whether the request will carry an Authorization header at all. */
export function hasAuthHeader(auth: AuthConfig): boolean {
  switch (auth.type) {
    case 'basic':
      return !!(auth.username || auth.password);
    case 'bearer':
      return !!auth.token;
    case 'jwt':
      return auth.target === 'header' && !!auth.secret;
    case 'none':
    default:
      return false;
  }
}

export function getAuthTypeLabel(type: AuthType): string {
  switch (type) {
    case 'basic':
      return 'Basic Auth';
    case 'bearer':
      return 'Bearer Token';
    case 'jwt':
      return 'JWT Bearer';
    case 'none':
    default:
      return 'No Auth';
  }
}
