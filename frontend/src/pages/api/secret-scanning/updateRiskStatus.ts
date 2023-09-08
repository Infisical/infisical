import SecurityClient from "@app/components/utilities/SecurityClient";

import { RiskStatus } from "./types";

/**
 * Will create a new integration session and return it for the given org
 * @returns 
 */
export const updateRiskStatus = async (organizationId: string, riskId: string, status: RiskStatus) => {
  try {
    const res = await SecurityClient.fetchCall(`/api/v1/secret-scanning/organization/${organizationId}/risks/${riskId}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    } 
      console.log("Failed to update risk status");
      console.log("Response:", res);
      return undefined;
    
  } catch (err) {
    console.error("Failed to update risk status:", err);
    return undefined;
  }
};