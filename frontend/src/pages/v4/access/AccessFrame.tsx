import type { ReactNode } from "react";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";

export const AccessFrame = ({ children }: { children: ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
);
