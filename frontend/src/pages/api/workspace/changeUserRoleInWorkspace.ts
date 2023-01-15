import SecurityClient from '~/utilities/SecurityClient';

/**
 * This function change the access of a user in a certain workspace
 * @param {*} membershipId
 * @param {*} role
 * @returns
 */
const changeUserRoleInWorkspace = (membershipId: string, role: string) => {
  return SecurityClient.fetchCall(
    '/api/v1/membership/' + membershipId + '/change-role',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: role
      })
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return res;
    } else {
      console.log('Failed to change the user role in a project');
    }
  });
};

export default changeUserRoleInWorkspace;
