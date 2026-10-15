import { differenceInDays, format, formatDistanceToNowStrict, isThisYear } from "date-fns";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

type Props = {
  secret?: Pick<SecretV3RawSanitized, "createdAt" | "updatedAt" | "version">;
  field?: "createdAt" | "updatedAt";
};

const formatLastEdited = (date: Date) => {
  if (differenceInDays(new Date(), date) < 7) {
    return formatDistanceToNowStrict(date, { addSuffix: true });
  }

  return format(date, isThisYear(date) ? "MMM d" : "MMM d, yyyy");
};

export const SecretLastEditedTime = ({ secret, field = "updatedAt" }: Props) => {
  if (!secret?.updatedAt) return null;
  const shownAt = new Date(secret[field]);
  const updatedAt = new Date(secret.updatedAt);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="ml-auto shrink-0 rounded-sm whitespace-nowrap text-muted tabular-nums focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
        >
          {formatLastEdited(shownAt)}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">
        <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
          <span className="text-muted">Last edited</span>
          <span>{format(updatedAt, "MMM d, yyyy, h:mm a")}</span>
          <span className="text-muted">Created</span>
          <span>{format(new Date(secret.createdAt), "MMM d, yyyy, h:mm a")}</span>
          <span className="text-muted">Version</span>
          <span>v{secret.version}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
