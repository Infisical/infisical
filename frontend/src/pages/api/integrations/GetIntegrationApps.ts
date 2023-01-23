import SecurityClient from '@app/components/utilities/SecurityClient';

interface Props {
  integrationAuthId: string;
}

const getIntegrationApps = ({ integrationAuthId }: Props) =>
  SecurityClient.fetchCall(`/v1/integration-auth/${integrationAuthId}/apps`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).apps;
    }
    console.log('Failed to get available apps for an integration');
    return undefined;
  });

export default getIntegrationApps;
