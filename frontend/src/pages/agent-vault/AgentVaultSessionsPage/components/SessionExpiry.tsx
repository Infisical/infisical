import { format, formatDistanceToNowStrict } from "date-fns";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

type Props = {
  expiresAt: string | null;
};

export const SessionExpiry = ({ expiresAt }: Props) => {
  if (!expiresAt) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-sm">Never</span>
        </TooltipTrigger>
        <TooltipContent>This session works until it is revoked.</TooltipContent>
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
      <TooltipContent>{format(expiry, "MMM d, yyyy h:mm a")}</TooltipContent>
    </Tooltip>
  );
};
