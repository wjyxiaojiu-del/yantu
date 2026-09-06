import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';

const AuthContext = createContext(null);

const withTenants = (res) => ({ ...res.user, tenants: res.tenants });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const getToken = () => localStorage.getItem('auth-token');
  const setToken = (t) => { if (t) localStorage.setItem('auth-token', t); else localStorage.removeItem('auth-token'); };

  useEffect(() => {
    const startLocalSession = async () => {
      try {
        let data = null;
        if (getToken()) {
          try {
            data = await api.getMe();
          } catch {
            setToken(null);
          }
        }
        if (!data?.user) {
          try {
            data = await api.localSession();
            setToken(data.token);
          } catch {
            data = null;
          }
        }
        setUser(data?.user ? withTenants(data) : null);
      } finally {
        setIsLoading(false);
      }
    };
    startLocalSession();
  }, []);

  // Token 失效时自动重建本地会话。
  useEffect(() => {
    const handler = async () => {
      try {
        const data = await api.localSession();
        setToken(data.token);
        setUser(withTenants(data));
      } catch {
        setUser(null);
      }
    };
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, []);

  const login = async (password) => {
    const data = await api.login('local-owner', password);
    setToken(data.token);
    setUser(withTenants(data));
    return data.user;
  };

  const logout = async () => {
    try { await api.logout(); } catch {}
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
