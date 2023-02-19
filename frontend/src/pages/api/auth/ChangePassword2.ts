import SecurityClient from '@app/components/utilities/SecurityClient';

interface Props {
  clientProof: string;
  protectedKey: string;
  protectedKeyIV: string;
  protectedKeyTag: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyIV: string;
  encryptedPrivateKeyTag: string;
  salt: string;
  verifier: string;
}

/**
 * This is the second step of the change password process (pake)
 * @param {*} clientPublicKey
 * @returns
 */
const changePassword2 = ({
  clientProof,
  protectedKey,
  protectedKeyIV,
  protectedKeyTag,
  encryptedPrivateKey, 
  encryptedPrivateKeyIV, 
  encryptedPrivateKeyTag, 
  salt, 
  verifier
}: Props) =>
  SecurityClient.fetchCall('/api/v1/password/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      clientProof,
      protectedKey,
      protectedKeyIV,
      protectedKeyTag,
      encryptedPrivateKey,
      encryptedPrivateKeyIV,
      encryptedPrivateKeyTag,
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
