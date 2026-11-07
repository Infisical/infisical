import type { ReactNode } from "react";

import { TooltipProvider } from "@app/components/v4/ui/tooltip";

export const AccessFrame = ({ children }: { children: ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
);
