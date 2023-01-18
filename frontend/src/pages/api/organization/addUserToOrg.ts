import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This function sends an email invite to a user to join an org
 * @param {*} email
 * @param {*} orgId
 * @returns
 */
const addUserToOrg = (email: string, orgId: string) =>
  SecurityClient.fetchCall('/api/v1/invite-org/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      inviteeEmail: email,
      organizationId: orgId
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res;
    }
    console.log('Failed to add a user to an org');
    return undefined;
  });

export default addUserToOrg;
