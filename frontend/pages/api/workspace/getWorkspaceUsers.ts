import SecurityClient from '~/utilities/SecurityClient';

/**
 * This route lets us get all the users in the workspace.
 * @param {string} workspaceId - workspace ID
 * @returns
 */
const getWorkspaceUsers = ({ workspaceId }: { workspaceId: string }) => {
  return SecurityClient.fetchCall(
    '/api/v1/workspace/' + workspaceId + '/users',
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ).then(async (res) => {
    if (res?.status == 200) {
      return (await res.json()).users;
    } else {
      console.log('Failed to get Project Users');
    }
  });
};

export default getWorkspaceUsers;
