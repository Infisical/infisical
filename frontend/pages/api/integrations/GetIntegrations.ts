import SecurityClient from '~/utilities/SecurityClient';

const getIntegrations = () => {
  return SecurityClient.fetchCall('/api/v1/integration/integrations', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res && res.status == 200) {
      return (await res.json()).integrations;
    } else {
      console.log('Failed to get project integrations');
    }
  });
};

export default getIntegrations;
