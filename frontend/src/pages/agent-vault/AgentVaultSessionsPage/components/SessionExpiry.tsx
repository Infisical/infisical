import { format, formatDistanceToNowStrict } from "date-fns";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

type Props = {
  expiresAt: string | null;
};

export const formatSessionExpiry = (expiresAt: string | null) => {
  if (!expiresAt) return "Never";
  const expiry = new Date(expiresAt);
  const hasPassed = expiry.getTime() <= Date.now();
  return `${hasPassed ? "" : "in "}${formatDistanceToNowStrict(expiry, { addSuffix: hasPassed })}`;
};

export const SessionExpiry = ({ expiresAt }: Props) => {
  if (!expiresAt) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-sm">Never</span>
        </TooltipTrigger>
        <TooltipContent>This session runs until someone revokes it.</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-sm">{formatSessionExpiry(expiresAt)}</span>
      </TooltipTrigger>
      <TooltipContent>{format(new Date(expiresAt), "MMM d, yyyy h:mm a")}</TooltipContent>
    </Tooltip>
  );
};
