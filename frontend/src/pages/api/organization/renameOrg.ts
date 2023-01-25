import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This route lets us rename a certain org.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const renameOrg = (orgId: string, newOrgName: string) =>
  SecurityClient.fetchCall(`/v1/organization/${orgId}/name`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: newOrgName
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res;
    }
    console.log('Failed to rename an organization');
    return undefined;
  });

export default renameOrg;
