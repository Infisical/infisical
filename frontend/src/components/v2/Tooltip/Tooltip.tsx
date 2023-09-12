import { ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
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
};

export const Tooltip = ({
  children,
  content,
  isOpen,
  onOpenChange,
  defaultOpen,
  className,
  asChild = true,
  position = "top",
  ...props
}: TooltipProps) => (
  <TooltipPrimitive.Root
    delayDuration={50}
    open={isOpen}
    defaultOpen={defaultOpen}
    onOpenChange={onOpenChange}
  >
    <TooltipPrimitive.Trigger asChild={asChild}>{children}</TooltipPrimitive.Trigger>
    <TooltipPrimitive.Content
      side={position}
      align="center"
      sideOffset={5}
      {...props}
      className={twMerge(
        `z-50 max-w-[15rem] select-none rounded-md border border-mineshaft-600 bg-mineshaft-800 py-2 px-4 text-sm font-light text-bunker-200 shadow-md 
data-[state=delayed-open]:data-[side=top]:animate-slideDownAndFade
data-[state=delayed-open]:data-[side=right]:animate-slideLeftAndFade
data-[state=delayed-open]:data-[side=left]:animate-slideRightAndFade
data-[state=delayed-open]:data-[side=bottom]:animate-slideUpAndFade
`,
        className
      )}
    >
      {content}
      <TooltipPrimitive.Arrow width={11} height={5} className="fill-mineshaft-600" />
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Root>
);

export const TooltipProvider = TooltipPrimitive.Provider;
