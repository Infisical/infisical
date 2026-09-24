import { Info } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

type Props = {
  hoverTooltip?: string;
  className?: string;
  label: string;
  children: React.ReactNode;
  tooltipText?: string;
};

export const LogFilterItem = ({ label, hoverTooltip, children, className, tooltipText }: Props) => {
  return (
    <div className={twMerge("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex items-center gap-1">
        <p className="text-xs text-muted">{label}</p>
        {tooltipText && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="ml-1 size-3 text-muted" />
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">{tooltipText}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {hoverTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div>{children}</div>
          </TooltipTrigger>
          <TooltipContent>{hoverTooltip}</TooltipContent>
        </Tooltip>
      ) : (
        <div>{children}</div>
      )}
    </div>
  );
};
