import { ArrowRight } from "lucide-react";

/**
 * IdleSidebar — состояние sidebar до выбора режима работы.
 *
 * Полностью затемнённый блок с центрированным текстом и стрелкой вправо.
 * Никаких видимых элементов меню — overlay полностью скрывает структуру.
 *
 * После выбора режима этот компонент заменяется на ActiveSidebar
 * (Site Audit или Content Audit), привязанный к режиму.
 */
export default function IdleSidebar() {
  return (
    <div className="flex h-full items-center justify-center bg-outline-900/85 px-6 text-center">
      <div className="space-y-6 text-white/95">
        <p className="font-display text-base leading-relaxed">
          Выберите режим
          <br />
          работы
        </p>
        <ArrowRight
          className="mx-auto h-8 w-8 text-primary"
          strokeWidth={2}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
