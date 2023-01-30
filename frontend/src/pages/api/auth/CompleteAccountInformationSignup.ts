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
  organizationName: string;
  salt: string;
  verifier: string;
  token: string;
}

/**
 * This function is called in the end of the signup process.
 * It sends all the necessary nformation to the server.
 * @param {object} obj
 * @param {string} obj.email - email of the user completing signup
 * @param {string} obj.firstName - first name of the user completing signup
 * @param {string} obj.lastName - last name of the user completing sign up
 * @param {string} obj.protectedKey - protected key in encryption version 2
 * @param {string} obj.protectedKeyIV - IV of protected key in encryption version 2
 * @param {string} obj.protectedKeyTag - tag of protected key in encryption version 2
 * @param {string} obj.organizationName - organization name for this user (usually, [FIRST_NAME]'s organization)
 * @param {string} obj.publicKey - public key of the user completing signup
 * @param {string} obj.ciphertext
 * @param {string} obj.iv
 * @param {string} obj.tag
 * @param {string} obj.salt
 * @param {string} obj.verifier
 * @param {string} obj.token - token that confirms a user's identity
 * @returns
 */
const completeAccountInformationSignup = ({
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
  token,
  organizationName
}: Props) => fetch('/api/v2/signup/complete-account/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${  token}`
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
      verifier,
      organizationName
    })
  });

export default completeAccountInformationSignup;
