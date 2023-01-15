interface Props {
  email: string;
}

/**
 * This is the first of the account recovery step (a user needs to verify their email).
 * It will send an email containing a magic link to start the account recovery flow.
 * @param {object} obj
 * @param {object} obj.email - email of a user that is trying to recover access to their account
 * @returns
 */
const SendEmailOnPasswordReset = async ({ email }: Props) => {
  const response = await fetch('/api/v1/password/email/password-reset', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: email
    })
  });
  // need precise error handling about the status code
  if (response?.status === 200) {
    const data = await response.json();
    return data;
  }

  throw new Error(
    'Something went wrong while sending the email verification for password reset.'
  );
};

export default SendEmailOnPasswordReset;
