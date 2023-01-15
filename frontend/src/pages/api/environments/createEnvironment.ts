import SecurityClient from '~/utilities/SecurityClient';

type NewEnvironmentInfo = {
  environmentSlug: string;
  environmentName: string;
};

/**
 * This route deletes a specified workspace.
 * @param {*} workspaceId
 * @returns
 */
const createEnvironment = (workspaceId:string, newEnv: NewEnvironmentInfo) => {
  return SecurityClient.fetchCall(`/api/v2/workspace/${workspaceId}/environments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(newEnv)
  }).then(async (res) => {
    if (res && res.status == 200) {
      return res;
    } else {
      console.log('Failed to create environment');
    }
  });
};

export default createEnvironment;
