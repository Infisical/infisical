import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This function change the access of a user in a certain organization
 * @param {string} organizationId
 * @param {string} membershipId
 * @param {string} role
 * @returns
 */
const changeUserRoleInOrganization = (organizationId: string, membershipId: string, role: string) =>
  SecurityClient.fetchCall(`/api/v2/organizations/${organizationId}/memberships/${membershipId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      role
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res;
    }
    console.log('Failed to change the user role in an org');
    return undefined;
  });

export default changeUserRoleInOrganization;
