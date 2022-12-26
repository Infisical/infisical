import SecurityClient from '~/utilities/SecurityClient';

/**
 * This route gets service tokens for a specific user in a project
 * @param {*} param0
 * @returns
 */
const getServiceTokens = ({ workspaceId }: { workspaceId: string }) => {
  return SecurityClient.fetchCall(
    '/api/v1/workspace/' + workspaceId + '/service-tokens',
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return (await res.json()).serviceTokens;
    } else {
      console.log('Failed to get service tokens');
    }
  });
};

export default getServiceTokens;
