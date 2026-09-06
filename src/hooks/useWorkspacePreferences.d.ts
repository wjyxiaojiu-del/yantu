export interface WorkspacePreferences {
  lastVisitedPath: string | null;
  clickCounts: Record<string, number>;
  lastVisitedAt: Record<string, number>;
  pinnedPaths: string[];
  filterPresets: Record<string, unknown>;
}

export interface NavItem {
  path: string;
  [key: string]: unknown;
}

export interface UseWorkspacePreferencesReturn {
  trackClick: (path: string) => void;
  recordVisit: (path: string) => void;
  getFrequentItems: <T extends NavItem>(allItems: T[], maxAuto?: number) => T[];
  getPinnedItems: <T extends NavItem>(allItems: T[]) => T[];
  pinPath: (path: string) => void;
  unpinPath: (path: string) => void;
  isPinned: (path: string) => boolean;
  saveFilterPreset: (path: string, preset: unknown) => void;
  getFilterPreset: (path: string) => unknown | null;
  getLastVisitedPath: () => string | null;
  setLastVisitedPath: (path: string) => void;
  /** @internal 调试用途 */
  _prefs: WorkspacePreferences;
}

export default function useWorkspacePreferences(role?: string): UseWorkspacePreferencesReturn;
