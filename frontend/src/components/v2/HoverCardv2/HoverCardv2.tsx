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
        "relative w-64 rounded-md bg-surface-active fill-surface-active p-4 pt-6 font-inter text-foreground-cool shadow-md",
        className
      )}
    >
      {children}
      <HoverCardPrimitive.Arrow className="fill-inherit stroke-inherit" />
    </HoverCardPrimitive.Content>
  </HoverCardPrimitive.Portal>
);
