import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";

import { SlidingIndicator } from "@app/components/v4/lib/sliding-indicator";
import { useMeasuredIndicator } from "@app/components/v4/lib/use-measured-indicator";
import { toggleVariants } from "@app/components/v4/ui/toggle";

import controlStyles from "./controls.module.css";

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number;
    orientation?: "horizontal" | "vertical";
  }
>({
  size: "default",
  variant: "outline",
  spacing: 0,
  orientation: "horizontal"
});

const ToggleGroup = React.forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root> &
    VariantProps<typeof toggleVariants> & {
      spacing?: number;
      orientation?: "horizontal" | "vertical";
      bare?: boolean;
    }
>(
  (
    {
      className,
      variant = "outline",
      size = "default",
      spacing = 0,
      orientation = "horizontal",
      bare = false,
      children,
      ...props
    },
    ref
  ) => {
    const list = React.useRef<HTMLDivElement | null>(null);
    const attach = React.useCallback(
      (node: HTMLDivElement | null) => {
        list.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref]
    );
    const sliding = props.type === "single" && spacing === 0;
    const { state: indicator } = useMeasuredIndicator({
      listRef: list,
      activeSelector: '[data-slot="toggle-group-item"][data-state="on"]',
      itemSelector: '[data-slot="toggle-group-item"]',
      watch: children,
      enabled: sliding
    });
    return (
      <ToggleGroupPrimitive.Root
        ref={attach}
        data-slot="toggle-group"
        data-variant={variant === "default" ? "outline" : variant}
        data-size={size}
        data-spacing={spacing}
        data-bare={bare || undefined}
        data-indicator={sliding || undefined}
        orientation={orientation}
        className={cn(controlStyles.toggleGroup, className)}
        {...props}
        style={
          { "--v4-toggle-group-gap": `${spacing * 4}px`, ...props.style } as React.CSSProperties
        }
      >
        {sliding && <SlidingIndicator state={indicator} className={controlStyles.indicator} />}
        <ToggleGroupContext.Provider value={{ variant, size, spacing, orientation }}>
          {children}
        </ToggleGroupContext.Provider>
      </ToggleGroupPrimitive.Root>
    );
  }
);
ToggleGroup.displayName = "ToggleGroup";

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> &
    VariantProps<typeof toggleVariants>
>(({ className, children, variant = "outline", size = "default", ...props }, ref) => {
  const context = React.useContext(ToggleGroupContext);

  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      data-slot="toggle-group-item"
      data-variant={
        (context.variant || variant) === "default" ? "outline" : context.variant || variant
      }
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size
        }),
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
});
ToggleGroupItem.displayName = "ToggleGroupItem";

export { ToggleGroup, ToggleGroupItem };
