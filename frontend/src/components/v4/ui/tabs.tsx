import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";

import { SlidingIndicator } from "../lib/sliding-indicator";
import { useControllableState } from "../lib/use-controllable-state";
import { type MeasureContext, useMeasuredIndicator } from "../lib/use-measured-indicator";
import { cn } from "../lib/utils";
import { Count } from "./badge";

import controlStyles from "./controls.module.css";
import styles from "./navigation.module.css";

export interface TabDefinition {
  value: string;
  label: React.ReactNode;
  count?: number;
  content?: React.ReactNode;
  disabled?: boolean;
}
export type TabsProps = Omit<
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>,
  "onChange"
> & {
  tabs?: TabDefinition[];
  label?: string;
  variant?: "underline" | "segmented";
  onChange?: (value: string) => void;
};

const Tabs = React.forwardRef<React.ComponentRef<typeof TabsPrimitive.Root>, TabsProps>(
  (
    {
      className,
      orientation = "horizontal",
      tabs,
      label,
      variant = "underline",
      onChange,
      onValueChange,
      value,
      defaultValue,
      children,
      ...props
    },
    ref
  ) => {
    const [selected, setSelected] = useControllableState({
      value,
      defaultValue: defaultValue ?? tabs?.find((tab) => !tab.disabled)?.value ?? "",
      onChange: (next) => {
        onValueChange?.(next);
        onChange?.(next);
      }
    });
    return (
      <TabsPrimitive.Root
        ref={ref}
        data-slot="tabs"
        data-variant={variant}
        orientation={orientation}
        value={selected}
        onValueChange={setSelected}
        className={cn(styles.tabs, className)}
        {...props}
      >
        {tabs ? (
          <>
            <TabsList aria-label={label} variant={variant}>
              {tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} disabled={tab.disabled}>
                  {tab.label}
                  {tab.count !== undefined && (
                    <Count tone="neutral" className={styles.tabCount}>
                      {tab.count}
                    </Count>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            {tabs.map((tab) => (
              <TabsContent key={tab.value} value={tab.value}>
                {tab.content}
              </TabsContent>
            ))}
          </>
        ) : (
          children
        )}
      </TabsPrimitive.Root>
    );
  }
);
Tabs.displayName = "Tabs";

const tabsListVariants = cva(styles.tabsList, {
  variants: {
    variant: {
      underline: styles.tabsUnderline,
      segmented: styles.tabsSegmented
    }
  },
  defaultVariants: {
    variant: "underline"
  }
});

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>
>(
  (
    { className, variant = "underline", children, onScroll, onWheel, onWheelCapture, ...props },
    ref
  ) => {
    const list = React.useRef<HTMLDivElement | null>(null);
    const [edge, setEdge] = React.useState({ before: false, after: false });
    const wheelCancelled = React.useRef(false);
    const attach = React.useCallback(
      (node: HTMLDivElement | null) => {
        list.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref]
    );
    const rect = React.useCallback((active: HTMLElement, node: HTMLElement) => {
      const vertical = node.getAttribute("data-orientation") === "vertical";
      const line = node.dataset.variant === "underline";
      return {
        x: active.offsetLeft,
        y: active.offsetTop,
        width: line && vertical ? node.clientWidth - active.offsetLeft : active.offsetWidth,
        height: line && !vertical ? node.clientHeight - active.offsetTop : active.offsetHeight
      };
    }, []);
    const onMeasure = React.useCallback(
      (node: HTMLElement, active: HTMLElement | null, { reveal, instant }: MeasureContext) => {
        const vertical = node.getAttribute("data-orientation") === "vertical";
        const start = vertical ? node.scrollTop : node.scrollLeft;
        const size = vertical ? node.clientHeight : node.clientWidth;
        const length = vertical ? node.scrollHeight : node.scrollWidth;
        setEdge({ before: start > 1, after: start + size < length - 1 });
        if (!active || !reveal) return;
        const offset = vertical ? active.offsetTop : active.offsetLeft;
        const extent = vertical ? active.offsetHeight : active.offsetWidth;
        const padding = 32;
        const target =
          offset < start + padding
            ? offset - padding
            : offset + extent > start + size - padding
              ? offset + extent - size + padding
              : start;
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        node.scrollTo?.({
          [vertical ? "top" : "left"]: Math.max(0, target),
          behavior: instant || reduced ? "instant" : "smooth"
        });
      },
      []
    );
    const { state: indicator, measure } = useMeasuredIndicator({
      listRef: list,
      activeSelector: '[role="tab"][data-state="active"]',
      itemSelector: '[role="tab"]',
      rect,
      onMeasure,
      watch: children
    });
    React.useLayoutEffect(() => {
      const node = list.current;
      if (!node) return undefined;
      const wheel = (event: WheelEvent) => {
        const cancelled = wheelCancelled.current || event.defaultPrevented;
        wheelCancelled.current = false;
        if (cancelled) {
          event.preventDefault();
          return;
        }
        if (
          node.dataset.orientation === "vertical" ||
          Math.abs(event.deltaX) > Math.abs(event.deltaY)
        )
          return;
        const next = Math.max(
          0,
          Math.min(node.scrollWidth - node.clientWidth, node.scrollLeft + event.deltaY)
        );
        if (next !== node.scrollLeft) {
          event.preventDefault();
          node.scrollLeft = next;
        }
      };
      node.addEventListener("wheel", wheel, { passive: false });
      return () => node.removeEventListener("wheel", wheel);
    }, []);
    return (
      <div className={styles.tabsTrack} data-variant={variant}>
        <TabsPrimitive.List
          ref={attach}
          data-slot="tabs-list"
          data-variant={variant}
          data-moving
          data-before={edge.before || undefined}
          data-after={edge.after || undefined}
          className={cn(tabsListVariants({ variant }), className)}
          onScroll={(event) => {
            measure();
            onScroll?.(event);
          }}
          onFocusCapture={() => measure(true)}
          onWheelCapture={(event) => {
            onWheelCapture?.(event);
            onWheel?.(event);
            wheelCancelled.current = event.defaultPrevented;
          }}
          {...props}
        >
          <SlidingIndicator
            state={indicator}
            className={cn(controlStyles.indicator, styles.tabIndicator)}
          />
          {children}
        </TabsPrimitive.List>
      </div>
    );
  }
);
TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      data-slot="tabs-trigger"
      className={cn(controlStyles.focusOutline, styles.tabTrigger, className)}
      {...props}
    />
  );
});
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => {
  return (
    <TabsPrimitive.Content
      ref={ref}
      data-slot="tabs-content"
      className={cn(styles.tabsContent, className)}
      {...props}
    />
  );
});
TabsContent.displayName = "TabsContent";

export { Tabs, TabsContent, TabsList, tabsListVariants, TabsTrigger };
