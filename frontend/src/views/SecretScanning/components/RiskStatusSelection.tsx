import { FC, useEffect, useState } from "react";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { OrgPermissionCan } from "@app/components/permissions";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { useUpdateRiskStatus } from "@app/hooks/api";

import { RiskStatus } from "./types";

interface RiskStatusSelectionProps {
  riskId: string;
  currentSelection: RiskStatus;
}
  
export const RiskStatusSelection: FC<RiskStatusSelectionProps> = ({ riskId, currentSelection }) => {
  const [selectedRiskStatus, setSelectedRiskStatus] = useState<RiskStatus>(currentSelection);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { updateRiskStatus } = useUpdateRiskStatus();
  const { createNotification } = useNotificationContext();

  useEffect(() => {
    if (currentSelection !== selectedRiskStatus) {
      const updateSelection = async () => {
        try {
          setIsLoading(true);
          await updateRiskStatus(
            String(localStorage.getItem("orgData.id")),
            riskId,
            selectedRiskStatus
          );
          createNotification({
            text: "Successfully updated the selected risk status",
            type: "success"
          });
        } catch (err: any) {
          createNotification({
            text: "Failed to update the selected risk status",
            type: "error"
          });
        } finally {
          setIsLoading(false);
        }
      };
      updateSelection();
    }
  }, [selectedRiskStatus, currentSelection, riskId]);

  return (
    <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.SecretScanning}>
      {(isAllowed) => (
        <select
          disabled={!isAllowed || isLoading}
          value={selectedRiskStatus}
          onChange={(e) => setSelectedRiskStatus(e.target.value as RiskStatus)}
          className="block w-full py-2 px-3 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          <option value={RiskStatus.UNRESOLVED}>Unresolved</option>
          <option value={RiskStatus.RESOLVED_FALSE_POSITIVE}>This is a false positive, resolved</option>
          <option value={RiskStatus.RESOLVED_REVOKED}>I have rotated the secret, resolved</option>
          <option value={RiskStatus.RESOLVED_NOT_REVOKED}>No rotate needed, resolved</option>
        </select>
      )}
    </OrgPermissionCan>
  );
};