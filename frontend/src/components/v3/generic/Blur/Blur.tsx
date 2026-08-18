import type { ComponentProps } from "react";

import { cn } from "../../utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../Tooltip";

type BlurProps = ComponentProps<"div"> & {
  tooltipText?: string;
};

export const Blur = ({ className, tooltipText, tabIndex, ...props }: BlurProps) => {
  const content = (
    <div
      className={cn("flex w-80 grow items-center py-1 pr-2 pl-4", className)}
      tabIndex={tabIndex ?? (tooltipText ? 0 : undefined)}
      {...props}
    >
      <span className="blur-sm">xxxxxxxxxxxx</span>
    </div>
  );

  if (!tooltipText) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent className="max-w-md">{tooltipText}</TooltipContent>
    </Tooltip>
  );
};
