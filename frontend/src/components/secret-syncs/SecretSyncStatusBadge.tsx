import { useMemo } from "react";
import { faCalendarCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import {
  AlertTriangleIcon,
  CheckIcon,
  HourglassIcon,
  LucideIcon,
  RefreshCwIcon
} from "lucide-react";

import { Tooltip } from "@app/components/v2";
import { Badge, TBadgeProps } from "@app/components/v3";
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
    <Tooltip
      position="left"
      className="max-w-sm"
      content={
        <div className="flex flex-col gap-2 py-1 whitespace-normal">
          {lastSyncedAt && (
            <div>
              <div
                className={`mb-2 flex self-start ${status === SecretSyncStatus.Failed ? "text-yellow" : "text-green"}`}
              >
                <FontAwesomeIcon icon={faCalendarCheck} className="ml-1 pt-0.5 pr-1.5 text-sm" />
                <div className="text-xs">Last Synced</div>
              </div>
              <div className="rounded-sm bg-mineshaft-600 p-2 text-xs">
                {format(new Date(lastSyncedAt), "yyyy-MM-dd, hh:mm aaa")}
              </div>
            </div>
          )}
          {failureMessage && (
            <div>
              <div className="mb-2 flex self-start text-red">
                <FontAwesomeIcon icon={faXmark} className="ml-1 pt-0.5 pr-1.5 text-sm" />
                <div className="text-xs">Failure Reason</div>
              </div>
              <div className="rounded-sm bg-mineshaft-600 p-2 text-xs break-words">
                {failureMessage}
              </div>
            </div>
          )}
        </div>
      }
    >
      <div>{badge}</div>
    </Tooltip>
  );
};
