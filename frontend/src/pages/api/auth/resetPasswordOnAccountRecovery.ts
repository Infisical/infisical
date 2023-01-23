import { BACKEND_API_URL } from '../../../components/utilities/config';

interface Props {
  verificationToken: string;
  encryptedPrivateKey: string;
  iv: string;
  tag: string;
  salt: string;
  verifier: string;
}

/**
 * This is the route that resets the account password if all the previous steps were passed
 * @param {object} obj
 * @param {object} obj.verificationToken - this is the token that confirms that a user is the right one
 * @param {object} obj.encryptedPrivateKey - the new encrypted private key (encrypted using the new password)
 * @param {object} obj.iv
 * @param {object} obj.tag
 * @param {object} obj.salt
 * @param {object} obj.verifier
 * @returns
 */
const resetPasswordOnAccountRecovery = ({
  verificationToken,
  encryptedPrivateKey,
  iv,
  tag,
  salt,
  verifier
}: Props) =>
  fetch(`${BACKEND_API_URL}/v1/password/password-reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${verificationToken}`
    },
    body: JSON.stringify({
      encryptedPrivateKey,
      iv,
      tag,
      salt,
      verifier
    })
  }).then(async (res) => {
    if (res?.status !== 200) {
      console.log('Failed to get the backup key');
    }
    return res;
  });

export default resetPasswordOnAccountRecovery;
