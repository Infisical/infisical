import { ReactNode } from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import { twMerge } from "tailwind-merge";

import { LayerPortal } from "@app/components/overlays/OverlayLayer";

export const HoverCardTrigger = HoverCardPrimitive.Trigger;

export const HoverCard = HoverCardPrimitive.Root;

export type HoverCardContentProps = {
  children?: ReactNode;
} & HoverCardPrimitive.HoverCardContentProps;

export const HoverCardContent = ({ children, className, ...props }: HoverCardContentProps) => (
  <LayerPortal portal={HoverCardPrimitive.Portal}>
    <HoverCardPrimitive.Content
      {...props}
      className={twMerge(
        "relative z-layer-floating w-64 rounded-md bg-mineshaft-600 fill-mineshaft-600 p-4 pt-6 font-inter text-gray-200 shadow-md",
        className
      )}
    >
      {children}
      <HoverCardPrimitive.Arrow className="fill-inherit stroke-inherit" />
    </HoverCardPrimitive.Content>
  </LayerPortal>
);
