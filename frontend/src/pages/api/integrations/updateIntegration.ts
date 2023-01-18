import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This route starts the integration after teh default one if gonna set up.
 * Update integration with id [integrationId] to sync envars from the project's
 * [environment] to the integration [app] with active state [isActive]
 * @param {Object} obj
 * @param {String} obj.integrationId - id of integration
 * @param {String} obj.app - name of app
 * @param {String} obj.environment - project environment to push secrets from
 * @param {Boolean} obj.isActive - active state
 * @param {String} obj.target - (optional) target (environment) for Vercel integration
 * @param {String} obj.context - (optional) context (environment) for Netlify integration
 * @param {String} obj.siteId - (optional) app (site_id) for Netlify integration
 * @param {String} obj.owner - (optional) owner login of repo for GitHub integration
 * @returns
 */
const updateIntegration = ({
  integrationId,
  app,
  environment,
  isActive,
  target,
  context,
  siteId,
  owner
}: {
  integrationId: string;
  app: string;
  environment: string;
  isActive: boolean;
  target: string | null;
  context: string | null;
  siteId: string | null;
  owner: string | null;
}) =>
  SecurityClient.fetchCall(`/api/v1/integration/${integrationId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      app,
      environment,
      isActive,
      target,
      context,
      siteId,
      owner
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res;
    }
    console.log('Failed to start an integration');
    return undefined;
  });

export default updateIntegration;
