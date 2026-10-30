import * as React from "react";

export const OverlayPendingContext = React.createContext(false);

export const useOverlayPending = () => React.useContext(OverlayPendingContext);

const isToastTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest("[data-sonner-toaster], [data-slot='toast-stack']"));

// Toasts portal outside the modal layer, so a click on one would otherwise dismiss the overlay.
export function useDismissGuard<
  Outside extends Event & { target: EventTarget | null },
  Interact extends Event & { target: EventTarget | null }
>(
  pending: boolean,
  handlers: {
    onEscapeKeyDown: (event: KeyboardEvent) => void;
    onPointerDownOutside?: (event: Outside) => void;
    onInteractOutside?: (event: Interact) => void;
  }
) {
  const outside =
    <Target extends Event & { target: EventTarget | null }>(handler?: (event: Target) => void) =>
    (event: Target) => {
      if (pending || isToastTarget(event.target)) {
        event.preventDefault();
        return;
      }
      handler?.(event);
    };
  return {
    onEscapeKeyDown: (event: KeyboardEvent) => {
      if (pending) {
        event.preventDefault();
        return;
      }
      handlers.onEscapeKeyDown(event);
    },
    onPointerDownOutside: outside(handlers.onPointerDownOutside),
    onInteractOutside: outside(handlers.onInteractOutside)
  };
}
