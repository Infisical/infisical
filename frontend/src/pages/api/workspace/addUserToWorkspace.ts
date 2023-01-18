import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This function adds a user to a project
 * @param {*} email
 * @param {*} workspaceId
 * @returns
 */
const addUserToWorkspace = (email: string, workspaceId: string) =>
  SecurityClient.fetchCall(`/api/v1/workspace/${workspaceId}/invite-signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res.json();
    }
    console.log('Failed to add a user to project');
    return undefined;
  });

export default addUserToWorkspace;
