interface Props {
  email: string;
  firstName: string;
  lastName: string;
  protectedKey: string;
  protectedKeyIV: string;
  protectedKeyTag: string;
  publicKey: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyIV: string;
  encryptedPrivateKeyTag: string;
  salt: string;
  verifier: string;
  token: string;
}

/**
 * This function is called in the end of the signup process.
 * It sends all the necessary nformation to the server.
 * @param {object} obj
 * @param {string} obj.email - email of the user completing signupinvite flow
 * @param {string} obj.firstName - first name of the user completing signupinvite flow
 * @param {string} obj.lastName - last name of the user completing signupinvite flow
 * @param {string} obj.publicKey - public key of the user completing signupinvite flow
 * @param {string} obj.ciphertext
 * @param {string} obj.iv
 * @param {string} obj.tag
 * @param {string} obj.salt
 * @param {string} obj.verifier
 * @param {string} obj.token - token that confirms a user's identity
 * @returns
 */
const completeAccountInformationSignupInvite = ({
  email,
  firstName,
  lastName,
  protectedKey,
  protectedKeyIV,
  protectedKeyTag,
  publicKey,
  encryptedPrivateKey,
  encryptedPrivateKeyIV,
  encryptedPrivateKeyTag,
  salt,
  verifier,
  token
}: Props) => fetch('/api/v2/signup/complete-account/invite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      email,
      firstName,
      lastName,
      protectedKey,
      protectedKeyIV,
      protectedKeyTag,
      publicKey,
      encryptedPrivateKey,
      encryptedPrivateKeyIV,
      encryptedPrivateKeyTag,
      salt,
      verifier
    })
  });

export default completeAccountInformationSignupInvite;
