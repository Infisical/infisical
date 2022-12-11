interface Props {
  email: string;
  firstName: string;
  lastName: string;
  publicKey: string;
  ciphertext: string;
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
 * @param {*} publicKey
 * @param {*} ciphertext
 * @param {*} iv
 * @param {*} tag
 * @param {*} salt
 * @param {*} verifier
 * @returns
 */
const completeAccountInformationSignupInvite = ({
  email,
  firstName,
  lastName,
  publicKey,
  ciphertext,
  iv,
  tag,
  salt,
  verifier,
  token
}: Props) => {
  return fetch('/api/v1/signup/complete-account/invite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify({
      email: email,
      firstName: firstName,
      lastName: lastName,
      publicKey: publicKey,
      encryptedPrivateKey: ciphertext,
      iv: iv,
      tag: tag,
      salt: salt,
      verifier: verifier
    })
  });
};

export default completeAccountInformationSignupInvite;
