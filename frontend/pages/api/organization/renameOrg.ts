import SecurityClient from '~/utilities/SecurityClient';

/**
 * This route lets us rename a certain org.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const renameOrg = (orgId: string, newOrgName: string) => {
  return SecurityClient.fetchCall('/api/v1/organization/' + orgId + '/name', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: newOrgName
    })
  }).then(async (res) => {
    if (res && res.status == 200) {
      return res;
    } else {
      console.log('Failed to rename an organization');
    }
  });
};

export default renameOrg;
