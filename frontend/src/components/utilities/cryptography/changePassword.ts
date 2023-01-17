/* eslint-disable new-cap */
import changePassword2 from '@app/pages/api/auth/ChangePassword2';
import SRP1 from '@app/pages/api/auth/SRP1';
import jsrp from 'jsrp';

import Aes256Gcm from './aes-256-gcm';

const clientOldPassword = new jsrp.client();
const clientNewPassword = new jsrp.client();

/**
 * This function loggs in the user (whether it's right after signup, or a normal login)
 * @param {*} email
 * @param {*} password
 * @param {*} setErrorLogin
 * @param {*} router
 * @param {*} isSignUp
 * @returns
 */
const changePassword = async (
  email: string,
  currentPassword: string,
  newPassword: string,
  setCurrentPasswordError: (arg: boolean) => void,
  setPasswordChanged: (arg: boolean) => void,
  setCurrentPassword: (arg: string) => void,
  setNewPassword: (arg: string) => void
) => {
  try {
    setPasswordChanged(false);
    setCurrentPasswordError(false);

    clientOldPassword.init(
      {
        username: email,
        password: currentPassword
      },
      async () => {
        const clientPublicKey = clientOldPassword.getPublicKey();

        let serverPublicKey;
        let salt;
        try {
          const res = await SRP1({
            clientPublicKey
          });
          serverPublicKey = res.serverPublicKey;
          salt = res.salt;
        } catch (err) {
          setCurrentPasswordError(true);
          console.log('Wrong current password', err, 1);
        }

        clientOldPassword.setSalt(salt);
        clientOldPassword.setServerPublicKey(serverPublicKey);
        const clientProof = clientOldPassword.getProof(); // called M1

        clientNewPassword.init(
          {
            username: email,
            password: newPassword
          },
          async () => {
            clientNewPassword.createVerifier(async (err, result) => {
              // The Blob part here is needed to account for symbols that count as 2+ bytes (e.g., é, å, ø)
              const { ciphertext, iv, tag } = Aes256Gcm.encrypt({
                text: localStorage.getItem('PRIVATE_KEY') as string,
                secret: newPassword
                  .slice(0, 32)
                  .padStart(
                    32 + (newPassword.slice(0, 32).length - new Blob([newPassword]).size),
                    '0'
                  )
              });

              if (ciphertext) {
                localStorage.setItem('encryptedPrivateKey', ciphertext);
                localStorage.setItem('iv', iv);
                localStorage.setItem('tag', tag);

                let res;
                try {
                  res = await changePassword2({
                    encryptedPrivateKey: ciphertext,
                    iv,
                    tag,
                    salt: result.salt,
                    verifier: result.verifier,
                    clientProof
                  });
                  if (res && res.status === 400) {
                    setCurrentPasswordError(true);
                  } else if (res && res.status === 200) {
                    setPasswordChanged(true);
                    setCurrentPassword('');
                    setNewPassword('');
                  }
                } catch (error) {
                  setCurrentPasswordError(true);
                  console.log(error);
                }
              }
            });
          }
        );
      }
    );
  } catch (error) {
    console.log('Something went wrong during changing the password');
  }
  return true;
};

export default changePassword;
