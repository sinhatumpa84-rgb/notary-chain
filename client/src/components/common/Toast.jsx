import React, { useEffect } from 'react';
import { Toaster, ToastBar, toast, useToasterStore } from 'react-hot-toast';
import { useTheme } from '../../hooks/useTheme';

// Standard temporary notification timing: ~1.5s, errors slightly longer (~1.8s)
export const TOAST_DURATION_DEFAULT = 1500;
export const TOAST_DURATION_ERROR = 1800;
export const TOAST_STACK_LIMIT = 2; // Keep max 2 notifications visible to prevent covering dashboard content

// Global toast interceptor to ensure all notifications adhere to the 1.5–1.8s timing
if (typeof window !== 'undefined' && !window.__toast_clamped) {
  window.__toast_clamped = true;

  const clampOptions = (opts, defaultDur = TOAST_DURATION_DEFAULT) => {
    if (!opts) return { duration: defaultDur };
    // If a component passed an overly long duration (e.g., 4000ms or 5000ms), clamp to standard temporary duration
    const dur = opts.duration && opts.duration > 2000 ? defaultDur : (opts.duration || defaultDur);
    return { ...opts, duration: dur };
  };

  const origSuccess = toast.success;
  const origError = toast.error;

  toast.success = (msg, opts) => origSuccess(msg, clampOptions(opts, TOAST_DURATION_DEFAULT));
  toast.error = (msg, opts) => origError(msg, clampOptions(opts, TOAST_DURATION_ERROR));
  
  // Custom helpers for info and warning if called
  toast.info = (msg, opts) => toast(msg, { ...clampOptions(opts, TOAST_DURATION_DEFAULT), icon: 'ℹ️' });
  toast.warning = (msg, opts) => toast(msg, { ...clampOptions(opts, TOAST_DURATION_DEFAULT), icon: '⚠️' });
}

export const ToastProvider = () => {
  const { isDark } = useTheme();
  const { toasts } = useToasterStore();

  // Lifecycle control: Dismiss older notifications when stack limit is exceeded
  useEffect(() => {
    toasts
      .filter((t) => t.visible)
      .filter((_, idx) => idx >= TOAST_STACK_LIMIT)
      .forEach((t) => toast.dismiss(t.id));
  }, [toasts]);

  return (
    <Toaster
      position="top-right"
      gutter={8}
      containerStyle={{
        top: 20,
        right: 20,
        zIndex: 99999,
        pointerEvents: 'none',
      }}
      toastOptions={{
        duration: TOAST_DURATION_DEFAULT,
        removeDelay: 300, // Remove from DOM immediately after 250ms exit animation
        style: {
          pointerEvents: 'auto',
          background: isDark ? '#1E293B' : '#FFFFFF',
          color: isDark ? '#F8FAFC' : '#2E2A26',
          border: `1px solid ${isDark ? '#334155' : '#E8E2DA'}`,
          boxShadow: isDark
            ? '0 8px 24px -4px rgba(0, 0, 0, 0.45), 0 4px 8px -2px rgba(0, 0, 0, 0.3)'
            : '0 8px 20px -3px rgba(46, 42, 38, 0.12), 0 3px 6px -2px rgba(46, 42, 38, 0.08)',
          borderRadius: '12px',
          fontSize: '13px',
          fontWeight: '500',
          padding: '10px 16px',
          maxWidth: '380px',
        },
        success: {
          duration: TOAST_DURATION_DEFAULT,
          iconTheme: { primary: '#2D6A4F', secondary: '#FFFFFF' },
        },
        error: {
          duration: TOAST_DURATION_ERROR,
          iconTheme: { primary: '#DC2626', secondary: '#FFFFFF' },
        },
      }}
    >
      {(t) => (
        <ToastBar
          toast={t}
          style={{
            ...t.style,
            cursor: 'pointer',
            animation: t.visible
              ? 'toastEnter 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards'
              : 'toastExit 0.25s cubic-bezier(0.4, 0, 1, 1) forwards',
          }}
        >
          {({ icon, message }) => (
            <div
              onClick={() => toast.dismiss(t.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}
              title="Click to dismiss"
            >
              {icon}
              <div style={{ flex: 1, minWidth: 0 }}>{message}</div>
            </div>
          )}
        </ToastBar>
      )}
    </Toaster>
  );
};

export const showSuccess = (msg) => toast.success(msg);
export const showError = (msg) => toast.error(msg);
export const showInfo = (msg) => toast(msg, { icon: 'ℹ️', duration: TOAST_DURATION_DEFAULT });
export const showWarning = (msg) => toast(msg, { icon: '⚠️', duration: TOAST_DURATION_DEFAULT });

export default ToastProvider;
