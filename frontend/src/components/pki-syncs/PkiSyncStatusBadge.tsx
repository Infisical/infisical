import {
  faCheck,
  faExclamationTriangle,
  faHourglass,
  faRotate,
  IconDefinition
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Badge, BadgeProps } from "@app/components/v2/Badge/Badge";
import { PkiSyncStatus } from "@app/hooks/api/pkiSyncs";

type Props = {
  status: PkiSyncStatus;
} & Omit<BadgeProps, "children" | "variant">;

export const PkiSyncStatusBadge = ({ status }: Props) => {
  let variant: BadgeProps["variant"];
  let text: string;
  let icon: IconDefinition;

  switch (status) {
    case PkiSyncStatus.Failed:
      variant = "danger";
      text = "Failed to Sync";
      icon = faExclamationTriangle;
      break;
    case PkiSyncStatus.Succeeded:
      variant = "success";
      text = "Synced";
      icon = faCheck;
      break;
    case PkiSyncStatus.Pending:
      variant = "primary";
      text = "Queued";
      icon = faHourglass;
      break;
    case PkiSyncStatus.Running:
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
        className={[PkiSyncStatus.Running].includes(status) ? "animate-spin" : ""}
      />
      <span>{text}</span>
    </Badge>
  );
};
