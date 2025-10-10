import { ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { TooltipProps as RootProps } from "@radix-ui/react-tooltip";
import { twMerge } from "tailwind-merge";

export type TooltipProps = Omit<TooltipPrimitive.TooltipContentProps, "open" | "content"> & {
  children: ReactNode;
  content?: ReactNode;
  isOpen?: boolean;
  className?: string;
  asChild?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  defaultOpen?: boolean;
  position?: "top" | "bottom" | "left" | "right";
  isDisabled?: boolean;
  center?: boolean;
  size?: "sm" | "md";
  rootProps?: RootProps;
  delayDuration?: number;
};

export const Tooltip = ({
  children,
  content,
  isOpen,
  onOpenChange,
  defaultOpen,
  className,
  center,
  asChild = true,
  isDisabled,
  position = "top",
  size = "md",
  rootProps,
  delayDuration = 50,
  ...props
}: TooltipProps) =>
  // just render children if tooltip content is empty
  content ? (
    <TooltipPrimitive.Root
      delayDuration={delayDuration}
      {...rootProps}
      open={isOpen}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      <TooltipPrimitive.Trigger asChild={asChild}>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={position}
          align="center"
          sideOffset={5}
          {...props}
          className={twMerge(
            "data-[state=delayed-open]:data-[side=bottom]:animate-slide-up-and-fade data-[state=delayed-open]:data-[side=left]:animate-slide-right-and-fade data-[state=delayed-open]:data-[side=right]:animate-slide-left-and-fade data-[state=delayed-open]:data-[side=top]:animate-slide-down-and-fade z-50 max-w-60 border border-mineshaft-600 bg-mineshaft-800 font-light text-bunker-200 shadow-md select-none",
            isDisabled && "hidden!",
            center && "text-center",
            size === "sm" && "rounded-xs px-2 py-1 text-xs",
            size === "md" && "rounded-md px-4 py-2 text-sm",
            className
          )}
        >
          {content}
          <TooltipPrimitive.Arrow width={11} height={5} className="fill-mineshaft-600" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  ) : (
    // eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>
  );

export const TooltipProvider = TooltipPrimitive.Provider;
