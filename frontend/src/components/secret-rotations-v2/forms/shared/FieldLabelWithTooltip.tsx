import { ReactNode } from "react";
import { HelpCircleIcon } from "lucide-react";

import { FieldLabel, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

type Props = {
  htmlFor?: string;
  children: ReactNode;
  tooltip?: ReactNode;
  tooltipClassName?: string;
};

export const FieldLabelWithTooltip = ({ htmlFor, children, tooltip, tooltipClassName }: Props) => {
  if (!tooltip) {
    return <FieldLabel htmlFor={htmlFor}>{children}</FieldLabel>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <FieldLabel htmlFor={htmlFor}>{children}</FieldLabel>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="More information"
            className="rounded-sm text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HelpCircleIcon className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className={tooltipClassName ?? "max-w-sm"}>{tooltip}</TooltipContent>
      </Tooltip>
    </div>
  );
};
