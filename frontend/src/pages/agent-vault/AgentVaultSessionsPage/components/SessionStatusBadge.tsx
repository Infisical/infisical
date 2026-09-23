import { BanIcon, CircleCheckIcon, CircleSlashIcon } from "lucide-react";

import { Badge } from "@app/components/v3";
import { AgentVaultSessionStatus } from "@app/hooks/api/agentVault";

export const SESSION_STATUS_PRESENTATION = {
  [AgentVaultSessionStatus.Active]: {
    label: "Active",
    variant: "success",
    icon: CircleCheckIcon,
    iconClassName: "text-success"
  },
  [AgentVaultSessionStatus.Revoked]: {
    label: "Revoked",
    variant: "danger",
    icon: BanIcon,
    iconClassName: "text-danger"
  },
  [AgentVaultSessionStatus.Expired]: {
    label: "Expired",
    variant: "neutral",
    icon: CircleSlashIcon,
    iconClassName: "text-neutral"
  }
} as const;

export const SessionStatusBadge = ({ status }: { status: AgentVaultSessionStatus }) => {
  const { label, variant, icon: Icon } = SESSION_STATUS_PRESENTATION[status];

  return (
    <Badge variant={variant}>
      <Icon />
      {label}
    </Badge>
  );
};
