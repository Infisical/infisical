import SecurityClient from '~/utilities/SecurityClient';

/**
 * This route lets us get all the users in an org.
 * @param {object} obj
 * @param {string} obj.orgId - organization Id
 * @returns
 */
const getOrganizationUsers = ({ orgId }: { orgId: string }) => {
  return SecurityClient.fetchCall('/api/v1/organization/' + orgId + '/users', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res?.status == 200) {
      return (await res.json()).users;
    } else {
      console.log('Failed to get org users');
    }
  });
};

export default getOrganizationUsers;
