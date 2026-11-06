"use client";

import * as React from "react";
import { GripHorizontalIcon } from "lucide-react";
import { Popover as PopoverPrimitive, Slot } from "radix-ui";

import { useV4CollisionBoundary, useV4PortalContainer } from "@app/components/v4/scope";

import { useOwnedEscape } from "../lib/use-owned-escape";
import { cn } from "../lib/utils";
import { Icon } from "./icon";

import controls from "./controls.module.css";
import menu from "./menu.module.css";
import styles from "./popover.module.css";

const PopoverOpenContext = React.createContext(false);

function Popover({
  open,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const current = open ?? uncontrolled;
  return (
    <PopoverOpenContext value={current}>
      <PopoverPrimitive.Root
        data-slot="popover"
        open={current}
        onOpenChange={(next) => {
          if (open === undefined) setUncontrolled(next);
          onOpenChange?.(next);
        }}
        {...props}
      />
    </PopoverOpenContext>
  );
}

function PopoverTrigger({ ref, ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger ref={ref} data-slot="popover-trigger" {...props} />;
}
PopoverTrigger.displayName = "PopoverTrigger";

type DragOffset = { x: number; y: number };

const restingOffset: DragOffset = { x: 0, y: 0 };

const tabbable =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const dragKeys: Record<string, DragOffset | undefined> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }
};

function clampDragOffset(
  content: HTMLElement,
  current: DragOffset,
  next: DragOffset,
  padding: React.ComponentProps<typeof PopoverPrimitive.Content>["collisionPadding"],
  boundary: HTMLElement | undefined
): DragOffset {
  const inset =
    typeof padding === "number"
      ? { top: padding, right: padding, bottom: padding, left: padding }
      : { top: 0, right: 0, bottom: 0, left: 0, ...padding };
  const frame = boundary?.getBoundingClientRect();
  const viewport = document.documentElement;
  const minLeft = Math.max(frame?.left ?? 0, 0) + inset.left;
  const minTop = Math.max(frame?.top ?? 0, 0) + inset.top;
  const maxRight = Math.min(frame?.right ?? Infinity, viewport.clientWidth) - inset.right;
  const maxBottom = Math.min(frame?.bottom ?? Infinity, viewport.clientHeight) - inset.bottom;
  const rect = content.getBoundingClientRect();
  const left = rect.left - current.x;
  const top = rect.top - current.y;
  return {
    x: Math.max(minLeft - left, Math.min(next.x, maxRight - left - rect.width)),
    y: Math.max(minTop - top, Math.min(next.y, maxBottom - top - rect.height))
  };
}

function PopoverContent({
  className,
  collisionPadding = 8,
  align = "center",
  sideOffset = 4,
  surface = "card",
  draggable = false,
  onEscapeKeyDown,
  onOpenAutoFocus,
  style,
  children,
  ref,
  ...props
}: Omit<React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>, "draggable"> & {
  surface?: "card" | "menu";
  draggable?: boolean;
} & { ref?: React.Ref<React.ComponentRef<typeof PopoverPrimitive.Content>> }) {
  const escape = useOwnedEscape(ref, onEscapeKeyDown);
  const boundary = useV4CollisionBoundary();
  const open = React.useContext(PopoverOpenContext);
  const [offset, setOffset] = React.useState(restingOffset);
  const [openedFor, setOpenedFor] = React.useState(open);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) setOffset(restingOffset);
  }
  const content = React.useRef<HTMLElement | null>(null);
  const pointer = React.useRef<{ x: number; y: number; offset: DragOffset } | undefined>(undefined);
  const instructions = React.useId();
  const dragged = offset.x !== 0 || offset.y !== 0;

  const moveTo = (next: DragOffset) => {
    if (!content.current) return;
    setOffset(clampDragOffset(content.current, offset, next, collisionPadding, boundary));
  };
  const grab = (handle: HTMLElement) => {
    content.current = handle.closest<HTMLElement>('[data-slot="popover-content"]');
  };

  React.useEffect(() => {
    if (!dragged) return undefined;
    let frame = 0;
    const reclamp = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const node = content.current;
        if (node)
          setOffset((current) =>
            clampDragOffset(node, current, current, collisionPadding, boundary)
          );
      });
    };
    window.addEventListener("resize", reclamp);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", reclamp);
    };
  }, [dragged, collisionPadding, boundary]);

  return (
    <PopoverPrimitive.Portal container={useV4PortalContainer()}>
      <PopoverPrimitive.Content
        ref={escape.ref}
        data-slot="popover-content"
        collisionPadding={collisionPadding}
        collisionBoundary={boundary}
        align={align}
        sideOffset={sideOffset}
        data-surface={surface}
        data-scroll-fade="y"
        className={cn(
          "z-50",
          menu.surface,
          surface === "menu" ? menu.panel : menu.card,
          menu.motion,
          className
        )}
        style={dragged ? { ...style, transform: `translate(${offset.x}px, ${offset.y}px)` } : style}
        {...props}
        onEscapeKeyDown={escape.onEscapeKeyDown}
        onOpenAutoFocus={(event) => {
          onOpenAutoFocus?.(event);
          if (!draggable || event.defaultPrevented) return;
          event.preventDefault();
          const panel = event.currentTarget as HTMLElement;
          const field = Array.from(panel.querySelectorAll<HTMLElement>(tabbable)).find(
            (element) =>
              element.dataset.slot !== "popover-drag-handle" && !element.closest("[hidden]")
          );
          (field ?? panel).focus();
        }}
      >
        {draggable && (
          <button
            type="button"
            data-slot="popover-drag-handle"
            aria-label="Move"
            aria-describedby={instructions}
            className={cn(styles.dragHandle, controls.focusOutline)}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              grab(event.currentTarget);
              event.currentTarget.setPointerCapture(event.pointerId);
              pointer.current = { x: event.clientX, y: event.clientY, offset };
            }}
            onPointerMove={(event) => {
              const start = pointer.current;
              if (!start) return;
              moveTo({
                x: start.offset.x + event.clientX - start.x,
                y: start.offset.y + event.clientY - start.y
              });
            }}
            onPointerUp={() => {
              pointer.current = undefined;
            }}
            onLostPointerCapture={() => {
              pointer.current = undefined;
            }}
            onKeyDown={(event) => {
              const direction = dragKeys[event.key];
              if (!direction) return;
              event.preventDefault();
              grab(event.currentTarget);
              const step = parseFloat(
                getComputedStyle(event.currentTarget).getPropertyValue(
                  event.shiftKey ? "--v4-space-48" : "--v4-space-8"
                )
              );
              moveTo({ x: offset.x + direction.x * step, y: offset.y + direction.y * step });
            }}
          >
            <Icon icon={GripHorizontalIcon} />
            <span id={instructions} hidden>
              Use the arrow keys to move the popover. Hold Shift to move it further.
            </span>
          </button>
        )}
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
PopoverContent.displayName = "PopoverContent";

function PopoverAnchor({
  asChild,
  virtualRef,
  ref,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  const node = React.useRef<HTMLDivElement | null>(null);
  const attach = React.useCallback(
    (element: HTMLDivElement | null) => {
      node.current = element;
      if (typeof ref === "function") ref(element);
      else if (ref) {
        ref.current = element;
      }
    },
    [ref]
  );
  // The trigger can re-claim the anchor on a later commit (StrictMode ref replays, re-mounts in a
  // Dialog) and a virtual anchor only re-announces when its element changes, so it remounts on
  // every open to point the popper back at this anchor.
  const generation = React.useContext(PopoverOpenContext) ? "open" : "closed";
  if (virtualRef)
    return (
      <PopoverPrimitive.Anchor
        key={generation}
        ref={ref}
        data-slot="popover-anchor"
        virtualRef={virtualRef}
        hidden
        {...props}
      />
    );
  // Radix registers a real anchor only when its node attaches, and its trigger re-mounts without
  // the anchor wrapper once a custom anchor exists, so the popper measures through a virtual ref.
  const Comp = asChild ? Slot.Root : "div";
  return (
    <>
      <Comp ref={attach} data-slot="popover-anchor" {...props} />
      <PopoverPrimitive.Anchor key={generation} virtualRef={node} hidden />
    </>
  );
}
PopoverAnchor.displayName = "PopoverAnchor";

function PopoverHeader({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5", className)}
      {...props}
    />
  );
}
PopoverHeader.displayName = "PopoverHeader";

function PopoverTitle({
  className,
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"h2"> & { ref?: React.Ref<HTMLHeadingElement> }) {
  return (
    <h2 ref={ref} data-slot="popover-title" className={cn("", className)} {...props}>
      {children}
    </h2>
  );
}
PopoverTitle.displayName = "PopoverTitle";

function PopoverDescription({ className, ref, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      ref={ref}
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}
PopoverDescription.displayName = "PopoverDescription";

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
};
