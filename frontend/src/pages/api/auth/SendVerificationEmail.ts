import { BACKEND_API_URL } from '~/components/utilities/config';

/**
 * This route send the verification email to the user's email (contains a 6-digit verification code)
 * @param {*} email
 */
const sendVerificationEmail = (email: string) => {
  fetch(`${BACKEND_API_URL}/v1/signup/email/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email
    })
  });
};

export default sendVerificationEmail;
