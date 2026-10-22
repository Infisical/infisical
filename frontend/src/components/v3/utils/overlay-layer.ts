import * as React from "react";

type OverlayLayerContextValue = {
  isModal: boolean;
  isPending: boolean;
  registerPopup: (
    id: string,
    open: boolean,
    onEscapeKeyDown?: (event: KeyboardEvent) => void
  ) => void;
  markPopupDismissEvent: (event: Event) => void;
};

const OverlayLayerContext = React.createContext<OverlayLayerContextValue | null>(null);

const menuItemFocusReturnTargets = new WeakMap<Element, HTMLElement>();

const registerMenuItemFocusReturn = (item: Element, trigger: HTMLElement | null) => {
  if (trigger) menuItemFocusReturnTargets.set(item, trigger);
};

const getOriginalEvent = (event: Event) =>
  (event as CustomEvent<{ originalEvent?: Event } | undefined>).detail?.originalEvent ?? event;

const useOverlayLayer = (isPending: boolean, isModal = true) => {
  const parentLayer = React.useContext(OverlayLayerContext);
  const isModalLayer = isModal || Boolean(parentLayer?.isModal);
  const isContextPending = isPending || (!isModal && Boolean(parentLayer?.isPending));
  const parentRegisterPopup = parentLayer?.registerPopup;
  const parentMarkPopupDismissEvent = parentLayer?.markPopupDismissEvent;
  const openPopups = React.useRef(new Map<string, ((event: KeyboardEvent) => void) | undefined>());
  const popupDismissEvents = React.useRef(new WeakSet<Event>());
  const focusReturnTarget = React.useRef<HTMLElement | null>(null);

  const markPopupDismissEvent = React.useCallback(
    (event: Event) => {
      const originalEvent = getOriginalEvent(event);
      popupDismissEvents.current.add(originalEvent);
      parentMarkPopupDismissEvent?.(originalEvent);
    },
    [parentMarkPopupDismissEvent]
  );

  const registerPopup = React.useCallback(
    (id: string, open: boolean, onEscapeKeyDown?: (event: KeyboardEvent) => void) => {
      if (!open) {
        openPopups.current.delete(id);
        parentRegisterPopup?.(id, false);
        return;
      }
      const handleEscapeKeyDown = onEscapeKeyDown
        ? (event: KeyboardEvent) => {
            markPopupDismissEvent(event);
            onEscapeKeyDown(event);
          }
        : undefined;
      openPopups.current.set(id, handleEscapeKeyDown);
      parentRegisterPopup?.(id, true, handleEscapeKeyDown);
    },
    [markPopupDismissEvent, parentRegisterPopup]
  );

  const contextValue = React.useMemo(
    () => ({
      isModal: isModalLayer,
      isPending: isContextPending,
      registerPopup,
      markPopupDismissEvent
    }),
    [isModalLayer, isContextPending, registerPopup, markPopupDismissEvent]
  );

  const guardDismiss = <TEvent extends Event>(event: TEvent, handler?: (event: TEvent) => void) => {
    const originalEvent = getOriginalEvent(event);
    if (!popupDismissEvents.current.has(originalEvent) && openPopups.current.size > 0) {
      markPopupDismissEvent(originalEvent);
      const escapeHandlers = Array.from(openPopups.current.values());
      const onEscapeKeyDown = escapeHandlers[escapeHandlers.length - 1];
      if (
        onEscapeKeyDown &&
        originalEvent instanceof KeyboardEvent &&
        originalEvent.key === "Escape"
      ) {
        onEscapeKeyDown(originalEvent);
      }
      event.preventDefault();
      return;
    }
    if (isPending || popupDismissEvents.current.has(originalEvent)) {
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

const useIsInsideModalOverlayLayer = () => Boolean(React.useContext(OverlayLayerContext)?.isModal);

const useOverlayIsPending = () => Boolean(React.useContext(OverlayLayerContext)?.isPending);

const noop = () => undefined;

const useOverlayPopupRegistration = (
  open: boolean,
  onEscapeKeyDown?: (event: KeyboardEvent) => void
) => {
  const layer = React.useContext(OverlayLayerContext);
  const registerPopup = layer?.registerPopup;
  const id = React.useId();
  const escapeHandler = React.useRef(onEscapeKeyDown);
  const hasEscapeHandler = Boolean(onEscapeKeyDown);

  React.useLayoutEffect(() => {
    escapeHandler.current = onEscapeKeyDown;
  });

  const handleEscapeKeyDown = React.useCallback((event: KeyboardEvent) => {
    escapeHandler.current?.(event);
  }, []);

  React.useLayoutEffect(() => {
    if (!open || !registerPopup) return undefined;
    registerPopup(id, true, hasEscapeHandler ? handleEscapeKeyDown : undefined);
    return () => registerPopup(id, false);
  }, [id, open, registerPopup, hasEscapeHandler, handleEscapeKeyDown]);

  return layer?.markPopupDismissEvent ?? noop;
};

export {
  OverlayLayerContext,
  registerMenuItemFocusReturn,
  useIsInsideModalOverlayLayer,
  useOverlayIsPending,
  useOverlayLayer,
  useOverlayPopupRegistration
};
