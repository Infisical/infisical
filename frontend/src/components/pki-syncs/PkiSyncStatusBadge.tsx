import {
  AlertTriangleIcon,
  CheckIcon,
  HourglassIcon,
  LucideIcon,
  RefreshCwIcon
} from "lucide-react";

import { Badge, TBadgeProps } from "@app/components/v3";
import { PkiSyncStatus } from "@app/hooks/api/pkiSyncs";

type Props = {
  status: PkiSyncStatus;
} & Omit<TBadgeProps, "children" | "variant">;

export const PkiSyncStatusBadge = ({ status }: Props) => {
  let variant: TBadgeProps["variant"];
  let text: string;
  let Icon: LucideIcon;

  switch (status) {
    case PkiSyncStatus.Failed:
      variant = "danger";
      text = "Failed to Sync";
      Icon = AlertTriangleIcon;
      break;
    case PkiSyncStatus.Succeeded:
      variant = "success";
      text = "Synced";
      Icon = CheckIcon;
      break;
    case PkiSyncStatus.Pending:
      variant = "info";
      text = "Queued";
      Icon = HourglassIcon;
      break;
    case PkiSyncStatus.Running:
    default:
      variant = "info";
      text = "Syncing";
      Icon = RefreshCwIcon;
      break;
  }

  return (
    <Badge variant={variant}>
      <Icon className={status === PkiSyncStatus.Running ? "animate-spin" : ""} />
      {text}
    </Badge>
  );
};
