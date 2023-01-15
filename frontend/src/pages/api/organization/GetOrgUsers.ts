import SecurityClient from '~/utilities/SecurityClient';

export interface IMembershipOrg {
  _id: string;
  user: {
    email: string;
    firstName: string;
    lastName: string;
    _id: string;
    publicKey: string;
  };
  inviteEmail: string;
  organization: string;
  role: 'owner' | 'admin' | 'member';
  status: 'invited' | 'accepted';
}
/**
 * This route lets us get all the users in an org.
 * @param {object} obj
 * @param {string} obj.orgId - organization Id
 * @returns
 */
const getOrganizationUsers = ({
  orgId,
}: {
  orgId: string;
}): Promise<IMembershipOrg[]> => {
  return SecurityClient.fetchCall('/api/v1/organization/' + orgId + '/users', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  }).then(async (res) => {
    if (res?.status == 200) {
      return (await res.json()).users;
    } else {
      console.log('Failed to get org users');
    }
  });
};

export default getOrganizationUsers;
