import * as React from "react";
import { createPortal } from "react-dom";
import { Presence } from "@radix-ui/react-presence";
import { cva } from "class-variance-authority";
import { NavigationMenu as NavigationMenuPrimitive, Slot } from "radix-ui";

import { useControllableState } from "../lib/use-controllable-state";
import { cn } from "../lib/utils";
import { Icon } from "./icon";

import controlStyles from "./controls.module.css";
import menu from "./menu.module.css";

const NavigationContentContext = React.createContext(false);

const NavigationViewportContext = React.createContext<{
  container: HTMLDivElement | null;
  setContainer: React.Dispatch<React.SetStateAction<HTMLDivElement | null>>;
  viewport: boolean;
  orientation: "horizontal" | "vertical";
  value: string;
} | null>(null);

const NavigationMenu = React.forwardRef<
  React.ComponentRef<typeof NavigationMenuPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Root> & {
    viewport?: boolean;
  }
>(
  (
    {
      className,
      children,
      viewport = true,
      orientation = "horizontal",
      value: controlledValue,
      defaultValue = "",
      onValueChange,
      ...props
    },
    ref
  ) => {
    const [container, setContainer] = React.useState<HTMLDivElement | null>(null);
    const [value, setValue] = useControllableState({
      value: controlledValue,
      defaultValue,
      onChange: onValueChange
    });
    const context = React.useMemo(
      () => ({ container, setContainer, viewport, orientation, value }),
      [container, viewport, orientation, value]
    );
    return (
      <NavigationViewportContext.Provider value={context}>
        <NavigationMenuPrimitive.Root
          ref={ref}
          data-slot="navigation-menu"
          data-viewport={viewport || Boolean(container)}
          value={value}
          orientation={orientation}
          onValueChange={setValue}
          className={cn(
            "group/navigation-menu relative flex max-w-max flex-1 items-center justify-center",
            className
          )}
          {...props}
        >
          {children}
          {viewport && <NavigationMenuViewport />}
        </NavigationMenuPrimitive.Root>
      </NavigationViewportContext.Provider>
    );
  }
);
NavigationMenu.displayName = "NavigationMenu";

const NavigationMenuList = React.forwardRef<
  React.ComponentRef<typeof NavigationMenuPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.List>
>(({ className, ...props }, ref) => {
  return (
    <NavigationMenuPrimitive.List
      ref={ref}
      data-slot="navigation-menu-list"
      className={cn("group flex flex-1 list-none items-center justify-center gap-0", className)}
      {...props}
    />
  );
});
NavigationMenuList.displayName = "NavigationMenuList";

const NavigationMenuItem = React.forwardRef<
  React.ComponentRef<typeof NavigationMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Item>
>(({ className, ...props }, ref) => {
  return (
    <NavigationMenuPrimitive.Item
      ref={ref}
      data-slot="navigation-menu-item"
      className={cn("relative", className)}
      {...props}
    />
  );
});
NavigationMenuItem.displayName = "NavigationMenuItem";

const navigationMenuTriggerStyle = cva([controlStyles.focusOutline, menu.navItem]);

const NavigationMenuTrigger = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
  return (
    <NavigationMenuPrimitive.Trigger
      ref={ref}
      data-slot="navigation-menu-trigger"
      className={cn(navigationMenuTriggerStyle(), className)}
      {...props}
    >
      {children}
      <Icon name="chev-down" className={menu.navChevron} />
    </NavigationMenuPrimitive.Trigger>
  );
});
NavigationMenuTrigger.displayName = "NavigationMenuTrigger";

const NavigationMenuContent = React.forwardRef<
  React.ComponentRef<typeof NavigationMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Content>
>(({ className, forceMount, ...props }, ref) => {
  const context = React.useContext(NavigationViewportContext);
  const node = React.useRef<HTMLDivElement | null>(null);
  const wasOpen = React.useRef(false);
  const attach = React.useCallback(
    (element: HTMLDivElement | null) => {
      node.current = element;
      if (typeof ref === "function") ref(element);
      else if (ref) ref.current = element;
    },
    [ref]
  );
  React.useLayoutEffect(() => {
    if (context?.value) wasOpen.current = node.current?.getAttribute("data-state") === "open";
  }, [context?.value, context?.container]);
  const retainForViewport = Boolean(context?.container && !context.value && wasOpen.current);
  const inViewport = Boolean(context?.viewport || context?.container);
  const content = (
    <NavigationContentContext.Provider value>
      <NavigationMenuPrimitive.Content
        ref={attach}
        forceMount={forceMount || retainForViewport ? true : undefined}
        data-slot="navigation-menu-content"
        data-side="bottom"
        className={cn(
          menu.inset,
          inViewport
            ? cn(
                menu.navContent,
                "data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 data-[motion^=from-]:animate-in data-[motion^=from-]:fade-in data-[motion^=to-]:animate-out data-[motion^=to-]:fade-out"
              )
            : cn(
                context?.orientation === "vertical" ? "mt-1" : "absolute top-full left-0 z-50 mt-1",
                menu.surface,
                menu.panel,
                menu.motion
              ),
          className
        )}
        {...props}
      />
    </NavigationContentContext.Provider>
  );
  return context?.container
    ? createPortal(content, context.container)
    : context?.viewport
      ? null
      : content;
});
NavigationMenuContent.displayName = "NavigationMenuContent";

const NavigationMenuViewport = React.forwardRef<
  React.ComponentRef<typeof NavigationMenuPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Viewport>
>(({ className, forceMount, asChild, style, children, ...props }, ref) => {
  const context = React.useContext(NavigationViewportContext);
  const node = React.useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = React.useState<{ width: number; height: number } | null>(
    null
  );
  const [anchorX, setAnchorX] = React.useState(0);
  const [placed, setPlaced] = React.useState(false);
  const isOpen = Boolean(context?.value);
  React.useEffect(() => {
    if (!isOpen) {
      setPlaced(false);
      return undefined;
    }
    const frame = requestAnimationFrame(() => setPlaced(true));
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);
  const attach = React.useCallback(
    (element: HTMLDivElement | null) => {
      node.current = element;
      context?.setContainer(element);
      if (typeof ref === "function") ref(element);
      else if (ref) ref.current = element;
    },
    [context?.setContainer, ref]
  );
  React.useLayoutEffect(() => {
    const element = node.current;
    if (!element) return undefined;
    const measure = () => {
      if (!context?.value) return;
      const active =
        element.querySelector<HTMLElement>(
          ':scope > [data-slot="navigation-menu-content"][data-state="open"]'
        ) ?? element.querySelector<HTMLElement>(':scope > [data-slot="navigation-menu-content"]');
      if (!active) return;
      const width = active.offsetWidth;
      const height = active.offsetHeight;
      const root = element.closest<HTMLElement>('[data-slot="navigation-menu"]');
      const trigger = root?.querySelector<HTMLElement>(
        '[data-slot="navigation-menu-trigger"][data-state="open"]'
      );
      if (root && trigger) {
        const rootLeft = root.getBoundingClientRect().left;
        const wanted = trigger.getBoundingClientRect().left - rootLeft;
        const room = document.documentElement.clientWidth - rootLeft - width - 16;
        const next = Math.max(Math.min(wanted, room), -rootLeft + 16);
        setAnchorX((previous) => (previous === next ? previous : next));
      }
      setDimensions((previous) =>
        previous?.width === width && previous.height === height ? previous : { width, height }
      );
    };
    const observer = new ResizeObserver(measure);
    const observe = () => {
      Array.from(element.children).forEach((child) => observer.observe(child));
      measure();
    };
    const mutations = new MutationObserver(observe);
    mutations.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "data-motion"]
    });
    observer.observe(element);
    observe();
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [context?.value, context?.container]);
  const open = Boolean(context?.value);
  const viewportStyle: React.CSSProperties & {
    "--radix-navigation-menu-viewport-width"?: string;
    "--radix-navigation-menu-viewport-height"?: string;
  } = {
    ...(dimensions
      ? {
          "--radix-navigation-menu-viewport-width": `${dimensions.width}px`,
          "--radix-navigation-menu-viewport-height": `${dimensions.height}px`
        }
      : {}),
    ...style
  };
  const Comp = asChild ? Slot.Root : "div";
  return (
    <div
      className={menu.navViewportAnchor}
      data-placed={placed || undefined}
      style={{ "--v4-nav-viewport-x": `${anchorX}px` } as React.CSSProperties}
    >
      <Presence present={Boolean(forceMount || open)}>
        <Comp
          ref={attach}
          data-slot="navigation-menu-viewport"
          data-state={open ? "open" : "closed"}
          data-side="bottom"
          data-v4-shared-viewport=""
          data-orientation={context?.orientation ?? "horizontal"}
          {...(!open ? { inert: true, "aria-hidden": true } : {})}
          style={viewportStyle}
          className={cn(menu.surface, menu.navViewport, menu.motion, className)}
          {...props}
        >
          {children}
        </Comp>
      </Presence>
    </div>
  );
});
NavigationMenuViewport.displayName = "NavigationMenuViewport";

const NavigationMenuLink = React.forwardRef<
  React.ComponentRef<typeof NavigationMenuPrimitive.Link>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Link>
>(({ className, ...props }, ref) => {
  const inContent = React.useContext(NavigationContentContext);
  return (
    <NavigationMenuPrimitive.Link
      ref={ref}
      data-slot="navigation-menu-link"
      className={cn(
        inContent
          ? cn(menu.row, controlStyles.focusOutlineInset)
          : cn(controlStyles.focusOutline, menu.navItem),
        className
      )}
      {...props}
    />
  );
});
NavigationMenuLink.displayName = "NavigationMenuLink";

const NavigationMenuIndicator = React.forwardRef<
  React.ComponentRef<typeof NavigationMenuPrimitive.Indicator>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Indicator>
>(({ className, ...props }, ref) => {
  return (
    <NavigationMenuPrimitive.Indicator
      ref={ref}
      data-slot="navigation-menu-indicator"
      className={cn(
        "top-full z-1 flex h-1.5 items-end justify-center overflow-hidden data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:animate-in data-[state=visible]:fade-in",
        className
      )}
      {...props}
    >
      <div className="relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-border shadow-md" />
    </NavigationMenuPrimitive.Indicator>
  );
});
NavigationMenuIndicator.displayName = "NavigationMenuIndicator";

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
  NavigationMenuViewport
};
