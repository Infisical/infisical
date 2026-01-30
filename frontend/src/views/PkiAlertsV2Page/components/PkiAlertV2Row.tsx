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
import { TPkiAlertV2, useUpdatePkiAlertV2 } from "@app/hooks/api/pkiAlertsV2";

import { formatAlertBefore, formatEventType } from "../utils/pki-alert-formatters";

interface Props {
  alert: TPkiAlertV2;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export const PkiAlertV2Row = ({ alert, onView, onEdit, onDelete }: Props) => {
  const { mutateAsync: updateAlert } = useUpdatePkiAlertV2();

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
      <Td>
        {alert.lastRun ? (
          <Tooltip
            content={
              <div className="max-w-sm">
                <div className="text-xs text-mineshaft-300">
                  {new Date(alert.lastRun.timestamp)
                    .toISOString()
                    .replace("T", " ")
                    .replace("Z", " UTC")}
                </div>
                {alert.lastRun.error && (
                  <div className="mt-1 text-xs break-words text-red-400">{alert.lastRun.error}</div>
                )}
              </div>
            }
          >
            <Badge variant={alert.lastRun.status === "success" ? "success" : "danger"}>
              {alert.lastRun.status === "success" ? "Success" : "Failed"}
            </Badge>
          </Tooltip>
        ) : (
          <span className="text-mineshaft-500">—</span>
        )}
      </Td>
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
