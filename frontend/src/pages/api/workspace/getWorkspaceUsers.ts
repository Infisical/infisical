import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This route lets us get all the users in the workspace.
 * @param {string} workspaceId - workspace ID
 * @returns
 */
const getWorkspaceUsers = ({ workspaceId }: { workspaceId: string }) =>
  SecurityClient.fetchCall(`/v1/workspace/${workspaceId}/users`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res?.status === 200) {
      return (await res.json()).users;
    }
    console.log('Failed to get Project Users');
    return undefined;
  });

export default getWorkspaceUsers;
