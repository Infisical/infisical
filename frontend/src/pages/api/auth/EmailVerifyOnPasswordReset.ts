interface Props {
  email: string;
  code: string;
}

/**
 * This is the second part of the account recovery step (a user needs to verify their email).
 * A user need to click on a button in a magic link page
 * @param {object} obj
 * @param {object} obj.email - email of a user that is trying to recover access to their account
 * @param {object} obj.code - token that a use received via the magic link
 * @returns
 */
const EmailVerifyOnPasswordReset = async ({ email, code }: Props) => {
  const response = await fetch('/api/v1/password/email/password-reset-verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: email,
      code: code
    })
  });
  if (response?.status === 200) {
    return response;
  }

  throw new Error(
    'Something went wrong during email verification on password reset.'
  );
};

export default EmailVerifyOnPasswordReset;
