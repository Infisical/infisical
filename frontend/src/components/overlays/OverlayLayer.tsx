import {
  ComponentPropsWithoutRef,
  ComponentType,
  createContext,
  forwardRef,
  ReactNode,
  useCallback,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";

const PortalContainerContext = createContext<HTMLElement | null | undefined>(undefined);
const ModalContainerContext = createContext<{
  container: HTMLElement | null;
  retain: () => () => void;
} | null>(null);

export const usePortalContainer = () => useContext(PortalContainerContext);

// Keep portal descendants inside Radix's focus/aria/scroll boundary, but outside the
// positioned, animated panel. A transform or overflow on this scope would break that escape.
export const LayerContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<"div"> & {
    exitDuration?: number;
    "data-state"?: string;
    "data-slot"?: string;
    "data-size"?: string;
  }
>(({ children, className, style, exitDuration = 100, ...props }, forwardedRef) => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const setRef = useCallback((element: HTMLDivElement | null) => {
    containerRef.current = element;
    setContainer(element);
  }, []);
  useImperativeHandle(forwardedRef, () => containerRef.current!, []);
  return (
    <div
      {...props}
      data-slot="overlay-content-scope"
      className="overlay-content-scope"
      style={{ pointerEvents: style?.pointerEvents, animationDuration: `${exitDuration}ms` }}
      ref={setRef}
    >
      <PortalContainerContext.Provider value={container}>
        <div
          data-slot={props["data-slot"]}
          data-state={props["data-state"]}
          data-size={props["data-size"]}
          className={className}
          style={style}
        >
          {children}
        </div>
      </PortalContainerContext.Provider>
    </div>
  );
});
LayerContent.displayName = "LayerContent";

function useLayerHost(active: boolean, layer: "modal" | "toast") {
  const parent = usePortalContainer();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!active || (parent === null && layer !== "toast")) return undefined;
    const container = layer === "toast" ? document.body : (parent ?? document.body);
    const element = hostRef.current ?? container.ownerDocument.createElement("div");
    element.dataset.overlayLayer = layer;
    element.className = "overlay-layer-root";
    // Opening order is authoritative for sibling dialogs, even when their roots stay mounted.
    container.appendChild(element);
    hostRef.current = element;
    setHost(element);
    return undefined;
  }, [active, layer, parent]);

  useLayoutEffect(() => {
    if (active || !host) return undefined;
    const removeEmptyHost = () => {
      // Radix owns exit presence. Keep its portal container until the last exiting child leaves.
      if (host.childElementCount === 0) {
        host.remove();
        hostRef.current = null;
        setHost(null);
      }
    };
    const observer = new MutationObserver(removeEmptyHost);
    observer.observe(host, { childList: true });
    removeEmptyHost();
    return () => observer.disconnect();
  }, [active, host]);

  useLayoutEffect(() => () => hostRef.current?.remove(), []);
  return host;
}

type ModalLayerProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: (props: { open: boolean; onOpenChange: (open: boolean) => void }) => ReactNode;
};

export function ModalLayer({ open, defaultOpen, onOpenChange, children }: ModalLayerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen ?? false);
  const [retainedPortals, setRetainedPortals] = useState(0);
  const isOpen = open ?? uncontrolledOpen;
  const host = useLayerHost(isOpen || retainedPortals > 0, "modal");
  const retain = useCallback(() => {
    setRetainedPortals((count) => count + 1);
    return () => setRetainedPortals((count) => count - 1);
  }, []);
  const context = useMemo(() => ({ container: host, retain }), [host, retain]);
  return (
    <ModalContainerContext.Provider value={context}>
      {children({
        open: isOpen,
        onOpenChange: (nextOpen) => {
          if (open === undefined) setUncontrolledOpen(nextOpen);
          onOpenChange?.(nextOpen);
        }
      })}
    </ModalContainerContext.Provider>
  );
}

type LayerPortalProps = {
  portal: ComponentType<{
    children?: ReactNode;
    container?: Element | DocumentFragment | null;
    forceMount?: true;
  }>;
  children?: ReactNode;
  container?: Element | DocumentFragment | null;
  forceMount?: true;
  modal?: boolean;
};

export function LayerPortal({
  portal: Portal,
  modal = false,
  container,
  forceMount,
  children,
  ...props
}: LayerPortalProps) {
  const parent = usePortalContainer();
  const modalContext = useContext(ModalContainerContext);
  useLayoutEffect(() => {
    if (modal && forceMount) return modalContext?.retain();
    return undefined;
  }, [modal, forceMount, modalContext?.retain]);
  const modalHost = modalContext?.container;
  if (modal && !modalHost) return null;
  if (!modal && parent === null && !container) return null;
  const target = container ?? (modal ? modalHost : parent);
  return (
    <PortalContainerContext.Provider
      value={typeof HTMLElement !== "undefined" && target instanceof HTMLElement ? target : parent}
    >
      <Portal container={target} forceMount={forceMount} {...props}>
        {children}
      </Portal>
    </PortalContainerContext.Provider>
  );
}

export function ToastLayer({ children }: { children: ReactNode }) {
  const host = useLayerHost(true, "toast");
  if (!host) return null;
  return createPortal(
    <PortalContainerContext.Provider value={host}>{children}</PortalContainerContext.Provider>,
    host
  );
}
