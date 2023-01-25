import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This function removes a certain member from a certain workspace
 * @param {*} membershipId
 * @returns
 */
const deleteUserFromWorkspace = (membershipId: string) =>
  SecurityClient.fetchCall(`/v1/membership/${membershipId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res;
    }
    console.log('Failed to delete a user from a project');
    return undefined;
  });

export default deleteUserFromWorkspace;
