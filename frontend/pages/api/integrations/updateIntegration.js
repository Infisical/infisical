import SecurityClient from "~/utilities/SecurityClient";

/**
 * This route starts the integration after teh default one if gonna set up.
 * Update integration with id [integrationId] to sync envars from the project's
 * [environment] to the integration [app] with active state [isActive]
 * @param {Object} obj
 * @param {String} obj.integrationId - id of integration
 * @param {String} obj.app - name of app 
 * @param {String} obj.environment - project environment to push secrets from
 * @param {Boolean} obj.isActive - active state
 * @returns
 */
const updateIntegration = ({ 
  integrationId, 
  app, 
  environment, 
  isActive 
}) => { 
  return SecurityClient.fetchCall(
    "/api/v1/integration/" + integrationId,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app,
        environment,
        isActive
      }),
    }
  ).then(async (res) => {
    if (res.status == 200) {
      return res;
    } else {
      console.log("Failed to start an integration");
    }
  });
};

export default updateIntegration;
