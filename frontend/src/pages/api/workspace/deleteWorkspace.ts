import SecurityClient from '~/utilities/SecurityClient';

/**
 * This route deletes a specified workspace.
 * @param {*} workspaceId
 * @returns
 */
const deleteWorkspace = (workspaceId: string) => {
  return SecurityClient.fetchCall('/api/v1/workspace/' + workspaceId, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res && res.status == 200) {
      return res;
    } else {
      console.log('Failed to delete a project');
    }
  });
};

export default deleteWorkspace;
