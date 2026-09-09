import { MailIcon } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

export const PendingInvitationBadge = ({ isPending }: { isPending: boolean }) => {
  if (!isPending) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="info">
          <MailIcon />
          Pending Invitation
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Access begins once they accept their organization invitation.</TooltipContent>
    </Tooltip>
  );
};
