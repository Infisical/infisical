import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This route lets us get all the projects of a certain user in an org.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const getOrganizationUserProjects = (req: { orgId: string }) =>
  SecurityClient.fetchCall(`/v1/organization/${req.orgId}/my-workspaces`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).workspaces;
    }
    console.log('Failed to get projects of a user in an org');
    return undefined;
  });

export default getOrganizationUserProjects;
