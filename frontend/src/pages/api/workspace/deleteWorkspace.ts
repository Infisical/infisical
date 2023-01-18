import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This route deletes a specified workspace.
 * @param {*} workspaceId
 * @returns
 */
const deleteWorkspace = (workspaceId: string) =>
  SecurityClient.fetchCall(`/api/v1/workspace/${workspaceId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res;
    }
    console.log('Failed to delete a project');
    return undefined;
  });

export default deleteWorkspace;
