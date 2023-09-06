import SecurityClient from "@app/components/utilities/SecurityClient";

import { GitRisks } from "./types";

/**
 * Will create a new integration session and return it for the given org
 * @returns 
 */
export const getRisksByOrganization = async (organizationId: string): Promise<GitRisks[]> => {
  try {
    const res = await SecurityClient.fetchCall(`/api/v1/secret-scanning/organization/${organizationId}/risks`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      const data = (await res.json()).risks;
      return data;
    } 
      console.error("Failed to fetch risks");
      console.error("Response:", res);
      return [];
    
  } catch (err) {
    console.error("Failed to fetch risks:", err);
    return [];
  }
};