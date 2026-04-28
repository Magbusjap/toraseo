/**
 * useNativeRuntimeFlag — single hook that reads the feature flag
 * from the main process and reflects it in React state.
 *
 * Stage 1 keeps this dead simple: one IPC call on mount, no live
 * updates. If the flag changes, the user must restart the app.
 *
 * Stage 3 will replace the env-var flag with a Settings toggle
 * and add a subscription channel so the flag can flip at runtime.
 */

import { useEffect, useState } from "react";

export function useNativeRuntimeFlag(): {
  enabled: boolean;
  loading: boolean;
} {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void window.toraseo.runtime
      .isEnabled()
      .then((value) => {
        if (cancelled) return;
        setEnabled(Boolean(value));
        setLoading(false);
      })
      .catch(() => {
        // Defensive: any IPC failure means runtime is unavailable.
        if (cancelled) return;
        setEnabled(false);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { enabled, loading };
}
