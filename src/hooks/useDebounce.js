import { useRef, useCallback } from 'react';

export function useDebounce(fn, delay = 300) {
  const timer = useRef(null);
  return useCallback((...args) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

export function useThrottle(fn, interval = 1000) {
  const last = useRef(0);
  return useCallback((...args) => {
    const now = Date.now();
    if (now - last.current >= interval) {
      last.current = now;
      fn(...args);
    }
  }, [fn, interval]);
}
