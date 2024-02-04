import SecurityClient from "@app/components/utilities/SecurityClient";

export enum RiskStatus {
  RESOLVED_FALSE_POSITIVE = "RESOLVED_FALSE_POSITIVE",
  RESOLVED_REVOKED = "RESOLVED_REVOKED",
  RESOLVED_NOT_REVOKED = "RESOLVED_NOT_REVOKED",
  UNRESOLVED = "UNRESOLVED",
}



/**
 * Will create a new integration session and return it for the given org
 * @returns 
 */
const updateRiskStatus = (organizationId: string, riskId: string, status: RiskStatus) =>
  SecurityClient.fetchCall(`/api/v1/secret-scanning/organization/${organizationId}/risks/${riskId}/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      status
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res.json();
    }
    console.log("Failed to link installation to organization");
    return undefined;
  });

export default updateRiskStatus;
