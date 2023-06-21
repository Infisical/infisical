import SecurityClient from "@app/components/utilities/SecurityClient";

const getIntegrationOptions = () =>
  SecurityClient.fetchCall("/api/v1/integration-auth/integration-options", {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).integrationOptions;
    }
    console.log("Failed to get (cloud) integration options");
    return undefined;
  });

export default getIntegrationOptions;
