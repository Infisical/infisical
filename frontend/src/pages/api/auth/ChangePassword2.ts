import SecurityClient from '@app/components/utilities/SecurityClient';

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
const changePassword2 = ({ encryptedPrivateKey, iv, tag, salt, verifier, clientProof }: Props) =>
  SecurityClient.fetchCall('/v1/password/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      clientProof,
      encryptedPrivateKey,
      iv,
      tag,
      salt,
      verifier
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res;
    }
    console.log('Failed to change the password');
    return undefined;
  });

export default changePassword2;
