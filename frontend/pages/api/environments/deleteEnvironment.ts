import SecurityClient from '~/utilities/SecurityClient';
/**
 * This route deletes a specified env.
 * @param {*} workspaceId
 * @returns
 */
const deleteEnvironment = (workspaceId: string, environmentSlug: string) => {
  return SecurityClient.fetchCall(
    `/api/v2/workspace/${workspaceId}/environments`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ environmentSlug }),
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return res;
    } else {
      console.log('Failed to delete environment');
    }
  });
};

export default deleteEnvironment;
