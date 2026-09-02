import { BanIcon, CircleCheckIcon, CircleSlashIcon } from "lucide-react";

import { Badge } from "@app/components/v3";
import { AgentVaultSessionStatus } from "@app/hooks/api/agentVault";

const STATUS_PRESENTATION = {
  [AgentVaultSessionStatus.Active]: { label: "Active", variant: "success", icon: CircleCheckIcon },
  [AgentVaultSessionStatus.Revoked]: { label: "Revoked", variant: "danger", icon: BanIcon },
  [AgentVaultSessionStatus.Expired]: { label: "Expired", variant: "neutral", icon: CircleSlashIcon }
} as const;

export const SessionStatusBadge = ({ status }: { status: AgentVaultSessionStatus }) => {
  const { label, variant, icon: Icon } = STATUS_PRESENTATION[status];

  return (
    <Badge variant={variant}>
      <Icon />
      {label}
    </Badge>
  );
};
