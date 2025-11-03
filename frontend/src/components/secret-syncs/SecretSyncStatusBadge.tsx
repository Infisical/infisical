import {
  AlertTriangleIcon,
  CheckIcon,
  HourglassIcon,
  LucideIcon,
  RefreshCwIcon
} from "lucide-react";

import { Badge, TBadgeProps } from "@app/components/v3";
import { SecretSyncStatus } from "@app/hooks/api/secretSyncs";

type Props = {
  status: SecretSyncStatus;
} & Omit<TBadgeProps, "children" | "variant">;

export const SecretSyncStatusBadge = ({ status }: Props) => {
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

  return (
    <Badge variant={variant}>
      <Icon className={[SecretSyncStatus.Running].includes(status) ? "animate-spin" : ""} />
      {text}
    </Badge>
  );
};
