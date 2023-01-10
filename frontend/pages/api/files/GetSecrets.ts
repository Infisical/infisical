import SecurityClient from '~/utilities/SecurityClient';

/**
 * This function fetches the encrypted secrets for a certain project
 * @param {string} workspaceId - project is for which a user is trying to get secrets
 * @param {string} env - environment of a project for which a user is trying ot get secrets
 * @returns
 */
const getSecrets = async (workspaceId: string, env: string) => {
  return SecurityClient.fetchCall(
    '/api/v2/secrets?' +
      new URLSearchParams({
        environment: env,
        workspaceId
      }),
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return (await res.json()).secrets;
    } else {
      console.log('Failed to get project secrets');
    }
  });
};

export default getSecrets;
