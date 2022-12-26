interface Props {
  email: string;
  firstName: string;
  lastName: string;
  publicKey: string;
  ciphertext: string;
  organizationName: string;
  iv: string;
  tag: string;
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
  organizationName,
  publicKey,
  ciphertext,
  iv,
  tag,
  salt,
  verifier,
  token
}: Props) => {
  return fetch('/api/v1/signup/complete-account/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify({
      email,
      firstName,
      lastName,
      publicKey,
      encryptedPrivateKey: ciphertext,
      organizationName,
      iv,
      tag,
      salt,
      verifier
    })
  });
};

export default completeAccountInformationSignup;
