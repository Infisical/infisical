import SecurityClient from '~/utilities/SecurityClient';

interface Props {
  encryptedPrivateKey: string;
  iv: string;
  tag: string;
  salt: string;
  verifier: string;
  clientProof: string;
}

/**
 * This is the second step of the change password process (pake)
 * @param {*} clientPublicKey
 * @returns
 */
const changePassword2 = ({
  encryptedPrivateKey,
  iv,
  tag,
  salt,
  verifier,
  clientProof
}: Props) => {
  return SecurityClient.fetchCall('/api/v1/password/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      clientProof: clientProof,
      encryptedPrivateKey: encryptedPrivateKey,
      iv: iv,
      tag: tag,
      salt: salt,
      verifier: verifier
    })
  }).then(async (res) => {
    if (res && res.status == 200) {
      return res;
    } else {
      console.log('Failed to change the password');
    }
  });
};

export default changePassword2;
