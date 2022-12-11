import SecurityClient from '~/utilities/SecurityClient';

/**
 * This function adds a user to a project
 * @param {*} email
 * @param {*} workspaceId
 * @returns
 */
const addUserToWorkspace = (email: string, workspaceId: string) => {
  return SecurityClient.fetchCall(
    '/api/v1/workspace/' + workspaceId + '/invite-signup',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email
      })
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return await res.json();
    } else {
      console.log('Failed to add a user to project');
    }
  });
};

export default addUserToWorkspace;
