import { Badge } from "../../generic/Badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../generic/Tooltip";
import { cn } from "../../utils";

const LABEL = "Preview";
const DESCRIPTION =
  "This product is in preview. It may change in backward-incompatible ways and isn't recommended for production workloads.";

type TPreviewBadgeProps = {
  className?: string;
};

export function PreviewBadge({ className }: TPreviewBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="warning" className={cn(className)}>
          {LABEL}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{DESCRIPTION}</TooltipContent>
    </Tooltip>
  );
}
