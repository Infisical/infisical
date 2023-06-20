/* eslint-disable new-cap */
import crypto from "crypto";

import jsrp from "jsrp";

import changePassword2 from "@app/pages/api/auth/ChangePassword2";
import SRP1 from "@app/pages/api/auth/SRP1";

import { saveTokenToLocalStorage } from "../saveTokenToLocalStorage";
import Aes256Gcm from "./aes-256-gcm";
import { deriveArgonKey } from "./crypto";

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
          console.log("Wrong current password", err, 1);
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

              const derivedKey = await deriveArgonKey({
                password: newPassword,
                salt: result.salt,
                mem: 65536,
                time: 3,
                parallelism: 1,
                hashLen: 32
              });
              
              if (!derivedKey) throw new Error("Failed to derive key from password");

              const key = crypto.randomBytes(32);

              // create encrypted private key by encrypting the private
              // key with the symmetric key [key]
              const {
                ciphertext: encryptedPrivateKey,
                iv: encryptedPrivateKeyIV,
                tag: encryptedPrivateKeyTag
              } = Aes256Gcm.encrypt({
                text: localStorage.getItem("PRIVATE_KEY") as string,
                secret: key
              });
              
              // create the protected key by encrypting the symmetric key
              // [key] with the derived key
              const {
                ciphertext: protectedKey,
                iv: protectedKeyIV,
                tag: protectedKeyTag
              } = Aes256Gcm.encrypt({
                text: key.toString("hex"),
                secret: Buffer.from(derivedKey.hash)
              });

              try {
                await changePassword2({
                  clientProof,
                  protectedKey,
                  protectedKeyIV,
                  protectedKeyTag,
                  encryptedPrivateKey,
                  encryptedPrivateKeyIV,
                  encryptedPrivateKeyTag,
                  salt: result.salt,
                  verifier: result.verifier
                });

                saveTokenToLocalStorage({
                  encryptedPrivateKey,
                  iv: encryptedPrivateKeyIV,
                  tag: encryptedPrivateKeyTag
                });

                setPasswordChanged(true);
                setCurrentPassword("");
                setNewPassword("");

                window.location.href = "/login";

                // move to login page
              } catch (error) {
                setCurrentPasswordError(true);
                console.log(error);
              }
            });
          }
        );
      }
    );
  } catch (error) {
    console.log("Something went wrong during changing the password");
  }
  return true;
};

export default changePassword;
