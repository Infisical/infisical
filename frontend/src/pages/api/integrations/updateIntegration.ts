import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * This route starts the integration after teh default one if gonna set up.
 * Update integration with id [integrationId] to sync envars from the project's
 * [environment] to the integration [app] with active state [isActive]
 * @param {Object} obj
 * @param {String} obj.integrationId - id of integration
 * @param {Boolean} obj.isActive - active state
 * @param {String} obj.environment - project environment to push secrets from
 * @param {String} obj.app - name of app
 * @param {String} obj.appId - (optional) app ID for integration
 * @param {String} obj.targetEnvironment - target environment for integration
 * @param {String} obj.owner - (optional) owner login of repo for GitHub integration
 * @returns
 */
const updateIntegration = ({
  integrationId,
  isActive,
  environment,
  app,
  appId,
  targetEnvironment,
  owner
}: {
  integrationId: string;
  isActive: boolean;
  environment: string;
  app: string;
  appId: string | null;
  targetEnvironment: string | null;
  owner: string | null;
}) =>
  SecurityClient.fetchCall(`/api/v1/integration/${integrationId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      app,
      environment,
      isActive,
      appId,
      targetEnvironment,
      owner
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).integration;
    }
    console.log("Failed to start an integration");
    return undefined;
  });

export default updateIntegration;
