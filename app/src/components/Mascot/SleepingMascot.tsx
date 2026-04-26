import sleepingMascotUrl from "@branding/mascots/tora-sleeping.svg";

interface SleepingMascotProps {
  className?: string;
}

/**
 * SleepingMascot — Idle status mascot.
 *
 * Загружает SVG напрямую из `branding/mascots/tora-sleeping.svg` через
 * Vite alias `@branding`. Никакого дублирования файлов — single source
 * of truth в branding/.
 *
 * Все 6 поз (sleeping/neutral/focused/happy/surprised/champion) лежат
 * в branding/mascots/. Когда понадобится переключение по статусу —
 * сделаем общий компонент Mascot со status prop'ом.
 */
export default function SleepingMascot({ className }: SleepingMascotProps) {
  return (
    <img
      src={sleepingMascotUrl}
      alt="Спящий маскот Tora"
      className={className}
      draggable={false}
    />
  );
}
