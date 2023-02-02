import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This route lets us get all the users in an org.
 * @param {*} req
 * @param {*} res
 * @returns
 */

// TODO: this file is not used anywhere
const getOrganizationProjects = (req: { orgId: string }) =>
  SecurityClient.fetchCall(`/api/organization/${req.orgId}/workspaces`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).workspaces;
    }
    console.log('Failed to get projects for an org');
    return undefined;
  });

export default getOrganizationProjects;
