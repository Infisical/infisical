import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This function removes a certain member from a certain organization
 * @param {*} membershipId
 * @returns
 */
const deleteUserFromOrganization = (membershipId: string) =>
  SecurityClient.fetchCall(`/v1/membership-org/${membershipId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res;
    }
    console.log('Failed to delete a user from an org');
    return undefined;
  });

export default deleteUserFromOrganization;
