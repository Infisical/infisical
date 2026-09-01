import { Info } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

type Props = {
  hoverTooltip?: string;
  className?: string;
  label: string;
  onClear: () => void;
  children: React.ReactNode;
  tooltipText?: string;
};

export const LogFilterItem = ({
  label,
  onClear,
  hoverTooltip,
  children,
  className,
  tooltipText
}: Props) => {
  return (
    <div className={twMerge("flex flex-col justify-between", className)}>
      <div className="flex items-center pr-1">
        <p className="text-xs text-muted">{label}</p>
        {tooltipText && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="ml-1 size-3 text-muted" />
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">{tooltipText}</TooltipContent>
          </Tooltip>
        )}
        <Button
          onClick={() => onClear()}
          variant="ghost"
          size="xs"
          className="ml-auto h-auto px-1.5 py-0.5 text-xs font-normal text-muted hover:text-foreground"
        >
          Clear
        </Button>
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
