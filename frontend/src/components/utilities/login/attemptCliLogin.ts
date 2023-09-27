/* eslint-disable prefer-destructuring */
import jsrp from "jsrp";

import { login1, login2 } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { fetchMyOrganizationProjects } from "@app/hooks/api/users/queries";
import { MfaMethod } from "@app/hooks/api/users/types";
import KeyService from "@app/services/KeyService";

import { saveTokenToLocalStorage } from "../saveTokenToLocalStorage";
import SecurityClient from "../SecurityClient";
import Telemetry from "../telemetry/Telemetry";

// eslint-disable-next-line new-cap
const client = new jsrp.client();

interface IsCliLoginSuccessful {
    mfaEnabled: boolean;
    success: boolean;
    mfaMethods?: MfaMethod[];
    mfaPreference?: MfaMethod;
    loginResponse?: {
        email: string;
        privateKey: string;
        JTWToken: string;
    };
}

/**
 * Return whether or not login is successful for user with email [email]
 * and password [password]
 * @param {string} email - email of user to log in
 * @param {string} password - password of user to log in
 */
export const attemptCliLogin = async (
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
                        mfaMethods,
                        mfaPreference,
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
                    if (mfaEnabled) {
                        // case: MFA is enabled

                        // set temporary (MFA) JWT token
                        SecurityClient.setMfaToken(token);

                        resolve({
                            mfaEnabled: true,
                            success: true,
                            mfaMethods,
                            mfaPreference,
                        });
                    } else if (
                        !mfaEnabled &&
                        encryptionVersion &&
                        encryptedPrivateKey &&
                        iv &&
                        tag &&
                        token
                    ) {
                        // case: MFA is not enabled

                        // unset provider auth token in case it was used
                        SecurityClient.setProviderAuthToken("");
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
                            publicKey,
                            encryptedPrivateKey,
                            iv,
                            tag,
                            privateKey
                          });

                        const userOrgs = await fetchOrganizations();
                        const orgId = userOrgs[0]._id;
                        localStorage.setItem("orgData.id", orgId);

                        const orgUserProjects = await fetchMyOrganizationProjects(orgId);

                        if (orgUserProjects.length > 0) {
                            localStorage.setItem("projectData.id", orgUserProjects[0]._id);
                        }

                        if (email) {
                            telemetry.identify(email, email);
                            telemetry.capture("User Logged In");
                        }

                        resolve({
                            mfaEnabled: false,
                            loginResponse: {
                                email,
                                privateKey,
                                JTWToken: token
                            },
                            success: true
                        })

                    }
                } catch (err) {
                    reject(err);
                }
            }
        );
    });
};