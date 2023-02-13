import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * Verify MFA token [mfaToken] for user with email [email]
 * @param {object} obj
 * @param {string} obj.email - email of user
 * @param {string} obj.mfaToken - MFA cod/token to verify
 * @returns
 */
const verifyMfaToken = async ({
    email, 
    mfaToken
}: {
    email: string;
    mfaToken: string;
}) => SecurityClient.fetchCall('/api/v2/auth/mfa/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      mfaToken
    })
  }).then(async (res) => {
    if (res && res?.status === 200) {
      return res.json();
    }
    console.log('Failed to verify MFA code');
    throw new Error('Something went wrong during MFA code verification');
  });



export default verifyMfaToken;
