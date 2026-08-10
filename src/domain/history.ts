import type { HttpRequest } from './request';
import type { HttpResponse } from './response';

/**
 * Deliberately body-less. Keeping full response bodies here cost ~5 MB of memory and
 * ~1.7 MB of YAML per entry, for data nothing ever read back.
 */
export interface HistoryResponseSummary {
  status: number;
  statusText: string;
  size: number;
  time: number;
}

export interface HistoryEntry {
  id: string;
  request: HttpRequest;
  response: HistoryResponseSummary;
  timestamp: number; // Unix timestamp in ms
}

export function toHistoryResponseSummary(response: HttpResponse): HistoryResponseSummary {
  return {
    status: response.status,
    statusText: response.statusText,
    size: response.size,
    time: response.time,
  };
}
