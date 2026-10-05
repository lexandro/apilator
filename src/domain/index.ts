// ============================================================
// Auth
// ============================================================
export type {
  AuthType,
  AuthConfig,
  NoAuthConfig,
  BasicAuthConfig,
  BearerAuthConfig,
  JwtAuthConfig,
  JwtAlgorithm,
  JwtTarget,
  CredentialField,
} from './auth';
export {
  createNoAuth,
  createBasicAuth,
  createBearerAuth,
  createJwtAuth,
  JWT_ALGORITHMS,
  computeAuthHeader,
  hasAuthHeader,
  getAuthTypeLabel,
  credentialFieldOf,
  withoutCredential,
} from './auth';

// ============================================================
// Request
// ============================================================
export type {
  HttpMethod,
  KeyValuePair,
  BodyType,
  RawFormat,
  RequestBody,
  FormDataEntry,
  HttpRequest,
} from './request';
export { createEmptyRequest, createKeyValuePair, createFormDataEntry } from './request';

// ============================================================
// Response
// ============================================================
export type { HttpResponse, NetworkInfo, ResponseError, RequestState, ErrorType, BodyEncoding } from './response';

// ============================================================
// Tab
// ============================================================
export type { Tab, TabColor } from './tab';
export { createTab, TAB_COLORS } from './tab';

// ============================================================
// History
// ============================================================
export type { HistoryEntry, HistoryResponseSummary } from './history';
export { toHistoryResponseSummary } from './history';

// ============================================================
// Settings
// ============================================================
export type {
  ThemeId,
  ThemeMode,
  ThemeDefinition,
  ThemeSettings,
  CustomProxyConfig,
  ProxySettings,
  ProxyConfigForRequest,
  HttpVersion,
  GeneralSettings,
} from './settings';
export {
  THEMES,
  DEFAULT_THEME_SETTINGS,
  DEFAULT_PROXY_SETTINGS,
  DEFAULT_GENERAL_SETTINGS,
} from './settings';

// ============================================================
// Collections
// ============================================================
export type {
  Collection,
  CollectionNode,
  CollectionFolderNode,
  CollectionRequestNode,
  NodeLocation,
  MoveResult,
  MoveRejection,
} from './collection';
export {
  createCollection,
  createFolder,
  createRequestNode,
  findNode,
  findContainer,
  collectSubtreeIds,
  insertNode,
  removeNode,
  renameNode,
  setFolderCollapsed,
  updateRequestNode,
  moveNode,
  listRequests,
} from './collection';

// ============================================================
// Environments
// ============================================================
export type { Environment, EnvVariable, ResolutionResult } from './environment';
export {
  createEnvironment,
  createEnvVariable,
  secretKeyFor,
  variableMap,
  resolveVariables,
  findPlaceholders,
} from './environment';

// ============================================================
// OpenAPI import
// ============================================================
export type { OpenApiImportResult } from './openApi';
export {
  isOpenApiSpec,
  collectionFromOpenApi,
  pathToTemplate,
  baseUrlOf,
  exampleForSchema,
} from './openApi';
