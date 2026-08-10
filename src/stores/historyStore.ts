import { create } from 'zustand';
import type { HistoryEntry, HttpRequest, HttpResponse } from '../domain';
import { toHistoryResponseSummary } from '../domain';

const MAX_HISTORY_ENTRIES = 50;

// ============================================================
// Store Interface
// ============================================================

interface HistoryState {
  // State
  history: HistoryEntry[];

  // Actions
  addEntry: (request: HttpRequest, response: HttpResponse) => HistoryEntry;
  deleteEntry: (entryId: string) => void;
  clearHistory: () => void;

  // Hydration (from persistence)
  hydrate: (history: HistoryEntry[]) => void;
}

// ============================================================
// Store Creation
// ============================================================

export const useHistoryStore = create<HistoryState>((set) => ({
  // Initial state
  history: [],

  // Actions
  addEntry: (request, response) => {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      request: { ...request },
      response: toHistoryResponseSummary(response),
      timestamp: Date.now(),
    };

    set((state) => {
      const newHistory = [entry, ...state.history];
      if (newHistory.length > MAX_HISTORY_ENTRIES) {
        return { history: newHistory.slice(0, MAX_HISTORY_ENTRIES) };
      }
      return { history: newHistory };
    });

    return entry;
  },

  deleteEntry: (entryId) => {
    set((state) => ({
      history: state.history.filter((e) => e.id !== entryId),
    }));
  },

  clearHistory: () => {
    set({ history: [] });
  },

  // Hydration
  hydrate: (history) => {
    set({ history });
  },
}));
