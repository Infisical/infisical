import issueBackupPrivateKey from '~/pages/api/auth/IssueBackupPrivateKey';
import SRP1 from '~/pages/api/auth/SRP1';

import generateBackupPDF from '../generateBackupPDF';
import Aes256Gcm from './aes-256-gcm';

const nacl = require('tweetnacl');
nacl.util = require('tweetnacl-util');
const jsrp = require('jsrp');
const clientPassword = new jsrp.client();
const clientKey = new jsrp.client();
const crypto = require('crypto');

interface BackupKeyProps {
  email: string;
  password: string;
  personalName: string;
  setBackupKeyError: (value: boolean) => void;
  setBackupKeyIssued: (value: boolean) => void;
}

/**
 * This function issue a backup key for a user
 * @param {obkect} obj
 * @param {string} obj.email - email of a user issuing a backup key
 * @param {string} obj.password - password of a user issuing a backup key
 * @param {string} obj.personalName - name of a user issuing a backup key
 * @param {function} obj.setBackupKeyError - state function that turns true if there is an erorr with a backup key
 * @param {function} obj.setBackupKeyIssued - state function that turns true if a backup key was issued correctly
 * @returns
 */
const issueBackupKey = async ({
  email,
  password,
  personalName,
  setBackupKeyError,
  setBackupKeyIssued
}: BackupKeyProps) => {
  try {
    setBackupKeyError(false);
    setBackupKeyIssued(false);
    clientPassword.init(
      {
        username: email,
        password: password
      },
      async () => {
        const clientPublicKey = clientPassword.getPublicKey();

        let serverPublicKey, salt;
        try {
          const res = await SRP1({
            clientPublicKey: clientPublicKey
          });
          serverPublicKey = res.serverPublicKey;
          salt = res.salt;
        } catch (err) {
          setBackupKeyError(true);
          console.log('Wrong current password', err, 1);
        }

        clientPassword.setSalt(salt);
        clientPassword.setServerPublicKey(serverPublicKey);
        const clientProof = clientPassword.getProof(); // called M1

        const generatedKey = crypto.randomBytes(16).toString('hex');

        clientKey.init(
          {
            username: email,
            password: generatedKey
          },
          async () => {
            clientKey.createVerifier(
              async (err: any, result: { salt: string; verifier: string }) => {
                const { ciphertext, iv, tag } = Aes256Gcm.encrypt({
                  text: String(localStorage.getItem('PRIVATE_KEY')),
                  secret: generatedKey
                });

                const res = await issueBackupPrivateKey({
                  encryptedPrivateKey: ciphertext,
                  iv,
                  tag,
                  salt: result.salt,
                  verifier: result.verifier,
                  clientProof
                });

                if (res?.status == 400) {
                  setBackupKeyError(true);
                } else if (res?.status == 200) {
                  generateBackupPDF({
                    personalName,
                    personalEmail: email,
                    generatedKey
                  });
                  setBackupKeyIssued(true);
                }
              }
            );
          }
        );
      }
    );
  } catch (error) {
    setBackupKeyError(true);
    console.log('Failed to issue a backup key');
  }
  return true;
};

export default issueBackupKey;
