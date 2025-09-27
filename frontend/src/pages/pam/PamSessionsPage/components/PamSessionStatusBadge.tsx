import {
  faBan,
  faCircle,
  faGavel,
  faHourglass,
  IconDefinition
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Badge } from "@app/components/v2";
import { PamSessionStatus } from "@app/hooks/api/pam";

interface StatusConfig {
  bgColor: string;
  textColor: string;
  icon: IconDefinition;
  iconClassName?: string;
}

const PAM_SESSION_STATUS_CONFIG: Record<PamSessionStatus, StatusConfig> = {
  [PamSessionStatus.Active]: {
    bgColor: "bg-green/20",
    textColor: "text-green",
    icon: faCircle,
    iconClassName: "size-2 animate-pulse"
  },
  [PamSessionStatus.Terminated]: {
    bgColor: "bg-red/20",
    textColor: "text-red",
    icon: faGavel
  },
  [PamSessionStatus.Starting]: {
    bgColor: "bg-yellow/20",
    textColor: "text-yellow",
    icon: faHourglass,
    iconClassName: "animate-spin"
  },
  [PamSessionStatus.Ended]: {
    bgColor: "bg-bunker-300/20",
    textColor: "text-bunker-300",
    icon: faBan
  }
};

export const PamSessionStatusBadge = ({ status }: { status: PamSessionStatus }) => {
  const config = PAM_SESSION_STATUS_CONFIG[status];

  const displayName = status[0].toUpperCase() + status.slice(1);

  return (
    <Badge
      className={twMerge(
        "flex h-5 w-min items-center gap-1.5 whitespace-nowrap",
        config.bgColor,
        config.textColor
      )}
    >
      <FontAwesomeIcon icon={config.icon} className={config.iconClassName} />
      {displayName}
    </Badge>
  );
};
