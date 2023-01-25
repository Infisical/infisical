import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This route lets us get the public keys of everyone in your workspace.
 * @param {string} workspaceId
 * @returns
 */
const getWorkspaceKeys = ({ workspaceId }: { workspaceId: string }) =>
  SecurityClient.fetchCall(`/v1/workspace/${workspaceId}/keys`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res?.status === 200) {
      return (await res.json()).publicKeys;
    }
    console.log('Failed to get the public keys of everyone in the workspace');
    return undefined;
  });

export default getWorkspaceKeys;
