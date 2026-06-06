import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Accessibility plumbing shared by the editor's modal dialogs:
 *  - moves focus into the dialog on open (preferring a `data-autofocus` element),
 *  - traps Tab focus within the dialog,
 *  - closes on Escape,
 *  - restores focus to the trigger element when the dialog unmounts.
 * Attach the returned ref to the dialog container (give it `tabIndex={-1}`).
 */
export function useModalA11y<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  // Keep the latest onClose without re-running the setup effect every render
  // (which would otherwise re-trigger focus handling and bounce focus).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = ref.current;

    const focusables = () =>
      node
        ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
        : [];

    const preferred = node?.querySelector<HTMLElement>("[data-autofocus]");
    (preferred ?? focusables()[0] ?? node)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const items = focusables();
      if (items.length === 0) {
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
    // Set up once on open; onClose is read through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}
