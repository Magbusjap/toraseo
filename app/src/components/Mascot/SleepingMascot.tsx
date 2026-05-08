import Mascot from "./Mascot";

interface SleepingMascotProps {
  className?: string;
}

/**
 * SleepingMascot — the Idle-status mascot.
 *
 * Loads the SVG directly from `branding/mascots/tora-sleeping.svg`
 * via the Vite alias `@branding`. No file duplication — single
 * source of truth in branding/.
 *
 * Kept as a tiny compatibility wrapper around the generic Mascot
 * component for older screens that still ask for the sleeping pose.
 */
export default function SleepingMascot({ className }: SleepingMascotProps) {
  return <Mascot mood="sleeping" className={className} />;
}
