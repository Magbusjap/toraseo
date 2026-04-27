import sleepingMascotUrl from "@branding/mascots/tora-sleeping.svg";

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
 * All six poses (sleeping/neutral/focused/happy/surprised/champion)
 * live in branding/mascots/. When per-status switching is needed,
 * we'll introduce a generic `Mascot` component that takes a
 * `status` prop.
 */
export default function SleepingMascot({ className }: SleepingMascotProps) {
  return (
    <img
      src={sleepingMascotUrl}
      alt="ToraSEO sleeping mascot"
      className={className}
      draggable={false}
    />
  );
}
