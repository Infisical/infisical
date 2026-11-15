import { ReactElement } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

type Props = {
  reason?: string;
  children: ReactElement;
};

// Wrap a menu item disabled with `isDisabledFocusable`; a plainly disabled item takes no pointer
// events, so its tooltip would never open.
export const BlockedActionTooltip = ({ reason, children }: Props) => {
  if (!reason) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="left" sideOffset={20} className="max-w-72">
        {reason}
      </TooltipContent>
    </Tooltip>
  );
};
