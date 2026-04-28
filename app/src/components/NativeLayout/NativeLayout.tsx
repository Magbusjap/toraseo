/**
 * NativeLayout — three-column workspace for native runtime mode.
 *
 *   ┌──────────────┬────────────────────────────┬──────────────────────┐
 *   │  Sidebar     │   AI Chat (center)         │   Analysis Results   │
 *   │  (existing)  │   (new — ChatPanel)        │   (new — Analysis)   │
 *   └──────────────┴────────────────────────────┴──────────────────────┘
 *
 * Stage 1 keeps the sidebar reused from the existing app shell so
 * we don't fork two parallel sidebars while migration is in flight.
 * The chat and analysis columns are skeletons — see ChatPanel.tsx
 * and AnalysisPanel.tsx.
 *
 * The wider window minimum (1280px) is enforced via Tailwind
 * `min-w-` on the outer container; the existing main window is
 * already 1100px and Stage 3 will bump the BrowserWindow defaults.
 */

import { ChatPanel } from "../Chat";
import { AnalysisPanel } from "../Analysis";
import type { SupportedLocale } from "../../types/ipc";

interface NativeLayoutProps {
  /** Renderer of the left column — usually one of the existing sidebars. */
  sidebar: React.ReactNode;
  /** Active UI locale forwarded into the chat panel. */
  locale: SupportedLocale;
}

export default function NativeLayout({ sidebar, locale }: NativeLayoutProps) {
  return (
    <div className="flex h-full min-w-[1280px] flex-1 overflow-hidden">
      <aside className="relative w-[260px] shrink-0">{sidebar}</aside>

      <div className="flex flex-1 min-w-0">
        <div className="flex-1 min-w-[420px]">
          <ChatPanel locale={locale} />
        </div>
        <div className="w-[420px] shrink-0">
          <AnalysisPanel />
        </div>
      </div>
    </div>
  );
}
