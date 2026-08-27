import { AlertTriangle } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { PamHeartbeatStatus } from "@app/hooks/api/pam/enums";

const BADGE: Partial<
  Record<
    PamHeartbeatStatus,
    {
      label: string;
      variant: "danger" | "warning";
      icon: typeof AlertTriangle;
      tooltip: string;
    }
  >
> = {
  [PamHeartbeatStatus.InvalidCredentials]: {
    label: "Out of Sync",
    variant: "danger",
    icon: AlertTriangle,
    tooltip:
      "The stored credential no longer matches the target, so sessions and rotation will fail. Checks are paused until it is updated, since repeated failed logins can lock the account out."
  },
  [PamHeartbeatStatus.CannotCheck]: {
    label: "Unreachable",
    variant: "warning",
    icon: AlertTriangle,
    tooltip:
      "The target could not be reached on the last check, so the credential's state is unknown."
  }
};

// The row only calls out what needs attention, like the stale badge. Healthy is silent, and so is an account
// nobody has checked yet: the schedule will get to it, and one with no credential already has its own badge.
// A stored result also stops being a claim about the present once checking is off, so the badge goes with it.
export const AccountHealthBadge = ({
  status,
  enabled = true
}: {
  status?: string | null;
  enabled?: boolean;
}) => {
  const presentation = enabled && status ? BADGE[status as PamHeartbeatStatus] : undefined;
  if (!presentation) return null;

  const { label, variant, icon: Icon, tooltip } = presentation;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={variant}>
          <Icon className="size-3" />
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
};
