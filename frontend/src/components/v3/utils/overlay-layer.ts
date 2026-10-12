import * as React from "react";

type OverlayLayerContextValue = {
  isPending: boolean;
  registerPopup: (id: string, open: boolean) => void;
  markPopupDismissEvent: (event: Event) => void;
};

const OverlayLayerContext = React.createContext<OverlayLayerContextValue | null>(null);

const menuItemFocusReturnTargets = new WeakMap<Element, HTMLElement>();

const registerMenuItemFocusReturn = (item: Element, trigger: HTMLElement | null) => {
  if (trigger) menuItemFocusReturnTargets.set(item, trigger);
};

const getOriginalEvent = (event: Event) =>
  (event as CustomEvent<{ originalEvent?: Event } | undefined>).detail?.originalEvent ?? event;

const useOverlayLayer = (isPending: boolean) => {
  const openPopups = React.useRef(new Set<string>());
  const popupDismissEvents = React.useRef(new WeakSet<Event>());
  const focusReturnTarget = React.useRef<HTMLElement | null>(null);

  const registerPopup = React.useCallback((id: string, open: boolean) => {
    if (open) openPopups.current.add(id);
    else openPopups.current.delete(id);
  }, []);

  const markPopupDismissEvent = React.useCallback((event: Event) => {
    popupDismissEvents.current.add(event);
  }, []);

  const contextValue = React.useMemo(
    () => ({ isPending, registerPopup, markPopupDismissEvent }),
    [isPending, registerPopup, markPopupDismissEvent]
  );

  const guardDismiss = <TEvent extends Event>(event: TEvent, handler?: (event: TEvent) => void) => {
    if (
      isPending ||
      openPopups.current.size > 0 ||
      popupDismissEvents.current.has(getOriginalEvent(event))
    ) {
      event.preventDefault();
      return;
    }
    handler?.(event);
  };

  const captureFocusReturn = (event: Event, handler?: (event: Event) => void) => {
    const opener = document.activeElement;
    focusReturnTarget.current =
      opener instanceof HTMLElement && opener !== opener.ownerDocument.body
        ? (menuItemFocusReturnTargets.get(opener) ?? opener)
        : null;
    handler?.(event);
  };

  const restoreFocusReturn = (event: Event, handler?: (event: Event) => void) => {
    handler?.(event);
    const target = focusReturnTarget.current;
    focusReturnTarget.current = null;
    if (event.defaultPrevented || !target?.isConnected) return;
    event.preventDefault();
    target.focus();
  };

  return { contextValue, guardDismiss, captureFocusReturn, restoreFocusReturn };
};

const useIsInsideOverlayLayer = () => React.useContext(OverlayLayerContext) !== null;

const useOverlayIsPending = () => Boolean(React.useContext(OverlayLayerContext)?.isPending);

const noop = () => undefined;

const useOverlayPopupRegistration = (open: boolean) => {
  const layer = React.useContext(OverlayLayerContext);
  const registerPopup = layer?.registerPopup;
  const id = React.useId();

  React.useLayoutEffect(() => {
    if (!open || !registerPopup) return undefined;
    registerPopup(id, true);
    return () => registerPopup(id, false);
  }, [id, open, registerPopup]);

  return layer?.markPopupDismissEvent ?? noop;
};

export {
  OverlayLayerContext,
  registerMenuItemFocusReturn,
  useIsInsideOverlayLayer,
  useOverlayIsPending,
  useOverlayLayer,
  useOverlayPopupRegistration
};
