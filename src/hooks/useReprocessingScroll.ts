import { useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Only entries involved in reprocessing participate; ordinary route behavior stays native.
const positions = new Map<string, { x: number; y: number }>();

export function rememberReprocessingScroll(key: string) {
  positions.set(key, { x: window.scrollX, y: window.scrollY });
}

export function useSavedEditorScroll(editor: RefObject<HTMLFormElement | null>, originalId: string | null) {
  const { key } = useLocation();
  const navigation = useNavigationType();
  const positioned = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (originalId === null || !editor.current) return;
    const previousRestoration = window.history.scrollRestoration;
    // Prevent native reload restoration from overriding the editor anchor.
    // Restore native behavior when leaving saved-original mode.
    window.history.scrollRestoration = "manual";
    const entry = JSON.stringify([key, originalId]);
    if (positioned.current !== entry) {
      const previousPosition = navigation === "POP" ? positions.get(key) : undefined;
      if (previousPosition) {
        window.scrollTo({ left: previousPosition.x, top: previousPosition.y, behavior: "instant" });
      } else {
        const header = document.querySelector("header");
        const headerPosition = header ? window.getComputedStyle(header).position : "";
        const headerHeight = header && ["fixed", "sticky"].includes(headerPosition) ? header.getBoundingClientRect().height : 0;
        const margin = Number.parseFloat(window.getComputedStyle(editor.current).scrollMarginTop) || 24;
        window.scrollTo({ top: window.scrollY + editor.current.getBoundingClientRect().top - headerHeight - margin, left: 0, behavior: "instant" });
      }
      positioned.current = entry;
      rememberReprocessingScroll(key);
    }
    const remember = () => rememberReprocessingScroll(key);
    window.addEventListener("scroll", remember, { passive: true });
    return () => {
      window.removeEventListener("scroll", remember);
      window.history.scrollRestoration = previousRestoration;
    };
  }, [editor, key, navigation, originalId]);
}

export function useRestoreReprocessingScroll(ready: boolean) {
  const { key } = useLocation();
  const navigation = useNavigationType();
  const restored = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!ready || navigation !== "POP" || restored.current === key) return;
    const position = positions.get(key);
    if (!position) return;
    // History loads asynchronously; restore only after its cards can support the offset.
    window.scrollTo({ left: position.x, top: position.y, behavior: "instant" });
    restored.current = key;
  }, [ready, key, navigation]);
}
