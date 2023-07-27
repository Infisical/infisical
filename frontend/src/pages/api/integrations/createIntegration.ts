import SecurityClient from "@app/components/utilities/SecurityClient";

interface Props {
  integrationAuthId: string;
  isActive: boolean;
  secretPath: string;
  app: string | null;
  appId: string | null;
  sourceEnvironment: string;
  targetEnvironment: string | null;
  targetEnvironmentId: string | null;
  targetService: string | null;
  targetServiceId: string | null;
  owner: string | null;
  path: string | null;
  region: string | null;
}
/**
 * This route creates a new integration based on the integration authorization with id [integrationAuthId]
 * @param {Object} obj
 * @param {String} obj.accessToken - id of integration authorization for which to create the integration
 * @returns
 */
const createIntegration = ({
  integrationAuthId,
  isActive,
  app,
  appId,
  sourceEnvironment,
  targetEnvironment,
  targetEnvironmentId,
  targetService,
  targetServiceId,
  owner,
  path,
  region,
  secretPath,
}: Props) =>
  SecurityClient.fetchCall("/api/v1/integration", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      integrationAuthId,
      isActive,
      app,
      appId,
      sourceEnvironment,
      targetEnvironment,
      targetEnvironmentId,
      targetService,
      targetServiceId,
      owner,
      path,
      region,
      secretPath,
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).integration;
    }
    console.log("Failed to create integration");
    return undefined;
  });

export default createIntegration;
