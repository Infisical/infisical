import { useEffect, useState } from "react";

import updateRiskStatus, { RiskStatus } from "@app/pages/api/secret-scanning/updateRiskStatus";

export const RiskStatusSelection = ({riskId, currentSelection}: {riskId: any, currentSelection: any }) => {
    const [selectedRiskStatus, setSelectedRiskStatus] = useState(currentSelection);
    useEffect(()=>{
        if (currentSelection !== selectedRiskStatus){
            const updateSelection = async () =>{ 
                await updateRiskStatus(String(localStorage.getItem("orgData.id")), riskId, selectedRiskStatus)
            }
            updateSelection()
        }
    },[selectedRiskStatus])

    return (
    <select
        value={selectedRiskStatus}
        onChange={(e) => setSelectedRiskStatus(e.target.value)}
        className="block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
    >
        <option>Unresolved</option>
        <option value={RiskStatus.RESOLVED_FALSE_POSITIVE}>This is a false positive</option>
        <option value={RiskStatus.RESOLVED_REVOKED}>I have rotated the secret, resolve risk</option>
        <option value={RiskStatus.RESOLVED_NOT_REVOKED}>No rotate needed, resolve</option>
    </select>         
    );
}