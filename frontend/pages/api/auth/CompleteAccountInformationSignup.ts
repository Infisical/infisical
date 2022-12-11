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
 * @param {*} email
 * @param {*} firstName
 * @param {*} lastName
 * @param {*} workspace
 * @param {*} publicKey
 * @param {*} ciphertext
 * @param {*} iv
 * @param {*} tag
 * @param {*} salt
 * @param {*} verifier
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
