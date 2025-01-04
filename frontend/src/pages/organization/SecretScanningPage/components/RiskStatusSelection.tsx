import { useState } from "react";

import { OrgPermissionCan } from "@app/components/permissions";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useUpdateRiskStatus } from "@app/hooks/api/secretScanning";
import { RiskStatus } from "@app/hooks/api/secretScanning/types";

export const RiskStatusSelection = ({
  riskId,
  currentSelection
}: {
  riskId: any;
  currentSelection: any;
}) => {
  const [selectedRiskStatus, setSelectedRiskStatus] = useState(currentSelection);
  const { mutate: updateRiskStatus } = useUpdateRiskStatus();
  const { currentOrg } = useOrganization();
  const organizationId = currentOrg.id;

  return (
    <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.SecretScanning}>
      {(isAllowed) => (
        <select
          disabled={!isAllowed}
          value={selectedRiskStatus}
          onChange={(e) => {
            setSelectedRiskStatus(e.target.value);
            updateRiskStatus({
              organizationId,
              status: e.target.value as RiskStatus,
              riskId
            });
          }}
          className="block w-full rounded-md px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        >
          <option>Unresolved</option>
          <option value={RiskStatus.RESOLVED_FALSE_POSITIVE}>
            This is a false positive, resolved
          </option>
          <option value={RiskStatus.RESOLVED_REVOKED}>I have rotated the secret, resolved</option>
          <option value={RiskStatus.RESOLVED_NOT_REVOKED}>No rotate needed, resolved</option>
        </select>
      )}
    </OrgPermissionCan>
  );
};
