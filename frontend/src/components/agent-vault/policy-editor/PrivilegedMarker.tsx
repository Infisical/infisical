import { ShieldAlertIcon } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

// The one marker for a privileged row or level, wherever the editor shows one. The tooltip says why, when the caller
// has the reason; inside a select option a tooltip can't open, so the row's own marker carries it there.
export const PrivilegedMarker = ({ risk }: { risk?: string }) => {
  const marker = (
    <Badge variant="outline" data-row-interactive>
      <ShieldAlertIcon />
      Privileged
    </Badge>
  );
  if (!risk) return marker;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{marker}</TooltipTrigger>
      <TooltipContent className="max-w-xs">{risk}</TooltipContent>
    </Tooltip>
  );
};
