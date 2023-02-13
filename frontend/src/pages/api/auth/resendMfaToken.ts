import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * Send new MFA token to user with email [email]
 * @param {object} obj
 * @param {string} obj.email - email of user
 * @returns
 */
const resendMfaToken = async ({
    email, 
}: {
    email: string;
}) => SecurityClient.fetchCall('/api/v2/auth/mfa/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email
    })
  }).then(async (res) => {
    if (res && res?.status === 200) {
      return res.json();
    }
    console.log('Failed to send new MFA code');
    throw new Error('Something went wrong while sending new MFA code');
  });

export default resendMfaToken;
