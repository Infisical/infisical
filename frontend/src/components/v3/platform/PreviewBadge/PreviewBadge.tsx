import { Badge } from "../../generic/Badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../generic/Tooltip";
import { cn } from "../../utils";

const LABEL = "Preview";

export const PREVIEW_BADGE_DESCRIPTION =
  "This product is in preview. It may change in backward-incompatible ways and isn't recommended for production workloads.";

type TPreviewBadgeProps = {
  className?: string;
  withTooltip?: boolean;
};

export function PreviewBadge({ className, withTooltip = true }: TPreviewBadgeProps) {
  // The badge renders inside buttons and command items, so it stays non-focusable and carries the
  // description as screen reader text on its focusable ancestor instead of a focusable tooltip.
  const badge = (
    <Badge variant="warning" className={cn(className)}>
      {LABEL}
      <span className="sr-only">. {PREVIEW_BADGE_DESCRIPTION}</span>
    </Badge>
  );

  if (!withTooltip) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-64">{PREVIEW_BADGE_DESCRIPTION}</TooltipContent>
    </Tooltip>
  );
}
