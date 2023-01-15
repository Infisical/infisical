import SecurityClient from '~/utilities/SecurityClient';

interface Props {
  integrationId: string;
  appName: string;
  environment: string;
}

/**
 * This route starts the integration after teh default one if gonna set up.
 * @param {*} integrationId
 * @returns
 */
const startIntegration = ({ integrationId, appName, environment }: Props) => {
  return SecurityClient.fetchCall('/api/v1/integration/' + integrationId, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      update: {
        app: appName,
        environment,
        isActive: true
      }
    })
  }).then(async (res) => {
    if (res && res.status == 200) {
      return res;
    } else {
      console.log('Failed to start an integration');
    }
  });
};

export default startIntegration;
