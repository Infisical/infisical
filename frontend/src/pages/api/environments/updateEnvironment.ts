import SecurityClient from '~/utilities/SecurityClient';

type EnvironmentInfo = {
  oldEnvironmentSlug: string;
  environmentSlug: string;
  environmentName: string;
};

/**
 * This route updates a specified environment.
 * @param {*} workspaceId
 * @returns
 */
const updateEnvironment = (workspaceId: string, env: EnvironmentInfo) => {
  return SecurityClient.fetchCall(
    `/api/v2/workspace/${workspaceId}/environments`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(env),
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return res;
    } else {
      console.log('Failed to update environment');
    }
  });
};

export default updateEnvironment;
