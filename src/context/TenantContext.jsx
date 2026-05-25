import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const TenantContext = createContext(null);

const STORAGE_KEY = 'tenant-id';

export function TenantProvider({ children }) {
  const { user, isLoggedIn } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [currentTenantId, setCurrentTenantId] = useState(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEY) || null;
  });
  const [isLoading, setIsLoading] = useState(false);

  // Sync tenants from auth user
  useEffect(() => {
    if (user?.tenants) {
      setTenants(user.tenants);
      // Auto-select first tenant if none selected
      if (!currentTenantId && user.tenants.length > 0) {
        const firstId = String(user.tenants[0].id);
        setCurrentTenantId(firstId);
        localStorage.setItem(STORAGE_KEY, firstId);
      }
    } else {
      setTenants([]);
    }
  }, [user?.tenants]);

  const currentTenant = tenants.find(t => String(t.id) === String(currentTenantId)) || null;

  const switchTenant = useCallback((tenantId) => {
    const id = String(tenantId);
    setCurrentTenantId(id);
    localStorage.setItem(STORAGE_KEY, id);
    // Reload page to refresh all data with new tenant context
    window.location.reload();
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
      const res = await fetch('/api/tenants/my', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth-token')}` }
      }).then(r => r.json());
      if (res.tenants) {
        setTenants(res.tenants);
      }
    } catch (e) {
      console.error('Failed to refresh tenants:', e);
    } finally {
      setIsLoading(false);
    }
  }, [isLoggedIn]);

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
