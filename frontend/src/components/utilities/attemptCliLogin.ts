/* eslint-disable prefer-destructuring */
import jsrp from 'jsrp';

import login1 from '@app/pages/api/auth/Login1';
import login2 from '@app/pages/api/auth/Login2';
import getOrganizations from '@app/pages/api/organization/getOrgs';
import getOrganizationUserProjects from '@app/pages/api/organization/GetOrgUserProjects';
import KeyService from '@app/services/KeyService';

import Telemetry from './telemetry/Telemetry';
import { saveTokenToLocalStorage } from './saveTokenToLocalStorage';
import SecurityClient from './SecurityClient';

// eslint-disable-next-line new-cap
const client = new jsrp.client();

interface IsCliLoginSuccessful {
    loginResponse: {
        loginOneResponse: {
            serverPublicKey: string;
            salt: string;
        };
        loginTwoResponse: {
            mfaEnabled: boolean;
            token: string;
            encryptionVersion?: number;
            protectedKey?: string;
            protectedKeyIV?: string;
            protectedKeyTag?: string;
            publicKey?: string;
            encryptedPrivateKey?: string;
            iv?: string;
            tag?: string;
        };
    };
    success: boolean;
}

/**
 * Return whether or not login is successful for user with email [email]
 * and password [password]
 * @param {string} email - email of user to log in
 * @param {string} password - password of user to log in
 */
const attemptLogin = async (
    {
        email,
        password,
        providerAuthToken,
    }: {
        email: string;
        password: string;
        providerAuthToken?: string;
    }
): Promise<IsCliLoginSuccessful> => {

    const telemetry = new Telemetry().getInstance();
    return new Promise((resolve, reject) => {
        client.init(
            {
                username: email,
                password
            },
            async () => {
                try {
                    const clientPublicKey = client.getPublicKey();
                    const { serverPublicKey, salt } = await login1({
                        email,
                        clientPublicKey,
                        providerAuthToken,
                    });

                    client.setSalt(salt);
                    client.setServerPublicKey(serverPublicKey);
                    const clientProof = client.getProof(); // called M1

                    const {
                        mfaEnabled,
                        encryptionVersion,
                        protectedKey,
                        protectedKeyIV,
                        protectedKeyTag,
                        token,
                        publicKey,
                        encryptedPrivateKey,
                        iv,
                        tag
                    } = await login2(
                        {
                            email,
                            clientProof,
                            providerAuthToken,
                        }
                    );

                    resolve({
                        loginResponse: {
                            loginOneResponse: { serverPublicKey, salt },
                            loginTwoResponse: {
                                mfaEnabled,
                                encryptionVersion,
                                protectedKey,
                                protectedKeyIV,
                                protectedKeyTag,
                                token,
                                publicKey,
                                encryptedPrivateKey,
                                iv,
                                tag
                            }
                        },
                        success: true
                    })


                } catch (err) {
                    reject(err);
                }
            }
        );
    });
};

export default attemptLogin;
