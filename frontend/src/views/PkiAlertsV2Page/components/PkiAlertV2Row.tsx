import {
  faCircleInfo,
  faEllipsisH,
  faEye,
  faPencil,
  faPlay,
  faStop,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { PkiAlertEventTypeV2, TPkiAlertV2, useUpdatePkiAlertV2 } from "@app/hooks/api/pkiAlertsV2";

interface Props {
  alert: TPkiAlertV2;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export const PkiAlertV2Row = ({ alert, onView, onEdit, onDelete }: Props) => {
  const { mutateAsync: updateAlert } = useUpdatePkiAlertV2();

  const formatEventType = (eventType: PkiAlertEventTypeV2) => {
    switch (eventType) {
      case PkiAlertEventTypeV2.EXPIRATION:
        return "Certificate Expiration";
      case PkiAlertEventTypeV2.RENEWAL:
        return "Certificate Renewal";
      case PkiAlertEventTypeV2.ISSUANCE:
        return "Certificate Issuance";
      case PkiAlertEventTypeV2.REVOCATION:
        return "Certificate Revocation";
      default:
        return eventType;
    }
  };

  const handleToggleAlert = async () => {
    try {
      await updateAlert({
        alertId: alert.id,
        enabled: !alert.enabled
      });
      createNotification({
        text: `Alert ${!alert.enabled ? "enabled" : "disabled"} successfully`,
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed to update alert status",
        type: "error"
      });
    }
  };

  const formatAlertBefore = (alertBefore?: string) => {
    if (!alertBefore) return "-";

    const match = alertBefore.match(/^(\\d+)([dwmy])$/);
    if (!match) return alertBefore;

    const [, value, unit] = match;
    const unitMap = {
      d: "days",
      w: "weeks",
      m: "months",
      y: "years"
    };

    return `${value} ${unitMap[unit as keyof typeof unitMap] || unit}`;
  };

  return (
    <Tr>
      <Td>
        <div className="flex items-center gap-2">
          <div className="font-medium text-gray-200">{alert.name}</div>
          {alert.description && (
            <Tooltip content={alert.description}>
              <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
            </Tooltip>
          )}
        </div>
      </Td>
      <Td>
        <span className="text-gray-300">{formatEventType(alert.eventType)}</span>
      </Td>
      <Td>
        <Badge variant={alert.enabled ? "success" : "neutral"}>
          {alert.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </Td>
      <Td className="text-gray-300">{formatAlertBefore(alert.alertBefore)}</Td>
      <Td className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton size="sm" variant="plain" ariaLabel="Alert actions">
              <FontAwesomeIcon icon={faEllipsisH} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onView}>
              <FontAwesomeIcon icon={faEye} className="mr-2 h-4 w-4" />
              View details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}>
              <FontAwesomeIcon icon={faPencil} className="mr-2 h-4 w-4" />
              Edit alert
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleToggleAlert}>
              <FontAwesomeIcon icon={alert.enabled ? faStop : faPlay} className="mr-2 h-4 w-4" />
              {alert.enabled ? "Disable" : "Enable"} alert
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-red-600">
              <FontAwesomeIcon icon={faTrash} className="mr-2 h-4 w-4" />
              Delete alert
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Td>
    </Tr>
  );
};
