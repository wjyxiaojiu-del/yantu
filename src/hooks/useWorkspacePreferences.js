import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';

const STORAGE_KEY = 'workspace_preferences';
const CHANGE_EVENT = 'workspace-preferences-change';
const EMPTY_PREFERENCES = {
  pinnedPaths: [],
  clickCounts: {},
  lastVisitedAt: {},
  lastVisitedPath: null,
  filterPresets: {},
};

function getStorageKey(userId, tenantId, role) {
  return `${STORAGE_KEY}_${userId || 'anonymous'}_${tenantId || 'global'}_${role || 'default'}`;
}

function normalizeData(value) {
  return {
    ...EMPTY_PREFERENCES,
    ...(value && typeof value === 'object' ? value : {}),
    pinnedPaths: Array.isArray(value?.pinnedPaths) ? value.pinnedPaths : [],
    clickCounts: value?.clickCounts && typeof value.clickCounts === 'object' ? value.clickCounts : {},
    lastVisitedAt: value?.lastVisitedAt && typeof value.lastVisitedAt === 'object' ? value.lastVisitedAt : {},
    filterPresets: value?.filterPresets && typeof value.filterPresets === 'object' ? value.filterPresets : {},
  };
}

function readData(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return normalizeData(JSON.parse(raw));
  } catch (e) { /* ignore unavailable or invalid local storage */ }
  return normalizeData();
}

function writeData(storageKey, data) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(data));
    queueMicrotask(() => {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { storageKey, data } }));
    });
  } catch (e) { /* ignore unavailable local storage */ }
}

export default function useWorkspacePreferences(role = 'default') {
  const { user } = useAuth();
  const { currentTenant, currentTenantId } = useTenant();
  const userId = user?.id || 'anonymous';
  const tenantId = currentTenant?.id || currentTenantId;
  const scopeReady = !user || Boolean(tenantId);
  const storageKey = useMemo(
    () => getStorageKey(userId, tenantId || 'pending', role),
    [userId, tenantId, role],
  );
  const [data, setData] = useState(() => readData(storageKey));

  useEffect(() => {
    setData(readData(storageKey));
  }, [storageKey]);

  useEffect(() => {
    const handleChange = (event) => {
      if (event.detail?.storageKey === storageKey) {
        setData(normalizeData(event.detail.data));
      }
    };
    const handleStorage = (event) => {
      if (event.key === storageKey) setData(readData(storageKey));
    };
    window.addEventListener(CHANGE_EVENT, handleChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handleChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [storageKey]);

  const update = useCallback((updater) => {
    if (!scopeReady) return;
    setData(() => {
      const latest = readData(storageKey);
      const next = normalizeData({ ...latest, ...updater(latest) });
      writeData(storageKey, next);
      return next;
    });
  }, [scopeReady, storageKey]);

  const trackClick = useCallback((path) => {
    update((prev) => ({
      clickCounts: { ...prev.clickCounts, [path]: (prev.clickCounts[path] || 0) + 1 },
      lastVisitedAt: { ...prev.lastVisitedAt, [path]: Date.now() },
    }));
  }, [update]);

  const recordVisit = useCallback((path) => {
    update((prev) => ({
      lastVisitedPath: path,
      clickCounts: { ...prev.clickCounts, [path]: (prev.clickCounts[path] || 0) + 1 },
      lastVisitedAt: { ...prev.lastVisitedAt, [path]: Date.now() },
    }));
  }, [update]);

  const getFrequentItems = useCallback((allItems, maxAuto = 4) => {
    const pinnedSet = new Set(data.pinnedPaths);
    return allItems
      .filter((item) => !pinnedSet.has(item.path) && (data.clickCounts[item.path] || 0) > 0)
      .sort((a, b) => {
        const countDiff = (data.clickCounts[b.path] || 0) - (data.clickCounts[a.path] || 0);
        if (countDiff !== 0) return countDiff;
        return (data.lastVisitedAt[b.path] || 0) - (data.lastVisitedAt[a.path] || 0);
      })
      .slice(0, maxAuto);
  }, [data]);

  const getPinnedItems = useCallback((allItems) => {
    const pinnedSet = new Set(data.pinnedPaths);
    return allItems.filter((item) => pinnedSet.has(item.path));
  }, [data.pinnedPaths]);

  const pinPath = useCallback((path) => {
    update((prev) => ({
      pinnedPaths: prev.pinnedPaths.includes(path) ? prev.pinnedPaths : [...prev.pinnedPaths, path],
    }));
  }, [update]);

  const unpinPath = useCallback((path) => {
    update((prev) => ({
      pinnedPaths: prev.pinnedPaths.filter((p) => p !== path),
    }));
  }, [update]);

  const isPinned = useCallback((path) => data.pinnedPaths.includes(path), [data.pinnedPaths]);
  const getLastVisitedPath = useCallback(() => data.lastVisitedPath, [data.lastVisitedPath]);
  const setLastVisitedPath = useCallback((path) => update(() => ({ lastVisitedPath: path })), [update]);
  const saveFilterPreset = useCallback((path, preset) => {
    update((prev) => ({
      filterPresets: { ...prev.filterPresets, [path]: preset },
    }));
  }, [update]);
  const getFilterPreset = useCallback((path) => data.filterPresets[path] ?? null, [data.filterPresets]);

  return {
    trackClick,
    recordVisit,
    getFrequentItems,
    getPinnedItems,
    pinPath,
    unpinPath,
    isPinned,
    saveFilterPreset,
    getFilterPreset,
    getLastVisitedPath,
    setLastVisitedPath,
    _prefs: data,
  };
}
