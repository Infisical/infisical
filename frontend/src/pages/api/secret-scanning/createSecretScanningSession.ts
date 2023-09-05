import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * Will create a new integration session and return it for the given org
 * @returns 
 */
export const createSecretScanningSession = async (organizationId: string) => {
  try {
    const res = await SecurityClient.fetchCall(`/api/v1/secret-scanning/create-installation-session/organization/${organizationId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    } 
      console.error("Failed to create integration session");
      console.error("Response:", res);
      return undefined;
    
  } catch (err) {
    console.error("Failed to create integration session:", err);
    return undefined;
  }
};