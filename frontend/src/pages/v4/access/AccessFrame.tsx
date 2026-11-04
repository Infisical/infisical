import type { ReactNode } from "react";

import { TooltipProvider } from "@app/components/v4/ui/tooltip";

import { AccessToasts } from "./toast";

export const AccessFrame = ({ children }: { children: ReactNode }) => (
  <TooltipProvider>
    {children}
    <AccessToasts />
  </TooltipProvider>
);
