import { ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { twMerge } from "tailwind-merge";

type TooltipProps = Omit<TooltipPrimitive.TooltipProps, "children" | "open"> &
  Omit<TooltipPrimitive.TooltipContentProps, "content" | "asChild"> & {
    children: ReactNode;
    content?: ReactNode;
    isOpen?: boolean;
    isDisabled?: boolean;
  };

const Tooltip = ({
  children,
  content,
  isOpen,
  onOpenChange,
  defaultOpen,
  className,
  isDisabled,
  delayDuration = 50,
  disableHoverableContent,
  ...props
}: TooltipProps) => {
  if (!content || isDisabled) return children;

  return (
    <TooltipPrimitive.Root
      delayDuration={delayDuration}
      disableHoverableContent={disableHoverableContent}
      open={isOpen}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          {...props}
          className={twMerge(
            "z-50 w-fit max-w-sm text-balance rounded-[4px] border border-border bg-header px-2 py-1 text-xs text-accent",
            "tooltip-content",
            className,
            typeof content === "string" && "pt-1.5"
          )}
        >
          {content}
          <TooltipPrimitive.Arrow width={10} height={5} className="rounded-none fill-border" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
};

const TooltipProvider = TooltipPrimitive.Provider;

export { Tooltip, type TooltipProps, TooltipProvider };
