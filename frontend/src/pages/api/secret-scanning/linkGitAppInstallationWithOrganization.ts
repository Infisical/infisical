import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * Will create a new integration session and return it for the given org
 * @returns 
 */
const linkGitAppInstallationWithOrganization = (installationId: string, sessionId: string) =>
  SecurityClient.fetchCall("/api/v1/secret-scanning/link-installation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      installationId,
      sessionId
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return true
    }
    console.log("Failed to link installation to organization");
    return undefined;
  });

export default linkGitAppInstallationWithOrganization;
