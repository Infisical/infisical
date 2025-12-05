import {
  ActivityIcon,
  BanIcon,
  ChevronsLeftRightEllipsisIcon,
  ClockIcon,
  GavelIcon,
  LucideIcon
} from "lucide-react";

import { Badge, TBadgeProps } from "@app/components/v3";
import { PamSessionStatus } from "@app/hooks/api/pam";

interface StatusConfig {
  variant: TBadgeProps["variant"];
  icon: LucideIcon;
  className?: string;
}

const PAM_SESSION_STATUS_CONFIG: Record<PamSessionStatus, StatusConfig> = {
  [PamSessionStatus.Active]: {
    variant: "success",
    icon: ActivityIcon,
    className: "animate-pulse"
  },
  [PamSessionStatus.Terminated]: {
    variant: "danger",
    icon: GavelIcon
  },
  [PamSessionStatus.Starting]: {
    variant: "info",
    icon: ChevronsLeftRightEllipsisIcon,
    className: "animate-pulse"
  },
  [PamSessionStatus.Ended]: {
    variant: "neutral",
    icon: BanIcon
  },
  [PamSessionStatus.Expired]: {
    variant: "warning",
    icon: ClockIcon
  }
};

export const PamSessionStatusBadge = ({ status }: { status: PamSessionStatus }) => {
  const config = PAM_SESSION_STATUS_CONFIG[status];

  const displayName = status[0].toUpperCase() + status.slice(1);

  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={config.className}>
      <Icon />
      {displayName}
    </Badge>
  );
};
