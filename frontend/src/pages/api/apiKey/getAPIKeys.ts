import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This route gets API keys for the user
 * @param {*} param0
 * @returns
 */
const getAPIKeys = () =>
  SecurityClient.fetchCall('/v2/api-key', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).apiKeyData;
    }
    console.log('Failed to get API keys');
    return undefined;
  });

export default getAPIKeys;
