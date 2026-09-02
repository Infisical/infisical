import { formatDistanceToNowStrict } from "date-fns";
import { InfinityIcon } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

type Props = {
  expiresAt: string | null;
};

// A session with no expiry is a permanent bearer token that makes a proxy attach production
// credentials, so it is called out rather than rendered as an empty cell.
export const SessionExpiry = ({ expiresAt }: Props) => {
  if (!expiresAt) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="warning">
            <InfinityIcon />
            Never
          </Badge>
        </TooltipTrigger>
        <TooltipContent>This token works until someone revokes it.</TooltipContent>
      </Tooltip>
    );
  }

  const expiry = new Date(expiresAt);
  const hasPassed = expiry.getTime() <= Date.now();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-sm">
          {hasPassed ? "" : "in "}
          {formatDistanceToNowStrict(expiry, { addSuffix: hasPassed })}
        </span>
      </TooltipTrigger>
      <TooltipContent>{expiry.toLocaleString()}</TooltipContent>
    </Tooltip>
  );
};
