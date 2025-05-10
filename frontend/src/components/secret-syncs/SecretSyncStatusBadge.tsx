import {
  faCheck,
  faExclamationTriangle,
  faRotate,
  IconDefinition
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Badge, BadgeProps } from "@app/components/v2/Badge/Badge";
import { SecretSyncStatus } from "@app/hooks/api/secretSyncs";

type Props = {
  status: SecretSyncStatus;
} & Omit<BadgeProps, "children" | "variant">;

export const SecretSyncStatusBadge = ({ status }: Props) => {
  let variant: BadgeProps["variant"];
  let text: string;
  let icon: IconDefinition;

  switch (status) {
    case SecretSyncStatus.Failed:
      variant = "danger";
      text = "Failed to Sync";
      icon = faExclamationTriangle;
      break;
    case SecretSyncStatus.Succeeded:
      variant = "success";
      text = "Synced";
      icon = faCheck;
      break;
    case SecretSyncStatus.Pending: // no need to differentiate from user perspective
    case SecretSyncStatus.Running:
    default:
      variant = "primary";
      text = "Syncing";
      icon = faRotate;
      break;
  }

  return (
    <Badge className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap" variant={variant}>
      <FontAwesomeIcon
        icon={icon}
        className={
          [SecretSyncStatus.Pending, SecretSyncStatus.Running].includes(status)
            ? "animate-spin"
            : ""
        }
      />
      <span>{text}</span>
    </Badge>
  );
};
