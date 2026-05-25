import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const getToken = () => localStorage.getItem('auth-token');
  const setToken = (t) => { if (t) localStorage.setItem('auth-token', t); else localStorage.removeItem('auth-token'); };

  // Restore session on mount
  useEffect(() => {
    const token = getToken();
    if (!token) {
      // 演示模式：自动以默认用户登录
      const demoUser = { id: 1, name: '演示导师', role: 'mentor', phone: '13800138000' };
      setUser(demoUser);
      setToken('demo-token');
      setIsLoading(false);
      return;
    }
    api.getMe()
      .then(data => { if (data.user) setUser(data.user); })
      .catch(() => setToken(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (phone, password) => {
    const res = await api.login(phone, password);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const loginSms = useCallback(async (phone, code) => {
    const res = await api.loginSms(phone, code);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (data) => {
    const res = await api.register(data);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, isLoading, login, loginSms, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
