import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This route lets us change the auto capitalization settings in a project.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const toggleAutoCapitalization = (workspaceId: string, state: boolean) =>
  SecurityClient.fetchCall(`/api/v2/workspace/${workspaceId}/settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      autoCapitalization: state
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res;
    }
    console.log('Failed to toggle auto capitalization state');
    return undefined;
  });

export default toggleAutoCapitalization;
