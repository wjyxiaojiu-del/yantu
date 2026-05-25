import { createContext, useContext, useState, useEffect, useCallback } from 'react';

export const themes = [
  {
    id: 'warm-orange',
    name: '暖橙',
    description: '温暖活力橙',
    colors: {
      accent: '#ea580c', accentLight: '#f97316', accentDark: '#c2410c',
      accent50: 'rgba(234, 88, 12, 0.05)', accent100: 'rgba(234, 88, 12, 0.10)',
      accent200: 'rgba(234, 88, 12, 0.15)', accent300: 'rgba(234, 88, 12, 0.25)',
      accent400: 'rgba(234, 88, 12, 0.40)',
      bgPage: '#faf5ef', bgGradientFrom: 'rgba(234, 88, 12, 0.04)',
      bgGradientMid: 'rgba(234, 88, 12, 0.03)', bgGradientTo: 'rgba(251, 146, 60, 0.02)',
      sidebarFrom: '#6AB4DC', sidebarTo: '#7ec8e8',
      sidebarAccent: 'rgba(30,100,160,0.15)', sidebarGlow: 'rgba(59,130,246,0.08)',
      textPrimary: '#0f172a',
      cardBorder: 'rgba(234, 88, 12, 0.12)', cardBorderHover: 'rgba(234, 88, 12, 0.15)',
      cardShadow: 'rgba(234, 88, 12, 0.08)', cardShadowHover: 'rgba(234, 88, 12, 0.10)',
      navHover: 'rgba(234, 88, 12, 0.06)', tableHover: 'rgba(234, 88, 12, 0.03)',
      tableLeft: '#ea580c',
      inputFocus: '#fb923c', inputFocusRing: 'rgba(249, 115, 22, 0.10)',
      inputFocusShadow: 'rgba(249, 115, 22, 0.08)',
      selectionBg: '#ea580c',
      textGradientFrom: '#f59e0b', textGradientMid: '#ea580c', textGradientTo: '#dc2626',
      logoFrom: '#f59e0b', logoTo: '#ea580c',
      statBorder: 'rgba(234, 88, 12, 0.15)',
      toastEnterShadow: 'rgba(234, 88, 12, 0.25)', toastEnterOutline: 'rgba(234, 88, 12, 0.40)',
      avatarBorder: '#6AB4DC',
    }
  },
  {
    id: 'nature-classic',
    name: 'Nature',
    description: 'Nature 经典绿',
    colors: {
      accent: '#006633', accentLight: '#2d8a5e', accentDark: '#004d26',
      accent50: 'rgba(0, 102, 51, 0.05)', accent100: 'rgba(0, 102, 51, 0.10)',
      accent200: 'rgba(0, 102, 51, 0.15)', accent300: 'rgba(0, 102, 51, 0.25)',
      accent400: 'rgba(0, 102, 51, 0.40)',
      bgPage: '#f0f5f1', bgGradientFrom: 'rgba(0, 102, 51, 0.04)',
      bgGradientMid: 'rgba(0, 102, 51, 0.03)', bgGradientTo: 'rgba(45, 138, 94, 0.02)',
      sidebarFrom: '#1a5c3a', sidebarTo: '#2d8a5e',
      sidebarAccent: 'rgba(0,60,30,0.20)', sidebarGlow: 'rgba(45,138,94,0.10)',
      textPrimary: '#0f172a',
      cardBorder: 'rgba(0, 102, 51, 0.12)', cardBorderHover: 'rgba(0, 102, 51, 0.15)',
      cardShadow: 'rgba(0, 102, 51, 0.08)', cardShadowHover: 'rgba(0, 102, 51, 0.10)',
      navHover: 'rgba(0, 102, 51, 0.06)', tableHover: 'rgba(0, 102, 51, 0.03)',
      tableLeft: '#006633',
      inputFocus: '#2d8a5e', inputFocusRing: 'rgba(45, 138, 94, 0.10)',
      inputFocusShadow: 'rgba(45, 138, 94, 0.08)',
      selectionBg: '#006633',
      textGradientFrom: '#4ade80', textGradientMid: '#006633', textGradientTo: '#14532d',
      logoFrom: '#4ade80', logoTo: '#006633',
      statBorder: 'rgba(0, 102, 51, 0.15)',
      toastEnterShadow: 'rgba(0, 102, 51, 0.25)', toastEnterOutline: 'rgba(0, 102, 51, 0.40)',
      avatarBorder: '#1a5c3a',
    }
  },
  {
    id: 'nature-chemistry',
    name: 'Nature Chemistry',
    description: '化学蓝',
    colors: {
      accent: '#0055aa', accentLight: '#3388cc', accentDark: '#003d7a',
      accent50: 'rgba(0, 85, 170, 0.05)', accent100: 'rgba(0, 85, 170, 0.10)',
      accent200: 'rgba(0, 85, 170, 0.15)', accent300: 'rgba(0, 85, 170, 0.25)',
      accent400: 'rgba(0, 85, 170, 0.40)',
      bgPage: '#f0f4f8', bgGradientFrom: 'rgba(0, 85, 170, 0.04)',
      bgGradientMid: 'rgba(0, 85, 170, 0.03)', bgGradientTo: 'rgba(51, 136, 204, 0.02)',
      sidebarFrom: '#1a4a7a', sidebarTo: '#3388cc',
      sidebarAccent: 'rgba(0,40,80,0.20)', sidebarGlow: 'rgba(51,136,204,0.10)',
      textPrimary: '#0f172a',
      cardBorder: 'rgba(0, 85, 170, 0.12)', cardBorderHover: 'rgba(0, 85, 170, 0.15)',
      cardShadow: 'rgba(0, 85, 170, 0.08)', cardShadowHover: 'rgba(0, 85, 170, 0.10)',
      navHover: 'rgba(0, 85, 170, 0.06)', tableHover: 'rgba(0, 85, 170, 0.03)',
      tableLeft: '#0055aa',
      inputFocus: '#3388cc', inputFocusRing: 'rgba(51, 136, 204, 0.10)',
      inputFocusShadow: 'rgba(51, 136, 204, 0.08)',
      selectionBg: '#0055aa',
      textGradientFrom: '#60a5fa', textGradientMid: '#0055aa', textGradientTo: '#1e3a8a',
      logoFrom: '#60a5fa', logoTo: '#0055aa',
      statBorder: 'rgba(0, 85, 170, 0.15)',
      toastEnterShadow: 'rgba(0, 85, 170, 0.25)', toastEnterOutline: 'rgba(0, 85, 170, 0.40)',
      avatarBorder: '#1a4a7a',
    }
  },
  {
    id: 'nature-materials',
    name: 'Nature Materials',
    description: '材料紫',
    colors: {
      accent: '#6B2D8E', accentLight: '#9b5bc4', accentDark: '#4a1f66',
      accent50: 'rgba(107, 45, 142, 0.05)', accent100: 'rgba(107, 45, 142, 0.10)',
      accent200: 'rgba(107, 45, 142, 0.15)', accent300: 'rgba(107, 45, 142, 0.25)',
      accent400: 'rgba(107, 45, 142, 0.40)',
      bgPage: '#f5f0f7', bgGradientFrom: 'rgba(107, 45, 142, 0.04)',
      bgGradientMid: 'rgba(107, 45, 142, 0.03)', bgGradientTo: 'rgba(155, 91, 196, 0.02)',
      sidebarFrom: '#5a2478', sidebarTo: '#9b5bc4',
      sidebarAccent: 'rgba(50,15,70,0.20)', sidebarGlow: 'rgba(155,91,196,0.10)',
      textPrimary: '#0f172a',
      cardBorder: 'rgba(107, 45, 142, 0.12)', cardBorderHover: 'rgba(107, 45, 142, 0.15)',
      cardShadow: 'rgba(107, 45, 142, 0.08)', cardShadowHover: 'rgba(107, 45, 142, 0.10)',
      navHover: 'rgba(107, 45, 142, 0.06)', tableHover: 'rgba(107, 45, 142, 0.03)',
      tableLeft: '#6B2D8E',
      inputFocus: '#9b5bc4', inputFocusRing: 'rgba(155, 91, 196, 0.10)',
      inputFocusShadow: 'rgba(155, 91, 196, 0.08)',
      selectionBg: '#6B2D8E',
      textGradientFrom: '#c084fc', textGradientMid: '#6B2D8E', textGradientTo: '#3b0764',
      logoFrom: '#c084fc', logoTo: '#6B2D8E',
      statBorder: 'rgba(107, 45, 142, 0.15)',
      toastEnterShadow: 'rgba(107, 45, 142, 0.25)', toastEnterOutline: 'rgba(107, 45, 142, 0.40)',
      avatarBorder: '#5a2478',
    }
  },
  {
    id: 'nature-energy',
    name: 'Nature Energy',
    description: '能源金',
    colors: {
      accent: '#b8860b', accentLight: '#daa520', accentDark: '#8b6508',
      accent50: 'rgba(184, 134, 11, 0.05)', accent100: 'rgba(184, 134, 11, 0.10)',
      accent200: 'rgba(184, 134, 11, 0.15)', accent300: 'rgba(184, 134, 11, 0.25)',
      accent400: 'rgba(184, 134, 11, 0.40)',
      bgPage: '#faf8f0', bgGradientFrom: 'rgba(184, 134, 11, 0.04)',
      bgGradientMid: 'rgba(184, 134, 11, 0.03)', bgGradientTo: 'rgba(218, 165, 32, 0.02)',
      sidebarFrom: '#8b6914', sidebarTo: '#daa520',
      sidebarAccent: 'rgba(80,55,5,0.20)', sidebarGlow: 'rgba(218,165,32,0.10)',
      textPrimary: '#0f172a',
      cardBorder: 'rgba(184, 134, 11, 0.12)', cardBorderHover: 'rgba(184, 134, 11, 0.15)',
      cardShadow: 'rgba(184, 134, 11, 0.08)', cardShadowHover: 'rgba(184, 134, 11, 0.10)',
      navHover: 'rgba(184, 134, 11, 0.06)', tableHover: 'rgba(184, 134, 11, 0.03)',
      tableLeft: '#b8860b',
      inputFocus: '#daa520', inputFocusRing: 'rgba(218, 165, 32, 0.10)',
      inputFocusShadow: 'rgba(218, 165, 32, 0.08)',
      selectionBg: '#b8860b',
      textGradientFrom: '#fbbf24', textGradientMid: '#b8860b', textGradientTo: '#78350f',
      logoFrom: '#fbbf24', logoTo: '#b8860b',
      statBorder: 'rgba(184, 134, 11, 0.15)',
      toastEnterShadow: 'rgba(184, 134, 11, 0.25)', toastEnterOutline: 'rgba(184, 134, 11, 0.40)',
      avatarBorder: '#8b6914',
    }
  },
];

const STORAGE_KEY = 'mentor-theme';
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem(STORAGE_KEY) || 'warm-orange';
    return 'warm-orange';
  });

  const theme = themes.find(t => t.id === themeId) || themes[0];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, themeId);
    document.documentElement.setAttribute('data-theme', themeId);
    const root = document.documentElement;
    const c = theme.colors;
    const vars = {
      '--accent': c.accent, '--accent-light': c.accentLight, '--accent-dark': c.accentDark,
      '--accent-50': c.accent50, '--accent-100': c.accent100, '--accent-200': c.accent200,
      '--accent-300': c.accent300, '--accent-400': c.accent400,
      '--bg-page': c.bgPage, '--bg-gradient-from': c.bgGradientFrom,
      '--bg-gradient-mid': c.bgGradientMid, '--bg-gradient-to': c.bgGradientTo,
      '--sidebar-from': c.sidebarFrom, '--sidebar-to': c.sidebarTo,
      '--sidebar-accent': c.sidebarAccent, '--sidebar-glow': c.sidebarGlow,
      '--text-primary': c.textPrimary,
      '--card-border': c.cardBorder, '--card-border-hover': c.cardBorderHover,
      '--card-shadow': c.cardShadow, '--card-shadow-hover': c.cardShadowHover,
      '--nav-hover': c.navHover, '--table-hover': c.tableHover, '--table-left': c.tableLeft,
      '--input-focus': c.inputFocus, '--input-focus-ring': c.inputFocusRing,
      '--input-focus-shadow': c.inputFocusShadow, '--selection-bg': c.selectionBg,
      '--text-gradient-from': c.textGradientFrom, '--text-gradient-mid': c.textGradientMid,
      '--text-gradient-to': c.textGradientTo,
      '--logo-from': c.logoFrom, '--logo-to': c.logoTo,
      '--stat-border': c.statBorder,
      '--toast-enter-shadow': c.toastEnterShadow, '--toast-enter-outline': c.toastEnterOutline,
      '--avatar-border': c.avatarBorder,
    };
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  }, [themeId, theme]);

  const switchTheme = useCallback((id) => setThemeId(id), []);

  return (
    <ThemeContext.Provider value={{ theme, themeId, switchTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
