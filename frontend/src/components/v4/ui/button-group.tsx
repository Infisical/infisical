import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";

import { Separator } from "@app/components/v4/ui/separator";

import controlStyles from "./controls.module.css";

const buttonGroupVariants = cva(
  "group/button-group flex w-fit items-stretch *:focus-visible:relative *:focus-visible:z-10 has-[>[data-slot=button-group]]:gap-2 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-lg [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
  {
    variants: {
      orientation: {
        horizontal:
          "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-lg!",
        vertical:
          "flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-b-lg!"
      }
    },
    defaultVariants: {
      orientation: "horizontal"
    }
  }
);

const ButtonGroup = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div"> &
    VariantProps<typeof buttonGroupVariants> & {
      variant?: "attached" | "toolbar" | "spaced";
      label?: string;
    }
>(
  (
    {
      className,
      orientation = "horizontal",
      variant = "attached",
      label,
      onKeyDown,
      onFocus,
      ...props
    },
    ref
  ) => {
    const group = React.useRef<HTMLDivElement | null>(null);
    const controls = () =>
      Array.from(
        group.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], [role="button"]:not([aria-disabled="true"])'
        ) ?? []
      );
    React.useLayoutEffect(() => {
      if (variant !== "toolbar") return;
      const nodes = controls();
      const focused = nodes.find((node) => node === document.activeElement) ?? nodes[0];
      nodes.forEach((node) => {
        node.tabIndex = node === focused ? 0 : -1;
      });
    });
    return (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- This toolbar manages roving focus among its native controls.
      <div
        ref={(node) => {
          group.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) {
            const forwarded = ref;
            forwarded.current = node;
          }
        }}
        onFocus={(event) => {
          onFocus?.(event);
          if (variant === "toolbar")
            controls().forEach((node) => {
              node.tabIndex = node === event.target ? 0 : -1;
            });
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (
            event.defaultPrevented ||
            variant !== "toolbar" ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            (event.target instanceof HTMLElement && event.target.closest("input, textarea, select"))
          )
            return;
          const nodes = controls();
          const index = nodes.findIndex((node) => node === event.target);
          const previous = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
          const next = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
          const target =
            event.key === "Home"
              ? nodes[0]
              : event.key === "End"
                ? nodes[nodes.length - 1]
                : event.key === previous
                  ? nodes[(index - 1 + nodes.length) % nodes.length]
                  : event.key === next
                    ? nodes[(index + 1) % nodes.length]
                    : undefined;
          if (target) {
            event.preventDefault();
            target.focus();
          }
        }}
        role={variant === "toolbar" ? "toolbar" : "group"}
        aria-label={label}
        data-variant={variant}
        data-slot="button-group"
        data-orientation={orientation}
        className={cn(
          variant === "attached"
            ? buttonGroupVariants({ orientation })
            : cn(
                "inline-flex",
                orientation === "vertical" ? "flex-col items-stretch" : "items-center"
              ),
          controlStyles.group,
          className
        )}
        {...props}
      />
    );
  }
);
ButtonGroup.displayName = "ButtonGroup";

const ButtonGroupText = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div"> & {
    asChild?: boolean;
  }
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      ref={ref}
      data-slot="button-group-text"
      className={cn(controlStyles.groupText, className)}
      {...props}
    />
  );
});
ButtonGroupText.displayName = "ButtonGroupText";

const ButtonGroupSeparator = React.forwardRef<
  React.ComponentRef<typeof Separator>,
  React.ComponentPropsWithoutRef<typeof Separator>
>(({ className, orientation = "vertical", ...props }, ref) => {
  return (
    <Separator
      ref={ref}
      data-slot="button-group-separator"
      orientation={orientation}
      className={cn(controlStyles.groupSeparator, className)}
      {...props}
    />
  );
});
ButtonGroupSeparator.displayName = "ButtonGroupSeparator";

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText, buttonGroupVariants };
