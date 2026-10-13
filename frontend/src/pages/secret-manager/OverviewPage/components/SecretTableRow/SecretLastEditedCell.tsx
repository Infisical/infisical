import { differenceInDays, format, formatDistanceToNowStrict, isThisYear } from "date-fns";
import { twMerge } from "tailwind-merge";

import { TableCell, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

type Props = {
  secret?: Pick<SecretV3RawSanitized, "createdAt" | "updatedAt" | "version">;
  className?: string;
};

const formatLastEdited = (date: Date) => {
  if (differenceInDays(new Date(), date) < 7) {
    return formatDistanceToNowStrict(date, { addSuffix: true });
  }

  return format(date, isThisYear(date) ? "MMM d" : "MMM d, yyyy");
};

export const SecretLastEditedCell = ({ secret, className }: Props) => {
  const updatedAt = secret?.updatedAt ? new Date(secret.updatedAt) : null;

  return (
    <TableCell className={twMerge("border-l text-xs whitespace-nowrap text-label", className)}>
      {updatedAt && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="tabular-nums">{formatLastEdited(updatedAt)}</span>
          </TooltipTrigger>
          <TooltipContent side="left">
            <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
              <span className="text-muted">Last edited</span>
              <span>{format(updatedAt, "MMM d, yyyy, h:mm a")}</span>
              {secret?.createdAt && (
                <>
                  <span className="text-muted">Created</span>
                  <span>{format(new Date(secret.createdAt), "MMM d, yyyy, h:mm a")}</span>
                </>
              )}
              <span className="text-muted">Version</span>
              <span>v{secret?.version}</span>
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </TableCell>
  );
};
