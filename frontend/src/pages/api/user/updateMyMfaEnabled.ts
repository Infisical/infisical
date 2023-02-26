import SecurityClient from '@app/components/utilities/SecurityClient';

interface Props {
    isMfaEnabled: boolean;
}

/**
 * Update the user's MFA-enabled status to [isMfaEnabled]
 * @param {Object} obj
 * @param {Boolean} obj.isMfaEnabled - whether or not MFA status should be set to enabled or not
 * @returns {User} user - user with updated MFA-enabled status
 */
const updateMyMfaEnabled = async ({
    isMfaEnabled
}: Props) =>
  SecurityClient.fetchCall(`/api/v2/users/me/mfa`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      isMfaEnabled,
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).user;
    }
    console.log('Failed to update MFA status');
    return undefined;
  });

export default updateMyMfaEnabled;