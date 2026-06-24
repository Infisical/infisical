import { format } from "date-fns";
import { ClockIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { SignerRequestStatus, TSignerRequest } from "@app/hooks/api/signers";

import { compactDuration } from "./types";

export const ExpiresCell = ({ req }: { req: TSignerRequest }) => {
  if (req.status === SignerRequestStatus.Pending) {
    return <span>Awaiting approval</span>;
  }
  if (req.status !== SignerRequestStatus.Approved) return null;

  const max = req.maxSignings ?? null;
  const used = req.usedSignings ?? 0;
  const left = max != null ? Math.max(0, max - used) : null;
  const grantInactive = req.grantStatus != null && req.grantStatus !== "active";

  let expiryLabel: string;
  let expiryTooltip: string;
  if (grantInactive) {
    expiryLabel = `Grant ${req.grantStatus}`;
    expiryTooltip = req.expiresAt
      ? format(new Date(req.expiresAt), "MMM d, yyyy 'at' h:mm a")
      : "Grant no longer active";
  } else if (!req.expiresAt) {
    expiryLabel = "No expiry";
    expiryTooltip = "No time limit";
  } else {
    const expires = new Date(req.expiresAt);
    const diff = expires.getTime() - Date.now();
    expiryLabel =
      diff < 0 ? `Expired ${compactDuration(-diff)} ago` : `Expires in ${compactDuration(diff)}`;
    expiryTooltip = format(expires, "MMM d, yyyy 'at' h:mm a");
  }

  const usageLabel =
    left != null && max != null
      ? `${left} of ${max} signing${max === 1 ? "" : "s"} left`
      : "Unlimited signings";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help">
          <div className="flex items-center gap-1.5">
            <ClockIcon className="h-3 w-3 shrink-0" />
            <span>{expiryLabel}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted">{usageLabel}</div>
        </div>
      </TooltipTrigger>
      <TooltipContent>{expiryTooltip}</TooltipContent>
    </Tooltip>
  );
};
