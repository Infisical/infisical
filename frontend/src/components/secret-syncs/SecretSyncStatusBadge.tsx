import { useMemo } from "react";
import { format } from "date-fns";
import {
  AlertTriangleIcon,
  CalendarCheckIcon,
  CheckIcon,
  HourglassIcon,
  LucideIcon,
  RefreshCwIcon,
  XIcon
} from "lucide-react";

import {
  Badge,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  TBadgeProps
} from "@app/components/v3";
import { SecretSyncStatus } from "@app/hooks/api/secretSyncs";

type Props = {
  status: SecretSyncStatus;
  lastSyncedAt?: Date | string | null;
  lastSyncMessage?: string | null;
} & Omit<TBadgeProps, "children" | "variant">;

export const SecretSyncStatusBadge = ({ status, lastSyncedAt, lastSyncMessage }: Props) => {
  let variant: TBadgeProps["variant"];
  let text: string;
  let Icon: LucideIcon;

  switch (status) {
    case SecretSyncStatus.Failed:
      variant = "danger";
      text = "Failed to Sync";
      Icon = AlertTriangleIcon;
      break;
    case SecretSyncStatus.Succeeded:
      variant = "success";
      text = "Synced";
      Icon = CheckIcon;
      break;
    case SecretSyncStatus.Pending:
      variant = "info";
      text = "Queued";
      Icon = HourglassIcon;
      break;
    case SecretSyncStatus.Running:
    default:
      variant = "info";
      text = "Syncing";
      Icon = RefreshCwIcon;
      break;
  }

  const failureMessage = useMemo(() => {
    if (status === SecretSyncStatus.Failed) {
      if (lastSyncMessage)
        try {
          return JSON.stringify(JSON.parse(lastSyncMessage), null, 2);
        } catch {
          return lastSyncMessage;
        }

      return "An Unknown Error Occurred.";
    }
    return null;
  }, [status, lastSyncMessage]);

  const badge = (
    <Badge variant={variant}>
      <Icon className={[SecretSyncStatus.Running].includes(status) ? "animate-spin" : ""} />
      {text}
    </Badge>
  );

  if (
    ![SecretSyncStatus.Succeeded, SecretSyncStatus.Failed].includes(status) ||
    (!lastSyncedAt && !failureMessage)
  ) {
    return badge;
  }

  return (
    <HoverCard openDelay={150} closeDelay={150}>
      <HoverCardTrigger asChild>{badge}</HoverCardTrigger>
      <HoverCardContent side="left" className="w-auto max-w-sm">
        <div className="flex flex-col gap-2 py-1 whitespace-normal">
          {lastSyncedAt && (
            <div>
              <div
                className={`mb-2 flex items-center gap-1.5 self-start ${status === SecretSyncStatus.Failed ? "text-warning" : "text-success"}`}
              >
                <CalendarCheckIcon className="size-3" />
                <div className="text-xs">Last Synced</div>
              </div>
              <div className="rounded-sm bg-mineshaft-600 p-2 text-xs">
                {format(new Date(lastSyncedAt), "yyyy-MM-dd, hh:mm aaa")}
              </div>
            </div>
          )}
          {failureMessage && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 self-start text-danger">
                <XIcon className="size-3" />
                <div className="text-xs">Failure Reason</div>
              </div>
              <div className="rounded-sm bg-mineshaft-600 p-2 text-xs break-words">
                {failureMessage}
              </div>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};
