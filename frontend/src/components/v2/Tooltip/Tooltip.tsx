import { ReactNode } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { twMerge } from 'tailwind-merge';

export type TooltipProps = {
  children: ReactNode;
  content?: ReactNode;
  isOpen?: boolean;
  className?: string;
  asChild?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  defaultOpen?: boolean;
} & Omit<TooltipPrimitive.TooltipContentProps, 'open'>;

export const Tooltip = ({
  children,
  content,
  isOpen,
  onOpenChange,
  defaultOpen,
  className,
  asChild = true,
  ...props
}: TooltipProps) => (
  <TooltipPrimitive.Root
    delayDuration={150}
    open={isOpen}
    defaultOpen={defaultOpen}
    onOpenChange={onOpenChange}
  >
    <TooltipPrimitive.Trigger asChild={asChild}>{children}</TooltipPrimitive.Trigger>
    <TooltipPrimitive.Content
      side="top"
      align="center"
      sideOffset={5}
      {...props}
      className={twMerge(
        `z-20 select-none rounded-md bg-mineshaft-500 py-2 px-4 text-sm text-bunker-200 shadow-md 
data-[state=delayed-open]:data-[side=top]:animate-slideDownAndFade
data-[state=delayed-open]:data-[side=right]:animate-slideLeftAndFade
data-[state=delayed-open]:data-[side=left]:animate-slideRightAndFade
data-[state=delayed-open]:data-[side=bottom]:animate-slideUpAndFade
`,
        className
      )}
    >
      {content}
      <TooltipPrimitive.Arrow width={11} height={5} className="fill-mineshaft-500" />
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Root>
);

export const TooltipProvider = TooltipPrimitive.Provider;
