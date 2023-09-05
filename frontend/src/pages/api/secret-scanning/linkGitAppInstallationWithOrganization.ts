import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * Will create a new integration session and return it for the given org
 * @returns 
 */
export const linkGitAppInstallationWithOrganization = async (installationId: string, sessionId: string) => {
  try {
    const res = await SecurityClient.fetchCall("/api/v1/secret-scanning/link-installation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        installationId,
        sessionId,
      }),
    });

    if (res.ok) {
      return true;
    } 
      console.error("Failed to link installation to organization");
      console.error("Response:", res);
      return undefined;
    
  } catch (err) {
    console.error("Failed to link installation to organization:", err);
    return undefined;
  }
};