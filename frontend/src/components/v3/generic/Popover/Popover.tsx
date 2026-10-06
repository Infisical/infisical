import * as React from "react";
import {
  autoUpdate,
  flip,
  offset,
  Placement,
  safePolygon,
  shift,
  useFloating,
  useHover,
  useInteractions,
  useMergeRefs
} from "@floating-ui/react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "../../utils";

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

const PopoverTrigger = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Trigger>,
  React.ComponentProps<typeof PopoverPrimitive.Trigger>
>(({ ...props }, ref) => (
  <PopoverPrimitive.Trigger ref={ref} data-slot="popover-trigger" {...props} />
));
PopoverTrigger.displayName = "PopoverTrigger";

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  collisionPadding = 8,
  container,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  container?: React.ComponentProps<typeof PopoverPrimitive.Portal>["container"];
}) {
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-[var(--z-index-popover)] w-72 origin-(--radix-popover-content-transform-origin) rounded-lg border border-border bg-popover p-4 text-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };

type InteractiveHoverPopoverProps = Pick<
  React.ComponentProps<typeof PopoverPrimitive.Root>,
  "children" | "defaultOpen" | "onOpenChange"
> & {
  delay?: number;
  closeDelay?: number;
  side?: React.ComponentProps<typeof PopoverPrimitive.Content>["side"];
  align?: React.ComponentProps<typeof PopoverPrimitive.Content>["align"];
  sideOffset?: number;
  collisionPadding?: React.ComponentProps<typeof PopoverPrimitive.Content>["collisionPadding"];
};

type InteractiveHoverPopoverContextValue = {
  setReference: React.Dispatch<React.SetStateAction<HTMLButtonElement | null>>;
  setFloating: React.Dispatch<React.SetStateAction<HTMLDivElement | null>>;
  getReferenceProps: ReturnType<typeof useInteractions>["getReferenceProps"];
  getFloatingProps: ReturnType<typeof useInteractions>["getFloatingProps"];
  openedByHover: React.MutableRefObject<boolean>;
  contentReceivedFocus: React.MutableRefObject<boolean>;
  side: NonNullable<InteractiveHoverPopoverProps["side"]>;
  align: NonNullable<InteractiveHoverPopoverProps["align"]>;
  sideOffset: number;
  collisionPadding: NonNullable<InteractiveHoverPopoverProps["collisionPadding"]>;
};

const InteractiveHoverPopoverContext =
  React.createContext<InteractiveHoverPopoverContextValue | null>(null);

function useInteractiveHoverPopoverContext() {
  const context = React.useContext(InteractiveHoverPopoverContext);
  if (!context) {
    throw new Error("Interactive hover popover parts must be used inside InteractiveHoverPopover.");
  }
  return context;
}

function InteractiveHoverPopover({
  children,
  defaultOpen = false,
  onOpenChange,
  delay = 50,
  closeDelay = 0,
  side = "bottom",
  align = "center",
  sideOffset = 4,
  collisionPadding = 8
}: InteractiveHoverPopoverProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [reference, setReference] = React.useState<HTMLButtonElement | null>(null);
  const [floating, setFloating] = React.useState<HTMLDivElement | null>(null);
  const openedByHover = React.useRef(false);
  const contentReceivedFocus = React.useRef(false);
  const placement: Placement = align === "center" ? side : `${side}-${align}`;

  const changeOpen = React.useCallback(
    (nextOpen: boolean, fromHover = false) => {
      if (nextOpen) {
        openedByHover.current = fromHover;
        contentReceivedFocus.current = false;
      }
      setOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange]
  );

  const { context } = useFloating({
    open,
    onOpenChange: (nextOpen, _event, reason) => changeOpen(nextOpen, reason === "hover"),
    elements: { reference, floating },
    placement,
    middleware: [
      offset(sideOffset),
      flip({ padding: collisionPadding, boundary: [] }),
      shift({ padding: collisionPadding, boundary: [] })
    ],
    whileElementsMounted: autoUpdate
  });
  const hover = useHover(context, {
    delay: { open: delay, close: closeDelay },
    move: false,
    mouseOnly: true,
    handleClose: safePolygon()
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover]);
  const value = React.useMemo(
    () => ({
      setReference,
      setFloating,
      getReferenceProps,
      getFloatingProps,
      openedByHover,
      contentReceivedFocus,
      side,
      align,
      sideOffset,
      collisionPadding
    }),
    [getReferenceProps, getFloatingProps, side, align, sideOffset, collisionPadding]
  );

  return (
    <InteractiveHoverPopoverContext.Provider value={value}>
      <PopoverPrimitive.Root open={open} onOpenChange={(nextOpen) => changeOpen(nextOpen)}>
        {children}
      </PopoverPrimitive.Root>
    </InteractiveHoverPopoverContext.Provider>
  );
}

const InteractiveHoverPopoverTrigger = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Trigger>,
  React.ComponentProps<typeof PopoverPrimitive.Trigger>
>((props, ref) => {
  const context = useInteractiveHoverPopoverContext();
  const mergedRef = useMergeRefs([ref, context.setReference]);
  return (
    <PopoverPrimitive.Trigger
      ref={mergedRef}
      data-slot="interactive-hover-popover-trigger"
      {...context.getReferenceProps(props)}
    />
  );
});
InteractiveHoverPopoverTrigger.displayName = "InteractiveHoverPopoverTrigger";

type InteractiveHoverPopoverContentProps = Omit<
  React.ComponentProps<typeof PopoverPrimitive.Content>,
  | "side"
  | "align"
  | "sideOffset"
  | "alignOffset"
  | "collisionPadding"
  | "collisionBoundary"
  | "avoidCollisions"
  | "arrowPadding"
  | "sticky"
  | "hideWhenDetached"
  | "updatePositionStrategy"
> & {
  container?: React.ComponentProps<typeof PopoverPrimitive.Portal>["container"];
};

const InteractiveHoverPopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  InteractiveHoverPopoverContentProps
>(({ className, container, onOpenAutoFocus, onCloseAutoFocus, onFocusCapture, ...props }, ref) => {
  const context = useInteractiveHoverPopoverContext();
  const mergedRef = useMergeRefs([ref, context.setFloating]);
  const content = (
    <PopoverPrimitive.Content
      {...context.getFloatingProps({
        ...props,
        onFocusCapture: (event: React.FocusEvent<HTMLDivElement>) => {
          context.contentReceivedFocus.current = true;
          onFocusCapture?.(event);
        }
      })}
      ref={mergedRef}
      data-slot="interactive-hover-popover-content"
      side={context.side}
      align={context.align}
      sideOffset={context.sideOffset}
      collisionPadding={context.collisionPadding}
      className={cn(
        "z-[var(--z-index-popover)] w-72 origin-(--radix-popover-content-transform-origin) rounded-lg border border-border bg-popover p-4 text-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
        className
      )}
      onOpenAutoFocus={(event) => {
        onOpenAutoFocus?.(event);
        if (!event.defaultPrevented && context.openedByHover.current) event.preventDefault();
      }}
      onCloseAutoFocus={(event) => {
        onCloseAutoFocus?.(event);
        if (
          !event.defaultPrevented &&
          context.openedByHover.current &&
          !context.contentReceivedFocus.current
        ) {
          event.preventDefault();
        }
      }}
    />
  );

  return container === undefined ? (
    content
  ) : (
    <PopoverPrimitive.Portal container={container}>{content}</PopoverPrimitive.Portal>
  );
});
InteractiveHoverPopoverContent.displayName = "InteractiveHoverPopoverContent";

export { InteractiveHoverPopover, InteractiveHoverPopoverContent, InteractiveHoverPopoverTrigger };
