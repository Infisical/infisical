import { ReactNode } from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import { twMerge } from "tailwind-merge";

export const HoverCardTrigger = HoverCardPrimitive.Trigger;

export const HoverCard = HoverCardPrimitive.Root;

export type HoverCardContentProps = {
  children?: ReactNode;
} & HoverCardPrimitive.HoverCardContentProps;

export const HoverCardContent = ({ children, className, ...props }: HoverCardContentProps) => (
  <HoverCardPrimitive.Portal>
    <HoverCardPrimitive.Content
      {...props}
      className={twMerge(
        "relative w-64 rounded-md bg-popover fill-popover p-4 pt-6 font-inter text-foreground shadow-md",
        className
      )}
    >
      {children}
      <HoverCardPrimitive.Arrow className="fill-inherit stroke-inherit" />
    </HoverCardPrimitive.Content>
  </HoverCardPrimitive.Portal>
);
