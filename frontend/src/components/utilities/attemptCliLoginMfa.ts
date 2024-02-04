/* eslint-disable prefer-destructuring */
import jsrp from "jsrp";

import { login1 , verifyMfaToken } from "@app/hooks/api/auth/queries";
import KeyService from "@app/services/KeyService";

import { saveTokenToLocalStorage } from "./saveTokenToLocalStorage";
import SecurityClient from "./SecurityClient";

// eslint-disable-next-line new-cap
const client = new jsrp.client();

interface IsMfaLoginSuccessful {
    success: boolean;
    loginResponse:{ 
        privateKey: string;
        JTWToken: string;
    }
}

/**
 * Return whether or not MFA-login is successful for user with email [email]
 * and MFA token [mfaToken]
 * @param {Object} obj
 * @param {String} obj.email - email of user
 * @param {String} obj.mfaToken - MFA code/token
 */
const attemptLoginMfa = async ({
    email,
    password,
    providerAuthToken,
    mfaToken
}: {
    email: string;
    password: string;
    providerAuthToken?: string,
    mfaToken: string;
}): Promise<IsMfaLoginSuccessful> => {
    return new Promise((resolve, reject) => {
        client.init({
            username: email,
            password
        }, async () => {
            try {
                const clientPublicKey = client.getPublicKey();
                const { salt } = await login1({
                    email,
                    clientPublicKey,
                    providerAuthToken,
                });

                const {
                    encryptionVersion,
                    protectedKey,
                    protectedKeyIV,
                    protectedKeyTag,
                    token,
                    publicKey,
                    encryptedPrivateKey,
                    iv,
                    tag
                } = await verifyMfaToken({
                    email,
                    mfaCode: mfaToken
                });

                // unset temporary (MFA) JWT token and set JWT token
                SecurityClient.setMfaToken("");
                SecurityClient.setToken(token);
                SecurityClient.setProviderAuthToken("");

                const privateKey = await KeyService.decryptPrivateKey({
                    encryptionVersion,
                    encryptedPrivateKey,
                    iv,
                    tag,
                    password,
                    salt,
                    protectedKey,
                    protectedKeyIV,
                    protectedKeyTag
                });

                saveTokenToLocalStorage({
                    publicKey,
                    encryptedPrivateKey,
                    iv,
                    tag,
                    privateKey
                });

                resolve({
                    success: true,
                    loginResponse:{
                        privateKey,
                        JTWToken: token
                    }
                });
            } catch (err) {
                reject(err);
            }
        });
    });
}

export default attemptLoginMfa;