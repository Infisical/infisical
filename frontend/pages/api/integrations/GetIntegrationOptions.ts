import SecurityClient from '~/utilities/SecurityClient';

const getIntegrationOptions = () => {
  return SecurityClient.fetchCall(
    '/api/v1/integration-auth/integration-options',
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return (await res.json()).integrationOptions;
    } else {
      console.log('Failed to get (cloud) integration options');
    }
  });
};

export default getIntegrationOptions;
