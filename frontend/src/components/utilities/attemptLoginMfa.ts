/* eslint-disable prefer-destructuring */
import jsrp from 'jsrp';

import login1 from '@app/pages/api/auth/Login1';
import verifyMfaToken from '@app/pages/api/auth/verifyMfaToken';
import KeyService from '@app/services/KeyService';

import { saveTokenToLocalStorage } from './saveTokenToLocalStorage';
import SecurityClient from './SecurityClient';

// eslint-disable-next-line new-cap
const client = new jsrp.client();

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
    mfaToken
}: {
    email: string;
    password: string;
    mfaToken: string;
}): Promise<Boolean> => {
    return new Promise((resolve, reject) => {
        client.init({
            username: email,
            password
        }, async () => {
            try {
                const clientPublicKey = client.getPublicKey();
                const { salt } = await login1(email, clientPublicKey);
                
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
                    mfaToken
                });

                // set JWT token
                SecurityClient.setToken(token);

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
                    protectedKey,
                    protectedKeyIV,
                    protectedKeyTag,
                    publicKey,
                    encryptedPrivateKey,
                    iv,
                    tag,
                    privateKey
                });

                resolve(true);
            } catch (err) {
                reject(err);
            }
        });
    });
}

export default attemptLoginMfa;