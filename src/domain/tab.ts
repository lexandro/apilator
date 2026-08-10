import type { HttpRequest } from './request';
import type { RequestState } from './response';
import { createEmptyRequest } from './request';

// Predefined tab colors (Windows Terminal style)
export const TAB_COLORS = [
  '#e81123', '#f7630c', '#ffb900', '#16c60c',
  '#0078d4', '#886ce4', '#8764b8', '#e74856',
  '#00b7c3', '#0099bc', '#8e8cd8', '#038387',
  '#00b294', '#567c73', '#647c64', '#7a7574',
] as const;

export type TabColor = typeof TAB_COLORS[number] | null;

// Tab containing request and its state
export interface Tab {
  id: string;
  request: HttpRequest;
  requestState: RequestState;
  isDirty: boolean;
  // Customization
  name?: string;       // Custom name (overrides auto-generated title)
  color?: TabColor;    // Tab accent color
  pinned?: boolean;    // Pinned tabs stay on the left
}

// Factory: Create new tab
export function createTab(): Tab {
  return {
    id: crypto.randomUUID(),
    request: createEmptyRequest(),
    requestState: { status: 'idle' },
    isDirty: false,
    name: undefined,
    color: null,
    pinned: false,
  };
}
