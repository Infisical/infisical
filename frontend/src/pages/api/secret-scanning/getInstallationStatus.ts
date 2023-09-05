import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * Will create a new integration session and return it for the given org
 * @returns 
 */
export const getInstallationStatus = async (organizationId: string) => {
  try {
    const res = await SecurityClient.fetchCall(`/api/v1/secret-scanning/installation-status/organization/${organizationId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      const data = (await res.json()).appInstallationComplete;
      return data;
    } 
      console.error("Failed to check installation status");
      console.error("Response:", res);
      return undefined;
    
  } catch (err) {
    console.error("Failed to check installation status:", err);
    return undefined;
  }
};