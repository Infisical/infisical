import { BACKEND_API_URL } from '../../../components/utilities/config';

interface Props {
  email: string;
  code: string;
}

/**
 * This route check the verification code from the email that user just received
 * @param {object} obj
 * @param {string} obj.email
 * @param {string} obj.code
 * @returns
 */
const checkEmailVerificationCode = ({ email, code }: Props) =>
  fetch(`${BACKEND_API_URL}/v1/signup/email/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      code
    })
  });

export default checkEmailVerificationCode;
