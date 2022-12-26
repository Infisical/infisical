import SecurityClient from '~/utilities/SecurityClient';

/**
 * This function fetches the encrypted secrets from the .env file
 * @param {string} workspaceId - project is for which a user is trying to get secrets
 * @param {string} env - environment of a project for which a user is trying ot get secrets
 * @returns
 */
const getSecrets = async (workspaceId: string, env: string) => {
  return SecurityClient.fetchCall(
    '/api/v1/secret/' +
      workspaceId +
      '?' +
      new URLSearchParams({
        environment: env,
        channel: 'web'
      }),
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return await res.json();
    } else {
      console.log('Failed to get project secrets');
    }
  });
};

export default getSecrets;
