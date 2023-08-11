/* eslint-disable new-cap */
import crypto from "crypto";

import jsrp from "jsrp";

import {
changePassword,
    srp1} from "@app/hooks/api/auth/queries";

import Aes256Gcm from "./cryptography/aes-256-gcm";
import { deriveArgonKey } from "./cryptography/crypto";
import { saveTokenToLocalStorage } from "./saveTokenToLocalStorage";

const clientOldPassword = new jsrp.client();
const clientNewPassword = new jsrp.client();

type Params = {
    email: string;
    currentPassword: string;
    newPassword: string;
}

const attemptChangePassword = ({ email, currentPassword, newPassword }: Params): Promise<void> => {
    return new Promise((resolve, reject) => {
        clientOldPassword.init({ username: email, password: currentPassword }, async () => {
            let serverPublicKey; let salt;

            try {
                const clientPublicKey = clientOldPassword.getPublicKey();

                const res = await srp1({ clientPublicKey });

                serverPublicKey = res.serverPublicKey;
                salt = res.salt;

                clientOldPassword.setSalt(salt);
                clientOldPassword.setServerPublicKey(serverPublicKey);

                const clientProof = clientOldPassword.getProof();

                clientNewPassword.init({ username: email, password: newPassword }, async () => {
                    clientNewPassword.createVerifier(async (err, result) => {
                        try {
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

                            const {
                                ciphertext: encryptedPrivateKey,
                                iv: encryptedPrivateKeyIV,
                                tag: encryptedPrivateKeyTag
                            } = Aes256Gcm.encrypt({
                                text: localStorage.getItem("PRIVATE_KEY") as string,
                                secret: key
                            });

                            const {
                                ciphertext: protectedKey,
                                iv: protectedKeyIV,
                                tag: protectedKeyTag
                            } = Aes256Gcm.encrypt({
                                text: key.toString("hex"),
                                secret: Buffer.from(derivedKey.hash)
                            });

                            await changePassword({
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

                            resolve();
                        } catch (err2) {
                            console.error(err2);
                            reject(err2);
                        }

                    });
                });
            } catch (err) {
                console.error(err);
                reject(err);
            }
        });
    });
}

export default attemptChangePassword;