import SecurityClient from '~/utilities/SecurityClient';

/**
 * This route lets us get info about a certain org
 * @param {string} orgId - the organization ID
 * @returns
 */
const getOrganization = ({ orgId }: { orgId: string }) => {
  return SecurityClient.fetchCall('/api/v1/organization/' + orgId, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res?.status == 200) {
      return (await res.json()).organization;
    } else {
      console.log('Failed to get org info');
    }
  });
};

export default getOrganization;
