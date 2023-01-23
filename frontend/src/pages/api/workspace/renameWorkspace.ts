import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This route lets us rename a certain workspace.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const renameWorkspace = (workspaceId: string, newWorkspaceName: string) =>
  SecurityClient.fetchCall(`/v1/workspace/${workspaceId}/name`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: newWorkspaceName
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res;
    }
    console.log('Failed to rename a project');
    return undefined;
  });

export default renameWorkspace;
