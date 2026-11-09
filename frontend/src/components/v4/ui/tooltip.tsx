import * as React from "react";
import { flushSync } from "react-dom";
import { Slot, Tooltip as TooltipPrimitive } from "radix-ui";

import { useV4CollisionBoundary, useV4PortalContainer } from "@app/components/v4/scope";

import { cn } from "../lib/utils";
import { Kbd } from "./kbd";

import controls from "./controls.module.css";
import menu from "./menu.module.css";

const navigationKeys = new Set([
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End"
]);
let lastNavigationKeyAt = -Infinity;
if (typeof document !== "undefined") {
  document.addEventListener(
    "keydown",
    (event) => {
      lastNavigationKeyAt = navigationKeys.has(event.key) ? performance.now() : -Infinity;
    },
    true
  );
  document.addEventListener(
    "pointerdown",
    () => {
      lastNavigationKeyAt = -Infinity;
    },
    true
  );
}
const focusedByKeyboard = () => performance.now() - lastNavigationKeyAt < 1000;
const coveredByOverlay = (trigger: Element) =>
  trigger.getAttribute("aria-expanded") === "true" ||
  getComputedStyle(document.body).pointerEvents === "none";

function TooltipProvider({
  delayDuration = 200,
  disableHoverableContent = true,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      disableHoverableContent={disableHoverableContent}
      {...props}
    />
  );
}

type TooltipSide = "top" | "right" | "bottom" | "left";
type TooltipAlign = "start" | "center" | "end";
type SharedEntry = {
  content: React.ReactNode;
  shortcut?: string;
  side: TooltipSide;
  align: TooltipAlign;
};
type SharedStore = {
  entries: Map<string, SharedEntry>;
  listener: ((id: string) => void) | null;
  set: (id: string, entry: SharedEntry | null) => void;
};
type TriggerHandlers = Pick<
  React.ComponentProps<"button">,
  "onPointerMove" | "onPointerLeave" | "onPointerDown" | "onFocus" | "onBlur" | "onClick"
>;
type AnchorHandle = { ref: React.Ref<HTMLElement> | undefined; handlers: TriggerHandlers };

const sharedAttribute = "data-v4-tooltip";
const TooltipScopeContext = React.createContext<SharedStore | null>(null);

function SharedAnchor({
  handle,
  ref,
  ...handlers
}: TriggerHandlers & {
  handle: React.RefObject<AnchorHandle | null>;
  ref?: React.Ref<HTMLElement>;
}) {
  React.useLayoutEffect(() => {
    handle.current = { ref, handlers };
  });
  return null;
}

function SharedTooltipHost({ store }: { store: SharedStore }) {
  const [mounted, setMounted] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [, refresh] = React.useReducer((count: number) => count + 1, 0);
  const contentId = React.useId();
  const handle = React.useRef<AnchorHandle | null>(null);
  const pending = React.useRef<((anchor: AnchorHandle) => void)[]>([]);
  const element = React.useRef<HTMLElement | null>(null);

  React.useLayoutEffect(() => {
    if (!handle.current || !pending.current.length) return;
    queueMicrotask(() => {
      const anchor = handle.current;
      const queued = pending.current;
      pending.current = [];
      if (anchor) queued.forEach((run) => run(anchor));
    });
  });

  React.useEffect(() => {
    const pressed = new WeakSet<Element>();
    let hovered: HTMLElement | null = null;
    const run = (step: (anchor: AnchorHandle) => void) => {
      if (handle.current) step(handle.current);
      else {
        pending.current.push(step);
        setMounted(true);
      }
    };
    const call = (name: keyof TriggerHandlers, event: Event | { defaultPrevented: boolean }) =>
      run((anchor) => (anchor.handlers[name] as ((event: unknown) => void) | undefined)?.(event));
    const attach = (target: HTMLElement) => {
      if (element.current === target) return;
      element.current = target;
      setActiveId(target.getAttribute(sharedAttribute));
      run((anchor) => {
        const { ref } = anchor;
        if (typeof ref === "function") ref(target);
        else if (ref) ref.current = target;
      });
    };
    const find = (target: EventTarget | null) => {
      const trigger =
        target instanceof Element ? target.closest<HTMLElement>(`[${sharedAttribute}]`) : null;
      const id = trigger?.getAttribute(sharedAttribute);
      return id && store.entries.has(id) ? trigger : null;
    };
    const leave = (event: Event) => {
      const target = hovered;
      hovered = null;
      if (!target) return;
      if (target === element.current) call("onPointerLeave", event);
      if (!coveredByOverlay(target)) pressed.delete(target);
    };
    const onPointerMove = (event: PointerEvent) => {
      const trigger = find(event.target);
      if (trigger !== hovered) leave(event);
      if (!trigger) return;
      hovered = trigger;
      if (pressed.has(trigger) || event.pointerType === "touch") return;
      attach(trigger);
      call("onPointerMove", event);
    };
    const onPointerOut = (event: PointerEvent) => {
      if (!hovered || !(event.target instanceof Node) || !hovered.contains(event.target)) return;
      if (!(event.relatedTarget instanceof Node && hovered.contains(event.relatedTarget)))
        leave(event);
    };
    const onPointerDown = (event: PointerEvent) => {
      const trigger = find(event.target);
      if (!trigger) return;
      pressed.add(trigger);
      if (trigger === element.current) call("onPointerDown", event);
    };
    const onFocusIn = (event: FocusEvent) => {
      const trigger = find(event.target);
      if (!trigger || pressed.has(trigger) || !focusedByKeyboard()) return;
      attach(trigger);
      call("onFocus", event);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (element.current && find(event.target) === element.current) call("onBlur", event);
    };
    const onClick = (event: MouseEvent) => {
      if (element.current && find(event.target) === element.current) call("onClick", event);
    };
    store.listener = (id) => {
      if (!element.current || element.current.getAttribute(sharedAttribute) !== id) return;
      if (store.entries.has(id)) {
        refresh();
        return;
      }
      call("onPointerLeave", { defaultPrevented: false });
      element.current = null;
      setActiveId(null);
    };
    const listeners = [
      ["pointermove", onPointerMove],
      ["pointerout", onPointerOut],
      ["pointerdown", onPointerDown],
      ["focusin", onFocusIn],
      ["focusout", onFocusOut],
      ["click", onClick]
    ] as const;
    listeners.forEach(([type, listener]) =>
      document.addEventListener(type, listener as EventListener, true)
    );
    return () => {
      store.listener = null;
      listeners.forEach(([type, listener]) =>
        document.removeEventListener(type, listener as EventListener, true)
      );
    };
  }, [store]);

  React.useLayoutEffect(() => {
    const target = element.current;
    if (!open || !target || target.hasAttribute("aria-describedby")) return undefined;
    target.setAttribute("aria-describedby", contentId);
    return () => target.removeAttribute("aria-describedby");
  }, [open, activeId, contentId]);

  if (!mounted) return null;
  const entry = activeId ? store.entries.get(activeId) : undefined;
  return (
    <TooltipPrimitive.Root
      data-slot="tooltip"
      disableHoverableContent
      open={open}
      onOpenChange={(next) => flushSync(() => setOpen(next))}
    >
      <TooltipPrimitive.Trigger asChild>
        <SharedAnchor handle={handle} />
      </TooltipPrimitive.Trigger>
      {entry && (
        <TooltipContent id={contentId} side={entry.side} align={entry.align}>
          <span className={menu.tooltipText}>{entry.content}</span>
          {entry.shortcut && <Kbd>{entry.shortcut}</Kbd>}
        </TooltipContent>
      )}
    </TooltipPrimitive.Root>
  );
}

/**
 * Shares one tooltip among every Tooltip inside it: each trigger renders only its element, marked with
 * data-v4-tooltip, and the scope mounts a single Radix tooltip on the first hover or keyboard focus and
 * moves it to whichever trigger is active. Table renders one around its rows.
 */
function TooltipScope({ children }: { children?: React.ReactNode }) {
  const [store] = React.useState<SharedStore>(() => {
    const entries = new Map<string, SharedEntry>();
    const shared: SharedStore = {
      entries,
      listener: null,
      set: (id, entry) => {
        if (entry) entries.set(id, entry);
        else if (!entries.delete(id)) return;
        shared.listener?.(id);
      }
    };
    return shared;
  });
  return (
    <TooltipScopeContext.Provider value={store}>
      {children}
      <SharedTooltipHost store={store} />
    </TooltipScopeContext.Provider>
  );
}

function SharedTooltip({
  store,
  content,
  shortcut,
  side,
  align,
  children
}: SharedEntry & { store: SharedStore; children: React.ReactElement }) {
  const id = React.useId();
  React.useLayoutEffect(() => {
    store.set(id, content ? { content, shortcut, side, align } : null);
  }, [store, id, content, shortcut, side, align]);
  React.useLayoutEffect(() => () => store.set(id, null), [store, id]);
  return content
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        [sharedAttribute]: id
      })
    : children;
}

function Tooltip({
  content,
  shortcut,
  side = "top",
  align = "center",
  wrap: _wrap,
  disableHoverableContent = true,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root> & {
  content?: React.ReactNode;
  shortcut?: string;
  side?: TooltipSide;
  align?: TooltipAlign;
  /** @deprecated Tooltips always wrap at size-tooltip-max; this has no effect. */
  wrap?: boolean;
}) {
  const store = React.useContext(TooltipScopeContext);
  if (
    store &&
    disableHoverableContent &&
    props.open === undefined &&
    props.defaultOpen === undefined &&
    props.onOpenChange === undefined &&
    props.delayDuration === undefined &&
    React.isValidElement(children)
  )
    return (
      <SharedTooltip store={store} content={content} shortcut={shortcut} side={side} align={align}>
        {children}
      </SharedTooltip>
    );
  return (
    <TooltipPrimitive.Root
      data-slot="tooltip"
      disableHoverableContent={disableHoverableContent}
      {...props}
    >
      {content ? (
        <>
          <TooltipTrigger asChild>{children}</TooltipTrigger>
          <TooltipContent side={side} align={align} data-has-kbd={shortcut ? "" : undefined}>
            <span className={menu.tooltipText}>{content}</span>
            {shortcut && <Kbd>{shortcut}</Kbd>}
          </TooltipContent>
        </>
      ) : (
        children
      )}
    </TooltipPrimitive.Root>
  );
}

/**
 * Opens on hover and on keyboard focus only. Focus that a closing menu, dialog or sheet returns to the
 * trigger never opens it, and after a click it stays closed until the pointer leaves and comes back.
 */
function TooltipTrigger({
  ref,
  onPointerDown,
  onPointerMove,
  onPointerLeave,
  onFocus,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const pressed = React.useRef(false);
  return (
    <TooltipPrimitive.Trigger
      ref={ref}
      data-slot="tooltip-trigger"
      onPointerDown={(event) => {
        onPointerDown?.(event);
        pressed.current = true;
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        if (pressed.current) event.preventDefault();
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        if (!coveredByOverlay(event.currentTarget)) pressed.current = false;
      }}
      onFocus={(event) => {
        onFocus?.(event);
        if (pressed.current || !focusedByKeyboard()) event.preventDefault();
      }}
      {...props}
    />
  );
}
TooltipTrigger.displayName = "TooltipTrigger";

function TooltipContent({
  className,
  collisionPadding = 8,
  sideOffset = 0,
  children,
  ref,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal container={useV4PortalContainer()}>
      <TooltipPrimitive.Content
        ref={ref}
        data-slot="tooltip-content"
        collisionPadding={collisionPadding}
        collisionBoundary={useV4CollisionBoundary()}
        sideOffset={sideOffset}
        className={cn("z-50", menu.tooltip, menu.motion, className)}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow width={10} height={5} className={menu.tooltipArrow} />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
TooltipContent.displayName = "TooltipContent";

function TooltipText({
  content,
  side,
  align,
  asChild = false,
  className,
  ref,
  ...props
}: Omit<React.ComponentPropsWithoutRef<"span">, "content"> & {
  /** The supplementary text the tooltip shows on hover and keyboard focus. */
  content: React.ReactNode;
  side?: TooltipSide;
  align?: TooltipAlign;
  /** Make the child element (StatusText, MiddleTruncate) the focusable text instead of a span. */
  asChild?: boolean;
  ref?: React.Ref<HTMLSpanElement>;
}) {
  const Comp = asChild ? Slot.Root : "span";
  return (
    <Tooltip content={content} side={side} align={align}>
      <Comp
        ref={ref}
        data-slot="tooltip-text"
        tabIndex={0}
        className={cn(controls.focusOutline, className)}
        {...props}
      />
    </Tooltip>
  );
}
TooltipText.displayName = "TooltipText";

export { Tooltip, TooltipContent, TooltipProvider, TooltipScope, TooltipText, TooltipTrigger };
