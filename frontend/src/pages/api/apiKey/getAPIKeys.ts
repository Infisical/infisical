import SecurityClient from '~/utilities/SecurityClient';

/**
 * This route gets API keys for the user
 * @param {*} param0
 * @returns
 */
const getAPIKeys = () => {
  return SecurityClient.fetchCall(
    '/api/v2/api-key',
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
        return (await res.json()).apiKeyData;
    } else {
      console.log('Failed to get API keys');
    }
  });
};

export default getAPIKeys;
