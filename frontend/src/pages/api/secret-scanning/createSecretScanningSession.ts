import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * Will create a new integration session and return it for the given org
 * @returns 
 */
const createNewIntegrationSession = (organizationId: string) =>
  SecurityClient.fetchCall(`/api/v1/secret-scanning/create-installation-session/organization/${organizationId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res.json();
    }
    console.log("Failed to create integration session");
    console.log("response", res)
    return undefined;
  });

export default createNewIntegrationSession;
