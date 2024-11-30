/* eslint-disable new-cap */
import crypto from "crypto";

import jsrp from "jsrp";

import { issueBackupPrivateKey, srp1 } from "@app/hooks/api/auth/queries";

import generateBackupPDF from "../generateBackupPDF";
import Aes256Gcm from "./aes-256-gcm";

const ClientPassword = new jsrp.client(); 
const ClientKey = new jsrp.client();  

interface BackupKeyProps {
  email: string;
  password: string;
  personalName: string;
  setBackupKeyError: (value: boolean) => void;
  setBackupKeyIssued: (value: boolean) => void;
}

/**
 * This function issues a backup key for a user
 * @param {object} obj
 * @param {string} obj.email - email of a user issuing a backup key
 * @param {string} obj.password - password of a user issuing a backup key
 * @param {string} obj.personalName - name of a user issuing a backup key
 * @param {function} obj.setBackupKeyError - state function to indicate an error
 * @param {function} obj.setBackupKeyIssued - state function to indicate success
 * @returns {Promise<void>}
 */

const issueBackupKey = async ({
  email,
  password,
  personalName,
  setBackupKeyError,
  setBackupKeyIssued
}: BackupKeyProps): Promise<void> => {
  try {
    setBackupKeyError(false);
    setBackupKeyIssued(false);

    ClientPassword.init({ username: email, password }, async () => {
      const clientPublicKey = ClientPassword.getPublicKey();

      let serverPublicKey: string | undefined;
      let salt: string | undefined;

      try {
        const res = await srp1({ clientPublicKey });
        serverPublicKey = res.serverPublicKey;
        salt = res.salt;
      } catch (err) {
        setBackupKeyError(true);
        console.error("Error during SRP exchange:", err);
      }

      ClientPassword.setSalt(salt as string);
      ClientPassword.setServerPublicKey(serverPublicKey as string);
      const clientProof = ClientPassword.getProof(); // M1

      const generatedKey = crypto.randomBytes(16).toString("hex");

      ClientKey.init({ username: email, password: generatedKey }, async () => {
        try {
          ClientKey.createVerifier(async (createVerifierErr: any, result: { salt: string; verifier: string }) => {
            if (createVerifierErr) {
              setBackupKeyError(true);
              console.error("Error during verifier creation:", createVerifierErr);
            }

            const { ciphertext, iv, tag } = Aes256Gcm.encrypt({
              text: String(localStorage.getItem("PRIVATE_KEY")),
              secret: generatedKey
            });

            try {
              await issueBackupPrivateKey({
                encryptedPrivateKey: ciphertext,
                iv,
                tag,
                salt: result.salt,
                verifier: result.verifier,
                clientProof
              });

              await generateBackupPDF({
                personalName,
                personalEmail: email,
                generatedKey
              });

              setBackupKeyIssued(true);
            } catch (err) {
              setBackupKeyError(true);
              console.error("Error issuing backup private key:", err);
            }
          });
        } catch (err) {
          setBackupKeyError(true);
          console.error("Error creating verifier:", err);
        }
      });
    });
  } catch (error) {
    setBackupKeyError(true);
    console.error("Failed to issue a backup key:", error);
  }
};

export default issueBackupKey;
