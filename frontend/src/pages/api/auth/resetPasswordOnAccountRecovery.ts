interface Props {
  protectedKey: string;
  protectedKeyIV: string;
  protectedKeyTag: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyIV: string;
  encryptedPrivateKeyTag: string;
  salt: string;
  verifier: string;
  verificationToken: string;
}

/**
 * This is the route that resets the account password if all the previus steps were passed
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
  protectedKey,
  protectedKeyIV,
  protectedKeyTag,
  encryptedPrivateKey,
  encryptedPrivateKeyIV,
  encryptedPrivateKeyTag,
  salt,
  verifier,
  verificationToken,
}: Props) => fetch("/api/v1/password/password-reset", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${verificationToken}`
    },
    body: JSON.stringify({
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
    if (res?.status !== 200) {
      console.log("Failed to get the backup key");
    }
    return res;
  });

export default resetPasswordOnAccountRecovery;
