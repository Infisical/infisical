import { FC, useEffect, useState } from "react";

import { RiskStatus } from "@app/pages/api/secret-scanning/types";
import { updateRiskStatus } from "@app/pages/api/secret-scanning/updateRiskStatus";

interface RiskStatusSelectionProps {
  riskId: string;
  currentSelection: RiskStatus;
}

export const RiskStatusSelection: FC<RiskStatusSelectionProps> = ({ riskId, currentSelection }) => {
  const [selectedRiskStatus, setSelectedRiskStatus] = useState<RiskStatus>(currentSelection);

  useEffect(() => {
    if (currentSelection !== selectedRiskStatus) {
      const updateSelection = async () => {
        await updateRiskStatus(String(localStorage.getItem("orgData.id")), riskId, selectedRiskStatus);
      };
      updateSelection();
    }
  }, [selectedRiskStatus, currentSelection, riskId]);

  return (
    <select
      value={selectedRiskStatus}
      onChange={(e) => setSelectedRiskStatus(e.target.value as RiskStatus)}
      className="block w-full py-2 px-3 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
    >
      <option value={RiskStatus.UNRESOLVED}>Unresolved</option>
      <option value={RiskStatus.RESOLVED_FALSE_POSITIVE}>This is a false positive, resolved</option>
      <option value={RiskStatus.RESOLVED_REVOKED}>I have rotated the secret, resolved</option>
      <option value={RiskStatus.RESOLVED_NOT_REVOKED}>No rotate needed, resolved</option>
    </select>
  );
};