import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const TenantContext = createContext(null);

const STORAGE_KEY = 'tenant-id';

export function TenantProvider({ children }) {
  const { user, isLoggedIn, isLoading: isAuthLoading } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [currentTenantId, setCurrentTenantId] = useState(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEY) || null;
  });
  const [isLoading, setIsLoading] = useState(false);

  // Sync tenants from auth user
  useEffect(() => {
    if (isAuthLoading) return;

    if (user?.tenants?.length) {
      const nextTenants = user.tenants.map(t => ({
        ...t,
        tenant_role: t.tenant_role || t.my_role,
      }));
      setTenants(nextTenants);

      const currentIsValid = nextTenants.some(t => String(t.id) === String(currentTenantId));
      if (!currentIsValid) {
        const firstId = String(nextTenants[0].id);
        setCurrentTenantId(firstId);
        localStorage.setItem(STORAGE_KEY, firstId);
        if (typeof window !== 'undefined' && window.__apiClearCache) {
          window.__apiClearCache();
        }
      }
    } else {
      setTenants([]);
      setCurrentTenantId(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user, isAuthLoading, currentTenantId]);

  const currentTenant = tenants.find(t => String(t.id) === String(currentTenantId)) || null;

  const switchTenant = useCallback((tenantId) => {
    const id = String(tenantId);
    setCurrentTenantId(id);
    localStorage.setItem(STORAGE_KEY, id);
    // Clear API cache instead of full page reload
    if (typeof window !== 'undefined' && window.__apiClearCache) {
      window.__apiClearCache();
    }
  }, []);

  const clearTenant = useCallback(() => {
    setCurrentTenantId(null);
    localStorage.removeItem(STORAGE_KEY);
    setTenants([]);
  }, []);

  // Fetch fresh tenant list
  const refreshTenants = useCallback(async () => {
    if (!isLoggedIn) return;
    setIsLoading(true);
    try {
      const response = await fetch('/api/tenants/my', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth-token')}` }
      });
      if (!response.ok) throw new Error(`课题组列表加载失败 (${response.status})`);
      const res = await response.json();
      if (res.tenants) {
        const nextTenants = res.tenants.map(t => ({
          ...t,
          tenant_role: t.tenant_role || t.my_role,
        }));
        setTenants(nextTenants);
        if (!nextTenants.some(t => String(t.id) === String(currentTenantId))) {
          const firstId = nextTenants[0] ? String(nextTenants[0].id) : null;
          setCurrentTenantId(firstId);
          if (firstId) localStorage.setItem(STORAGE_KEY, firstId);
          else localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (e) {
      console.error('Failed to refresh tenants:', e);
    } finally {
      setIsLoading(false);
    }
  }, [isLoggedIn, currentTenantId]);

  const value = {
    tenants,
    currentTenantId,
    currentTenant,
    isLoading,
    switchTenant,
    clearTenant,
    refreshTenants,
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}
