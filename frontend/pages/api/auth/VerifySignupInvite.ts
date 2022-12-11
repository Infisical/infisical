interface Props {
  email: string;
  code: string;
}

/**
 * This route verifies the signup invite link
 * @param {object} obj
 * @param {string} obj.email - email that a user is trying to verify
 * @param {string} obj.code - code that a user received to the abovementioned email
 * @returns
 */
const verifySignupInvite = ({ email, code }: Props) => {
  return fetch('/api/v1/invite-org/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      code
    })
  });
};

export default verifySignupInvite;
