import SecurityClient from '~/utilities/SecurityClient';

interface Props {
  integrationAuthId: string;
}

const getIntegrationApps = ({ integrationAuthId }: Props) => {
  return SecurityClient.fetchCall(
    '/api/v1/integration-auth/' + integrationAuthId + '/apps',
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return (await res.json()).apps;
    } else {
      console.log('Failed to get available apps for an integration');
    }
  });
};

export default getIntegrationApps;
