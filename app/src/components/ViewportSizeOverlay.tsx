import { useEffect, useRef } from "react";

interface WindowSize {
  width: number;
  height: number;
}

const TOP_TOOLBAR_HEIGHT_PX = 36;
const OVERLAY_GAP_PX = 15;
const WINDOW_OVERLAY_RIGHT_GAP_PX = 20;

export function WindowSizeOverlay({
  toolbarOffset = TOP_TOOLBAR_HEIGHT_PX,
}: {
  toolbarOffset?: number;
}): React.ReactNode {
  const timerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    const show = () => {
      const size = readWindowSize();
      const overlay = ensureWindowSizeOverlay();
      overlay.textContent = `${size.width}px x ${size.height}px`;
      overlay.style.right = `${WINDOW_OVERLAY_RIGHT_GAP_PX}px`;
      overlay.style.top = `${toolbarOffset + OVERLAY_GAP_PX}px`;
      overlay.style.opacity = "1";
      overlay.style.transform = "translateY(0)";
      removeLegacyWindowSizeOverlays(overlay);
      scheduleLegacyWindowSizeOverlayCleanup(overlay);

      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        overlay.style.opacity = "0";
        overlay.style.transform = "translateY(-4px)";
        timerRef.current = null;
      }, 1600);
    };

    observerRef.current = new MutationObserver(() => {
      removeLegacyWindowSizeOverlays(getWindowSizeOverlay());
    });
    observerRef.current.observe(document.body, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });

    window.addEventListener("resize", show);
    return () => {
      window.removeEventListener("resize", show);
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [toolbarOffset]);

  return null;
}

export function SidebarWidthOverlay({
  width,
  visible,
  toolbarOffset = TOP_TOOLBAR_HEIGHT_PX,
}: {
  width: number;
  visible: boolean;
  toolbarOffset?: number;
}): React.ReactNode {
  if (!visible) return null;
  const height = readWindowSize().height;

  return (
    <div
      className="pointer-events-none fixed z-[80] whitespace-nowrap font-mono text-xs font-semibold text-outline-900/55"
      style={{
        left: width + OVERLAY_GAP_PX,
        top: toolbarOffset + OVERLAY_GAP_PX,
      }}
    >
      {Math.round(width)}px / {height}px
    </div>
  );
}

function readWindowSize(): WindowSize {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function getWindowSizeOverlay(): HTMLDivElement | null {
  return document.getElementById(
    "toraseo-window-size-overlay",
  ) as HTMLDivElement | null;
}

function ensureWindowSizeOverlay(): HTMLDivElement {
  const existing = getWindowSizeOverlay();
  if (existing) return existing;

  const overlay = document.createElement("div");
  overlay.id = "toraseo-window-size-overlay";
  overlay.dataset.toraseoSizeOverlay = "window";
  overlay.className =
    "pointer-events-none fixed z-[80] whitespace-nowrap font-mono text-xs font-semibold text-outline-900/55";
  overlay.style.opacity = "0";
  overlay.style.transform = "translateY(-4px)";
  overlay.style.transition = "opacity 140ms ease, transform 140ms ease";
  document.body.appendChild(overlay);
  return overlay;
}

function removeLegacyWindowSizeOverlays(current: HTMLDivElement | null): void {
  const sizeTextPattern = /^\d+px\s*x\s*\d+px$/;
  document.querySelectorAll("body *").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node === current) return;
    if (current?.contains(node) || node.contains(current)) return;
    if (node.dataset.toraseoSizeOverlay === "window") {
      node.remove();
      return;
    }

    const text = (node.textContent ?? "").trim().replace(/\s+/g, " ");
    if (sizeTextPattern.test(text)) {
      node.remove();
    }
  });
}

function scheduleLegacyWindowSizeOverlayCleanup(
  current: HTMLDivElement,
): void {
  const delays = [0, 16, 80, 250, 900, 1500];
  delays.forEach((delay) => {
    window.setTimeout(() => {
      removeLegacyWindowSizeOverlays(current);
    }, delay);
  });
}
