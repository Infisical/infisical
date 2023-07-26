import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * Will create a new integration session and return it for the given org
 * @returns 
 */
const getInstallationStatus = (organizationId: string) =>
  SecurityClient.fetchCall(`/api/v1/secret-scanning/installation-status/organization/${organizationId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).appInstallationComplete;
    }
    console.log("Failed to check installation status");
    console.log("response", res)
    return undefined;
  });

export default getInstallationStatus;
