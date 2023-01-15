import SecurityClient from '~/utilities/SecurityClient';

/**
 * This route lets us get all the projects of a certain user in an org.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const getOrganizationUserProjects = (req: { orgId: string }) => {
  return SecurityClient.fetchCall(
    '/api/v1/organization/' + req.orgId + '/my-workspaces',
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return (await res.json()).workspaces;
    } else {
      console.log('Failed to get projects of a user in an org');
    }
  });
};

export default getOrganizationUserProjects;
