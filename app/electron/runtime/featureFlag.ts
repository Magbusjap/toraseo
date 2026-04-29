/**
 * Native Runtime feature flag.
 *
 * Stage 1 keeps the flag off by default so the existing flow
 * (Bridge Mode, idle/site/content/settings layout) continues to
 * work unmodified. Turn the flag on via env var:
 *
 *   TORASEO_NATIVE_RUNTIME=1 npm run dev
 *
 * Persisted user-level toggling (Settings → Native Runtime) is
 * Stage 3 work. Until then, env var is the only switch.
 */

export function isNativeRuntimeEnabled(): boolean {
  const raw = process.env.TORASEO_NATIVE_RUNTIME;
  if (!raw) return true;
  const normalized = raw.trim().toLowerCase();
  return !(
    normalized === "0" ||
    normalized === "false" ||
    normalized === "off"
  );
}
