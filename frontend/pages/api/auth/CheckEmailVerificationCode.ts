interface Props {
  email: string;
  code: string;
}

/**
 * This route check the verification code from the email that user just recieved
 * @param {object} obj
 * @param {string} obj.email
 * @param {string} obj.code
 * @returns
 */
const checkEmailVerificationCode = ({ email, code }: Props) => {
  return fetch('/api/v1/signup/email/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: email,
      code: code
    })
  });
};

export default checkEmailVerificationCode;
