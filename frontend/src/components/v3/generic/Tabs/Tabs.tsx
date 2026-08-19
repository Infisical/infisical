import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "../../utils";
import { useScrollEdges } from "../../utils/useScrollEdges";

import "../../utils/ScrollEdgeFade.css";

function revealTabTrigger(trigger: HTMLElement, list: HTMLElement) {
  const listRect = list.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();

  if (triggerRect.left < listRect.left) {
    list.scrollTo({ left: list.scrollLeft - (listRect.left - triggerRect.left) });
  } else if (triggerRect.right > listRect.right) {
    list.scrollTo({ left: list.scrollLeft + triggerRect.right - listRect.right });
  }
}

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ className, orientation = "horizontal", value, ...props }, ref) => {
  const rootRef = React.useRef<React.ElementRef<typeof TabsPrimitive.Root>>(null);

  React.useImperativeHandle(ref, () => rootRef.current as HTMLDivElement, []);

  React.useEffect(() => {
    if (orientation !== "horizontal" || value === undefined) return;

    const activeTrigger = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>(
        '[data-slot="tabs-trigger"][data-state="active"]'
      ) ?? []
    ).find((trigger) => trigger.closest('[data-slot="tabs"]') === rootRef.current);
    const list = activeTrigger?.closest<HTMLElement>('[data-slot="tabs-list"]');

    if (activeTrigger && list) revealTabTrigger(activeTrigger, list);
  }, [orientation, value]);

  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      orientation={orientation}
      value={value}
      className={cn("flex gap-2 data-[orientation=horizontal]:flex-col", className)}
      ref={rootRef}
      {...props}
    />
  );
});

type TabsVariant = "filled" | "project" | "org" | "sub-org" | "pam";

const tabsListVariants: Record<"filled" | "underline", string> = {
  filled: "border p-1 border-border",
  underline:
    "bg-transparent data-[orientation=horizontal]:h-11 data-[orientation=horizontal]:justify-start data-[orientation=horizontal]:border-b data-[orientation=horizontal]:border-border data-[orientation=vertical]:gap-2"
};

const tabsListStyleByVariant: Record<TabsVariant, "filled" | "underline"> = {
  filled: "filled",
  project: "underline",
  org: "underline",
  "sub-org": "underline",
  pam: "underline"
};

const tabsListAriaLabelByVariant: Record<TabsVariant, string> = {
  filled: "Sections",
  project: "Project sections",
  org: "Organization sections",
  "sub-org": "Sub-organization sections",
  pam: "PAM sections"
};

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsVariant }
>(({ className, variant = "filled", ...props }, ref) => {
  const { scrollEdges, setViewportRef } = useScrollEdges<
    React.ElementRef<typeof TabsPrimitive.List>
  >("horizontal", ref);

  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      data-style={tabsListStyleByVariant[variant]}
      data-scroll-edge-axis="horizontal"
      data-scrollable-start={scrollEdges.start}
      data-scrollable-end={scrollEdges.end}
      className={cn(
        "scroll-edge-fade group/tabs-list no-scrollbar text-muted-foreground inline-flex w-fit max-w-full shrink-0 justify-center rounded-md data-[orientation=horizontal]:h-9 data-[orientation=horizontal]:overflow-x-auto data-[orientation=horizontal]:overflow-y-hidden data-[orientation=horizontal]:overscroll-x-contain data-[orientation=vertical]:h-fit data-[orientation=vertical]:flex-col data-[style=filled]:items-center data-[style=filled]:pb-[3px] data-[style=underline]:w-full data-[style=underline]:items-stretch data-[style=underline]:rounded-none",
        tabsListVariants[tabsListStyleByVariant[variant]],
        className
      )}
      ref={setViewportRef}
      {...props}
      aria-label={props["aria-label"] ?? tabsListAriaLabelByVariant[variant]}
    />
  );
});

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, onFocus, ...props }, ref) => (
  <TabsPrimitive.Trigger
    data-slot="tabs-trigger"
    className={cn(
      "relative inline-flex h-full flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-sm",
      "px-1.5 py-0.5 text-sm whitespace-nowrap text-foreground/60 transition-colors data-[orientation=vertical]:w-full",
      "data-[orientation=vertical]:px-2 data-[orientation=vertical]:py-1.5",
      "data-[orientation=horizontal]:group-data-[style=underline]/tabs-list:px-3",
      "data-[orientation=horizontal]:group-data-[style=underline]/tabs-list:flex-none",
      "data-[orientation=horizontal]:group-data-[style=filled]/tabs-list:h-[calc(100%-1px)] data-[orientation=horizontal]:group-data-[style=filled]/tabs-list:px-3 data-[orientation=horizontal]:group-data-[style=filled]/tabs-list:py-0.5",
      "hover:text-foreground data-[orientation=vertical]:justify-start",
      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50",
      "has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 [&_svg]:pointer-events-none",
      "group-data-[style=underline]/tabs-list:bg-transparent [&_svg]:shrink-0",
      "[&_svg:not([class*='size-'])]:size-4",
      "data-[state=active]:text-foreground",
      "group-data-[style=filled]/tabs-list:data-[state=active]:bg-container-hover",
      "after:absolute after:opacity-0 after:transition-opacity data-[orientation=horizontal]:after:inset-x-0",
      "data-[orientation=horizontal]:after:bottom-0 data-[orientation=horizontal]:after:h-0.5",
      "data-[orientation=vertical]:after:inset-y-0 data-[orientation=vertical]:after:left-0",
      "data-[orientation=vertical]:after:w-0.5 group-data-[style=underline]/tabs-list:data-[state=active]:after:opacity-100",
      "group-data-[variant=project]/tabs-list:after:bg-project",
      "group-data-[variant=org]/tabs-list:after:bg-org",
      "group-data-[variant=sub-org]/tabs-list:after:bg-sub-org",
      "group-data-[variant=pam]/tabs-list:after:bg-product-pam",
      className
    )}
    ref={ref}
    onFocus={(event) => {
      onFocus?.(event);
      if (event.currentTarget.dataset.orientation === "vertical") return;

      const list = event.currentTarget.closest<HTMLElement>('[data-slot="tabs-list"]');
      if (list) revealTabTrigger(event.currentTarget, list);
    }}
    {...props}
  />
));

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    data-slot="tabs-content"
    className={cn(
      "mt-3 flex-1 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
      className
    )}
    ref={ref}
    {...props}
  />
));

export { Tabs, TabsContent, TabsList, TabsTrigger };
