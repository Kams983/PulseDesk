import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import ToastStack from '@/components/ui/Toast';

const ToastContext = createContext(null);

// long enough to read a short sentence, short enough not to need closing by hand
const DISMISS_MS = 4000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (variant, message) => {
      nextId.current += 1;
      const id = nextId.current;

      setToasts((current) => [...current, { id, variant, message }]);
      setTimeout(() => dismiss(id), DISMISS_MS);
    },
    [dismiss]
  );

  const toast = useMemo(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
    }),
    [push]
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used inside ToastProvider');
  }

  return context;
}
